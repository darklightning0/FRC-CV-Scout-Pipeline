# Competition CV runbook (RobotDetector → Maneuver)

Scouts never run YOLO. Analysis is laptop/batch after YouTube upload. CV lives in Dexie `cvMatchTelemetry` and never overwrites human scout paths.

## 0. Prerequisites (analysis laptop)

- Python venv with project deps (`python3` / `.venv`, not bare `python` if missing)
- `ffmpeg` installed (`brew install ffmpeg`)
- Recent `yt-dlp` (`pip install -U yt-dlp`)
- TBA auth key in env (`TBA_AUTH_KEY` / `TBA_API_KEY` / `VITE_TBA_API_KEY`)
- If YouTube returns HTTP 403: `export YTDLP_BROWSER=chrome` (or safari/firefox), then retry

## 1. Deploy Maneuver + cloud CV API (Goal 1)

1. Deploy the `web/` app to Netlify (GitHub or Netlify UI). Local `netlify-cli` may fail on Node 26 — use UI/Git if needed.
2. In Netlify → Site settings → Environment variables, set:
   - `CV_SYNC_API_KEY` = a long shared secret (same value on the laptop)
3. After deploy, sanity-check:
   - `https://YOUR-SITE.netlify.app/.netlify/functions/cv-api?action=health`
   - Expect `{ "ok": true, ... }`

## 2. Analyst laptop — one watcher process

```bash
cd /path/to/RobotDetector
source .venv/bin/activate   # or your venv

export TBA_AUTH_KEY='…'
export CV_SYNC_API_URL='https://YOUR-SITE.netlify.app/.netlify/functions/cv-api'
export CV_SYNC_API_KEY='same-as-netlify-env'
# optional if downloads 403:
# export YTDLP_BROWSER=chrome

python src/cv_event_watcher.py --event-key YOUR_EVENT
# example: --event-key 2026tuis2
```

What this does:

- Polls TBA for the event
- When a match has a YouTube video, runs `master_pipeline`
- Publishes `ai_scout_bundle.json` + heatmaps to Netlify Blobs

You do **not** need a local sync server for scouts when using Netlify.

### Optional: local LAN sync (same venue Wi‑Fi only)

```bash
# Terminal A
python src/cv_sync_server.py

# Terminal B — point watcher at local API instead of Netlify
export CV_SYNC_API_URL='http://LAPTOP_LAN_IP:8765'
python src/cv_event_watcher.py --event-key YOUR_EVENT --api-url "$CV_SYNC_API_URL"
```

## 3. Scouts (tablets / phones)

1. Open the deployed Maneuver URL (any network with internet — NL analysis → TR scouts is fine).
2. Set the **same TBA event code** in the app.
3. Wait for background sync (about every 60s) or open **Team Stats → CV → Sync now**.
4. Per-team paths, zones, and heatmaps appear when that team’s matches are published.

No YOLO on devices. No second scout-side server.

## 4. Manual one-off match (debug / missed video)

```bash
python src/master_pipeline.py \
  --match-key YOUR_EVENT_qm12 \
  --event-key YOUR_EVENT \
  --url 'https://www.youtube.com/watch?v=…' \
  --out-dir outputs/YOUR_EVENT_qm12
```

Then re-run the watcher, or publish the bundle from `outputs/.../ai_scout_bundle.json` via the watcher publish path / API.

## 5. Day-of checklist

- [ ] Netlify site live; `?action=health` OK
- [ ] `CV_SYNC_API_KEY` set on Netlify **and** laptop
- [ ] TBA key works (`event` matches Maneuver event code)
- [ ] `ffmpeg` + updated `yt-dlp` on laptop
- [ ] Watcher running with correct `--event-key`
- [ ] One test match published; scout tablet shows CV tab data
- [ ] Heatmap visible for a team that played that match
- [ ] Confirm scout auto/teleop paths unchanged after CV import

### Clear local CV data before reprocessing

```bash
# Wipe all local CV artifacts + watcher state for an event (recommended after the shared-video bug)
python scripts/clear_cv_event.py --event-key 2026tuis2

# Or one match only
python scripts/clear_cv_event.py --event-key 2026tuis2 --match-key 2026tuis2_qm12

# Keep downloaded source videos, clear telemetry/heatmaps/state only
python scripts/clear_cv_event.py --event-key 2026tuis2 --keep-videos
```

Also delete the legacy shared download if present: `rm -f outputs/temp_1080p_match.mp4`

Tablets: Clear Data / event clear in the app if you need to wipe Dexie CV rows (or re-sync after republish).

### Reprocess for phase paths + stacked alliance heatmaps

After pulling the latest code:

1. Stop the watcher (`Ctrl+C`).
2. Clear local CV artifacts (keep videos if downloads are slow):
   ```bash
   python scripts/clear_cv_event.py --event-key 2026tuis2 --keep-videos
   rm -f outputs/temp_1080p_match.mp4
   ```
3. Restart the watcher so each match re-exports `teleop_path_waypoints` / `endgame_path_waypoints` / `match_path_waypoints` and generates `*_team_alliance_{blue,red}_heatmap.png`.
4. On tablets: Team Stats → CV → Sync now (or wait ~60s).

New Match Strategy UI: enable **CV trails** on Field Strategy; stacked 3-color heatmaps + defense hot zones appear in the CV panel. Pick Lists can sort/filter by CV opponent zone % and crossings.

## 6. YouTube 403 mitigations

1. `brew install ffmpeg` / ensure ffmpeg on PATH  
2. `pip install -U yt-dlp`  
3. `export YTDLP_BROWSER=chrome` and retry  
4. Re-queue failed matches (delete that match from watcher state under `outputs/cv-sync/` / state file if present, or re-run pipeline for that match key)

## 7. What not to do

- Do not merge CV into scout scoring / `autoPath` / `teleopPath`
- Do not hardcode a single match key (e.g. `2026tuis2_qm48`) as product identity
- Do not expect scouts to run the Python pipeline
