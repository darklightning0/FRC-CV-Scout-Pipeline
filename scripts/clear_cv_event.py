#!/usr/bin/env python3
"""
clear_cv_event.py — Wipe local CV outputs / watcher state for an event (or one match).

Does NOT touch Maneuver Dexie on tablets (use Clear Data in the app for that).
Does NOT delete your TBA keys or Netlify data.

Examples:
  python scripts/clear_cv_event.py --event-key 2026tuis2
  python scripts/clear_cv_event.py --event-key 2026tuis2 --match-key 2026tuis2_qm12
  python scripts/clear_cv_event.py --event-key 2026tuis2 --keep-videos
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = PROJECT_ROOT / "outputs"


def _rm(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
        print(f"  removed dir  {path.relative_to(PROJECT_ROOT)}")
    elif path.is_file():
        path.unlink(missing_ok=True)
        print(f"  removed file {path.relative_to(PROJECT_ROOT)}")


def clear_match(event_key: str, match_key: str, keep_videos: bool) -> None:
    artifact = OUTPUTS / match_key
    if keep_videos and artifact.is_dir():
        for child in artifact.iterdir():
            if child.name in {"videos", f"{match_key}_source.mp4"} or child.name.endswith(
                "_source.mp4"
            ):
                continue
            if child.name.endswith(".source_url"):
                continue
            _rm(child)
    else:
        _rm(artifact)

    _rm(OUTPUTS / "cv-sync" / event_key.lower() / match_key)

    state_path = OUTPUTS / "cv-watcher" / f"{event_key}.json"
    if state_path.exists():
        state = json.loads(state_path.read_text())
        changed = False
        for bucket in ("processed", "failed"):
            if match_key in state.get(bucket, {}):
                del state[bucket][match_key]
                changed = True
        if changed:
            state_path.write_text(json.dumps(state, indent=2))
            print(f"  updated state {state_path.relative_to(PROJECT_ROOT)}")


def clear_event(event_key: str, keep_videos: bool) -> None:
    event_key = event_key.strip()
    prefix = f"{event_key}_"

    for path in sorted(OUTPUTS.iterdir()):
        if path.name.startswith(prefix):
            if keep_videos and path.is_dir():
                for child in path.iterdir():
                    if child.name == "videos" or child.name.endswith("_source.mp4"):
                        continue
                    if child.name.endswith(".source_url"):
                        continue
                    _rm(child)
            else:
                _rm(path)

    _rm(OUTPUTS / "cv-sync" / event_key.lower())
    _rm(OUTPUTS / "cv-watcher" / f"{event_key}.json")
    _rm(OUTPUTS / "temp_1080p_match.mp4")
    # Legacy shared download stamp
    for p in OUTPUTS.glob("temp_1080p_match.mp4*"):
        _rm(p)


def main() -> int:
    parser = argparse.ArgumentParser(description="Clear local CV artifacts for an event/match")
    parser.add_argument("--event-key", required=True, help="e.g. 2026tuis2")
    parser.add_argument("--match-key", default="", help="Optional single match, e.g. 2026tuis2_qm12")
    parser.add_argument(
        "--keep-videos",
        action="store_true",
        help="Keep downloaded source videos (still clears telemetry/bundles/heatmaps/state)",
    )
    args = parser.parse_args()

    print(f"[clear-cv] event={args.event_key} match={args.match_key or '(all)'} keep_videos={args.keep_videos}")
    if args.match_key:
        clear_match(args.event_key, args.match_key.strip(), args.keep_videos)
    else:
        clear_event(args.event_key, args.keep_videos)
    print("[clear-cv] Done. Restart cv_event_watcher to reprocess.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
