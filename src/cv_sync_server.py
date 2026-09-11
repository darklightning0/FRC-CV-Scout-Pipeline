#!/usr/bin/env python3
"""
cv_sync_server.py — Public-style CV API (same idea as TBA: clients poll HTTPS)

Serves / pulls AI scout bundles. Expose this URL to the internet (Cloudflare Tunnel,
ngrok, Fly.io, VPS) so scouts in another country can poll it like TBA.

  # Laptop or VPS
  export CV_SYNC_API_KEY='pick-a-secret'
  python src/cv_sync_server.py --port 8765

  # Optional: cloudflared tunnel --url http://localhost:8765
  # Tablets use the https://….trycloudflare.com URL as the CV API base.

Write API (watcher / laptop):
  POST /api/cv/publish/<event>/<match_key>
  Header: X-CV-Sync-Key: <CV_SYNC_API_KEY>
  Body: ai_scout_bundle JSON

Read API (Maneuver tablets — no key needed):
  GET /api/cv/index?event=<event_key>
  GET /api/cv/bundle/<event>/<match_key>
  GET /api/cv/heatmap/<event>/<match_key>/<team>
  GET /health
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SYNC_ROOT = PROJECT_ROOT / "outputs" / "cv-sync"
API_KEY = os.environ.get("CV_SYNC_API_KEY", "").strip()


def _cors(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-CV-Sync-Key")


def _update_index(event_key: str, match_key: str, bundle: dict[str, Any]) -> None:
    event_dir = SYNC_ROOT / event_key.lower()
    event_dir.mkdir(parents=True, exist_ok=True)
    index_path = event_dir / "index.json"

    teams = sorted(
        set(str(t) for t in (bundle.get("red_teams") or []))
        | set(str(t) for t in (bundle.get("blue_teams") or []))
        | set(str(t) for t in (bundle.get("teams_telemetry") or {}).keys())
    )
    processed_at = bundle.get("processed_at") or datetime.now(timezone.utc).isoformat()

    index: dict[str, Any] = {"event_key": event_key.lower(), "updated_at": processed_at, "matches": []}
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text())
        except Exception:
            pass

    matches = [m for m in index.get("matches", []) if m.get("match_key") != match_key]
    matches.append(
        {
            "match_key": match_key,
            "teams": teams,
            "processed_at": processed_at,
            "bundle_path": f"{match_key}/ai_scout_bundle.json",
        }
    )
    matches.sort(key=lambda m: m.get("match_key", ""))
    index["event_key"] = event_key.lower()
    index["updated_at"] = datetime.now(timezone.utc).isoformat()
    index["matches"] = matches
    index_path.write_text(json.dumps(index, indent=2))


class CvSyncHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[cv-sync] {self.address_string()} — {fmt % args}")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        _cors(self)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)

        if path in ("/", "/health"):
            return self._json(
                200,
                {
                    "ok": True,
                    "service": "robotdetector-cv-api",
                    "write_auth_required": bool(API_KEY),
                },
            )

        if path == "/api/cv/events":
            events = []
            if SYNC_ROOT.exists():
                for p in sorted(SYNC_ROOT.iterdir()):
                    if p.is_dir() and (p / "index.json").exists():
                        events.append(p.name)
            return self._json(200, {"events": events})

        if path == "/api/cv/index":
            event_key = (qs.get("event") or [None])[0]
            if not event_key:
                return self._json(400, {"error": "Missing ?event=EVENT_KEY"})
            index_path = SYNC_ROOT / event_key.lower() / "index.json"
            if not index_path.exists():
                return self._json(404, {"error": f"No CV data for event {event_key}", "matches": []})
            return self._bytes(200, index_path.read_bytes(), "application/json")

        if path.startswith("/api/cv/bundle/"):
            parts = path.split("/")
            if len(parts) < 6:
                return self._json(400, {"error": "Use /api/cv/bundle/<event>/<match_key>"})
            event_key, match_key = parts[4], parts[5]
            bundle = SYNC_ROOT / event_key.lower() / match_key / "ai_scout_bundle.json"
            if not bundle.exists():
                return self._json(404, {"error": "Bundle not found"})
            return self._bytes(200, bundle.read_bytes(), "application/json")

        if path.startswith("/api/cv/heatmap/"):
            # /api/cv/heatmap/<event>/<match_key>/<team>
            parts = path.split("/")
            if len(parts) < 7:
                return self._json(400, {"error": "Use /api/cv/heatmap/<event>/<match>/<team>"})
            event_key, match_key, team = parts[4], parts[5], parts[6]
            heat_dir = SYNC_ROOT / event_key.lower() / match_key / "heatmaps"
            candidates = list(heat_dir.glob(f"*_team_{team}_heatmap.png")) if heat_dir.is_dir() else []
            if not candidates:
                candidates = list(heat_dir.glob(f"*{team}*heatmap*.png")) if heat_dir.is_dir() else []
            if not candidates:
                return self._json(404, {"error": "Heatmap not found"})
            return self._bytes(200, candidates[0].read_bytes(), "image/png")

        if path.startswith("/files/"):
            rel = path[len("/files/") :]
            file_path = (SYNC_ROOT / rel).resolve()
            if not str(file_path).startswith(str(SYNC_ROOT.resolve())):
                return self._json(403, {"error": "Forbidden"})
            if not file_path.is_file():
                return self._json(404, {"error": "Not found"})
            ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            return self._bytes(200, file_path.read_bytes(), ctype)

        return self._json(404, {"error": "Unknown route", "hint": "GET /api/cv/index?event=YOUR_EVENT"})

    def do_POST(self) -> None:
        """Publish bundle or heatmap."""
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        parts = path.split("/")

        if API_KEY:
            provided = self.headers.get("X-CV-Sync-Key", "")
            if provided != API_KEY:
                return self._json(401, {"error": "Invalid or missing X-CV-Sync-Key"})

        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 50_000_000:
            return self._json(400, {"error": "Invalid Content-Length"})
        raw = self.rfile.read(length)

        # POST /api/cv/heatmap/<event>/<match>/<team>
        if len(parts) == 7 and parts[1:4] == ["api", "cv", "heatmap"]:
            event_key, match_key, team = parts[4], parts[5], parts[6]
            dest_dir = SYNC_ROOT / event_key.lower() / match_key / "heatmaps"
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{match_key}_team_{team}_heatmap.png"
            dest.write_bytes(raw)
            return self._json(200, {"ok": True, "team": team, "match_key": match_key})

        if len(parts) != 6 or parts[1:4] != ["api", "cv", "publish"]:
            return self._json(404, {"error": "Use POST /api/cv/publish/<event>/<match_key>"})

        event_key, match_key = parts[4], parts[5]
        try:
            bundle = json.loads(raw.decode("utf-8"))
        except Exception:
            return self._json(400, {"error": "Body must be JSON"})

        if not isinstance(bundle, dict) or "teams_telemetry" not in bundle:
            return self._json(400, {"error": "Invalid AI scout bundle (need teams_telemetry)"})

        dest_dir = SYNC_ROOT / event_key.lower() / match_key
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / "ai_scout_bundle.json"
        dest.write_text(json.dumps(bundle, indent=2))
        _update_index(event_key, match_key, bundle)
        print(f"[cv-sync] Published {event_key}/{match_key} ({len(bundle.get('teams_telemetry', {}))} teams)")
        return self._json(200, {"ok": True, "event_key": event_key.lower(), "match_key": match_key})

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self._bytes(code, raw, "application/json")

    def _bytes(self, code: int, raw: bytes, content_type: str) -> None:
        self.send_response(code)
        _cors(self)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="CV sync / public poll API for Maneuver")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args(argv)

    SYNC_ROOT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), CvSyncHandler)
    print(f"[cv-sync] API on http://{args.host}:{args.port}")
    print("[cv-sync] Read:  GET /api/cv/index?event=EVENT")
    print("[cv-sync] Write: POST /api/cv/publish/<event>/<match> (+ X-CV-Sync-Key if set)")
    if API_KEY:
        print("[cv-sync] Write auth: CV_SYNC_API_KEY is set")
    else:
        print("[cv-sync] WARNING: CV_SYNC_API_KEY unset — anyone can POST publish")
    print("[cv-sync] For NL→TR: put a Cloudflare Tunnel / VPS in front of this port")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[cv-sync] stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
