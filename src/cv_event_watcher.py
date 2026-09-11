#!/usr/bin/env python3
"""
cv_event_watcher.py — Auto-run RobotDetector when TBA publishes YouTube videos

Uses the same event key as Maneuver (e.g. 2026tuis2). For each match that
gains a YouTube video, runs master_pipeline and publishes bundles into
outputs/cv-sync/ for the LAN sync server.

Scouts do NOT run this. One analysis laptop does.

Example:
  python src/cv_event_watcher.py --event-key 2026tuis2 --poll-sec 120
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests

sys_src = str(Path(__file__).resolve().parent)
if sys_src not in sys.path:
    sys.path.insert(0, sys_src)

from api_fetch import get_tba_auth_key  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SYNC_ROOT = PROJECT_ROOT / "outputs" / "cv-sync"
STATE_DIR = PROJECT_ROOT / "outputs" / "cv-watcher"


def _headers(auth_key: str) -> dict[str, str]:
    return {"X-TBA-Auth-Key": auth_key, "Accept": "application/json"}


def fetch_event_matches(event_key: str, auth_key: str) -> list[dict[str, Any]]:
    url = f"https://www.thebluealliance.com/api/v3/event/{event_key}/matches"
    resp = requests.get(url, headers=_headers(auth_key), timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"TBA {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    if not isinstance(data, list):
        raise RuntimeError("Unexpected TBA matches payload")
    return data


def youtube_url_for_match(match: dict[str, Any]) -> Optional[str]:
    for video in match.get("videos") or []:
        if not isinstance(video, dict):
            continue
        if str(video.get("type", "")).lower() != "youtube":
            continue
        key = video.get("key")
        if key:
            return f"https://www.youtube.com/watch?v={key}"
    return None


def load_state(event_key: str) -> dict[str, Any]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = STATE_DIR / f"{event_key}.json"
    if not path.exists():
        return {"event_key": event_key, "processed": {}, "failed": {}}
    return json.loads(path.read_text())


def save_state(event_key: str, state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = STATE_DIR / f"{event_key}.json"
    path.write_text(json.dumps(state, indent=2))


def publish_to_sync(event_key: str, match_key: str, artifact_dir: Path) -> Path:
    """Copy AI scout bundle (+ heatmaps if present) into the LAN sync tree."""
    bundle_src = artifact_dir / f"ai_scout_bundle_{match_key}.json"
    if not bundle_src.exists():
        # Fallback: any ai_scout_bundle*.json in artifact dir
        candidates = list(artifact_dir.glob("ai_scout_bundle*.json"))
        if not candidates:
            raise FileNotFoundError(f"No AI scout bundle in {artifact_dir}")
        bundle_src = candidates[0]

    dest_dir = SYNC_ROOT / event_key / match_key
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_bundle = dest_dir / "ai_scout_bundle.json"
    dest_bundle.write_bytes(bundle_src.read_bytes())

    heat_src = artifact_dir / "heatmaps"
    if heat_src.is_dir():
        heat_dest = dest_dir / "heatmaps"
        heat_dest.mkdir(parents=True, exist_ok=True)
        for png in heat_src.glob("*.png"):
            (heat_dest / png.name).write_bytes(png.read_bytes())

    # Refresh index.json for this event
    index_path = SYNC_ROOT / event_key / "index.json"
    teams: list[str] = []
    processed_at = datetime.now(timezone.utc).isoformat()
    try:
        payload = json.loads(dest_bundle.read_text())
        teams = sorted(
            set(str(t) for t in (payload.get("red_teams") or []))
            | set(str(t) for t in (payload.get("blue_teams") or []))
            | set(str(t) for t in (payload.get("teams_telemetry") or {}).keys())
        )
        processed_at = payload.get("processed_at") or processed_at
    except Exception:
        pass

    index: dict[str, Any] = {"event_key": event_key, "updated_at": processed_at, "matches": []}
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
    index["event_key"] = event_key
    index["updated_at"] = datetime.now(timezone.utc).isoformat()
    index["matches"] = matches
    index_path.write_text(json.dumps(index, indent=2))
    return dest_bundle


def push_bundle_to_remote_api(
    api_base: str,
    api_key: str,
    event_key: str,
    match_key: str,
    bundle_path: Path,
    artifact_dir: Optional[Path] = None,
) -> None:
    """POST bundle (+ heatmaps) to a public CV API (Netlify function, tunnel, or VPS)."""
    import requests

    base = api_base.rstrip("/")
    is_netlify = "/.netlify/functions/cv-api" in base or base.endswith("/cv-api")

    if is_netlify:
        url = f"{base}?action=publish&event={event_key}&match={match_key}"
    else:
        url = f"{base}/api/cv/publish/{event_key}/{match_key}"

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-CV-Sync-Key"] = api_key
    raw = bundle_path.read_bytes()
    print(f"[watcher] Pushing to CV API {url} ({len(raw)} bytes)")
    resp = requests.post(url, data=raw, headers=headers, timeout=120)
    if resp.status_code >= 300:
        raise RuntimeError(f"Remote CV API {resp.status_code}: {resp.text[:300]}")
    print(f"[watcher] Remote publish OK → {url}")

    heat_dir = (artifact_dir or bundle_path.parent) / "heatmaps"
    if not heat_dir.is_dir():
        return

    for png in sorted(heat_dir.glob("*.png")):
        # Expect names like 2026tuis2_qm1_team_8151_heatmap.png
        team = None
        name = png.stem
        if "_team_" in name:
            team = name.split("_team_")[-1].replace("_heatmap", "")
        if not team:
            continue
        if is_netlify:
            heat_url = (
                f"{base}?action=publish-heatmap&event={event_key}"
                f"&match={match_key}&team={team}"
            )
        else:
            heat_url = f"{base}/api/cv/heatmap/{event_key}/{match_key}/{team}"
        heat_headers = {"Content-Type": "image/png"}
        if api_key:
            heat_headers["X-CV-Sync-Key"] = api_key
        hresp = requests.post(heat_url, data=png.read_bytes(), headers=heat_headers, timeout=120)
        if hresp.status_code >= 300:
            print(f"[watcher] Heatmap upload failed for team {team}: {hresp.status_code}")
        else:
            print(f"[watcher] Heatmap uploaded for team {team}")


def run_pipeline(match_key: str, youtube_url: str, event_key: str) -> Path:
    artifact_dir = PROJECT_ROOT / "outputs" / match_key
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "src" / "master_pipeline.py"),
        "--match-key",
        match_key,
        "--event-key",
        event_key,
        "--url",
        youtube_url,
        "--out-dir",
        str(artifact_dir),
        "--skip-dual-view",
    ]
    print(f"[watcher] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))
    if result.returncode != 0:
        raise RuntimeError(f"Pipeline failed for {match_key} (exit {result.returncode})")
    return artifact_dir


def poll_once(
    event_key: str,
    auth_key: str,
    state: dict[str, Any],
    dry_run: bool,
    api_url: Optional[str] = None,
    api_key: str = "",
) -> int:
    matches = fetch_event_matches(event_key, auth_key)
    queued = 0
    for match in matches:
        match_key = str(match.get("key") or "")
        if not match_key:
            continue
        if match_key in state.get("processed", {}):
            continue
        yt = youtube_url_for_match(match)
        if not yt:
            continue

        queued += 1
        print(f"[watcher] New video for {match_key}: {yt}")
        if dry_run:
            continue

        try:
            artifact_dir = run_pipeline(match_key, yt, event_key)
            published = publish_to_sync(event_key, match_key, artifact_dir)
            if api_url:
                push_bundle_to_remote_api(
                    api_url, api_key, event_key, match_key, published, artifact_dir
                )
            state.setdefault("processed", {})[match_key] = {
                "youtube": yt,
                "published": str(published),
                "remote_api": api_url or None,
                "at": datetime.now(timezone.utc).isoformat(),
            }
            state.get("failed", {}).pop(match_key, None)
            save_state(event_key, state)
            print(f"[watcher] Published {published}")
        except Exception as e:
            print(f"[watcher] FAILED {match_key}: {e}")
            state.setdefault("failed", {})[match_key] = {
                "error": str(e),
                "at": datetime.now(timezone.utc).isoformat(),
            }
            save_state(event_key, state)

    return queued


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Auto CV pipeline from TBA YouTube videos")
    parser.add_argument("--event-key", required=True, help="TBA event key (same as Maneuver event code)")
    parser.add_argument("--poll-sec", type=int, default=120, help="Seconds between TBA polls")
    parser.add_argument("--once", action="store_true", help="Single poll then exit")
    parser.add_argument("--dry-run", action="store_true", help="List new videos without running CV")
    parser.add_argument("--tba-key", type=str, default=None)
    parser.add_argument(
        "--api-url",
        type=str,
        default=os.environ.get("CV_SYNC_API_URL", ""),
        help="Public CV API base (tunnel/VPS). Also: export CV_SYNC_API_URL=https://…",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=os.environ.get("CV_SYNC_API_KEY", ""),
        help="X-CV-Sync-Key for POST publish (same as server CV_SYNC_API_KEY)",
    )
    args = parser.parse_args(argv)

    event_key = args.event_key.strip().lower()
    auth_key = (args.tba_key or get_tba_auth_key()).strip()
    if not auth_key:
        print("No TBA API key. Set TBA_AUTH_KEY / VITE_TBA_API_KEY or pass --tba-key")
        return 1

    api_url = (args.api_url or "").strip()
    api_key = (args.api_key or "").strip()

    SYNC_ROOT.mkdir(parents=True, exist_ok=True)
    state = load_state(event_key)
    print(f"[watcher] Event={event_key} | already processed={len(state.get('processed', {}))}")
    if api_url:
        print(f"[watcher] Will push finished bundles to CV API: {api_url}")
    else:
        print("[watcher] No --api-url / CV_SYNC_API_URL — local sync folder only")

    while True:
        try:
            n = poll_once(event_key, auth_key, state, args.dry_run, api_url or None, api_key)
            print(f"[watcher] Poll done — {n} new video match(es)")
        except Exception as e:
            print(f"[watcher] Poll error: {e}")

        if args.once:
            break
        time.sleep(max(30, args.poll_sec))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
