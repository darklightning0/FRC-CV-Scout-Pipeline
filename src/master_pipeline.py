"""
master_pipeline.py — FRC 1080p Robot Tracking Master Pipeline
=============================================================
Downloads a match video from YouTube, uses EasyOCR to read bumper numbers
during the pre-match period, then runs YOLOv8 + BoT-SORT with a custom
Greedy Stitcher & Coasting layer to produce a clean annotated video with
real team numbers overlaid on every robot.

Dependencies:
    pip install opencv-python-headless ultralytics easyocr yt-dlp thefuzz python-Levenshtein
"""

from pathlib import Path
import os
import cv2
import math
import sys
import time
import json
import datetime
from typing import Optional, List, Dict, Tuple
from collections import Counter, deque

# Add src directory to sys.path if needed
sys_src = str(Path(__file__).resolve().parent)
if sys_src not in sys.path:
    sys.path.insert(0, sys_src)

from homography import HomographyEngine

# ---------------------------------------------------------------------------
# Resolve project paths relative to this script
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH   = PROJECT_ROOT / "models" / "best_8.pt"
OUTPUT_DIR   = PROJECT_ROOT / "outputs" / "videos"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Defaults (overridable via CLI — competition runs should pass real TBA keys)
DEFAULT_VIDEO_URL = ""
DEFAULT_MATCH_KEY = ""  # Required unless set via --match-key / watcher
VIDEO_URL = DEFAULT_VIDEO_URL
TEMP_VIDEO = PROJECT_ROOT / "outputs" / "temp_1080p_match.mp4"  # legacy fallback only

OUTPUT_VIDEO = OUTPUT_DIR / "annotated_last_run.mp4"

# ---------------------------------------------------------------------------
# VIDEO TIMING (seconds)
# ---------------------------------------------------------------------------
COVER_DURATION_SEC   = 3       # First 3 seconds are a cover/intro — skip
MATCH_END_SEC        = 180     # After 3 minutes the video shows results — stop
RESULTS_SCREEN_SEC   = 200     # ~3:20 — the post-match results screen with team numbers

# ---------------------------------------------------------------------------
# OCR CONFIGURATION
# ---------------------------------------------------------------------------
# Run OCR on unlocked tracks every 15 frames (approx. every 0.5 seconds at 30 FPS)
# throughout the entire match to guarantee we catch readable bumpers.
OCR_INTERVAL_FRAMES = 15        # Check visible tracks about twice per second
FUZZY_THRESHOLD     = 80        # Require a close match before accepting OCR
OCR_VOTES_REQUIRED  = 3         # Require agreement across separate OCR samples
OCR_HISTORY_SIZE    = 5         # Rolling evidence window for relabeling tracks
OCR_TRACK_COOLDOWN  = 90        # New tracks: do not OCR more often than every 3 seconds
OCR_LOCKED_COOLDOWN = 15        # Revalidate locked tracks every 0.5 seconds
OCR_STABLE_FRAMES   = 5         # Wait for a track to settle before spending OCR time
OCR_MARGIN          = 10        # Best match must beat the runner-up by this margin
MAX_COAST_FRAMES    = 30        # Coast a lost track for up to 30 frames
PROXIMITY_THRESH    = 250       # Allow fast robots to move between sampled frames
MIN_BOX_AREA        = 600       # Optimized to 600 for best_8.pt to filter out tiny background noise
IDENTITY_RESET_LOST_FRAMES = 5  # Reset a label after a real disappearance and ID handoff
VERBOSE_LOGGING = False         # Set True to show per-crop OCR diagnostics


class PipelineReporter:
    """Keep pipeline output compact while providing a live processing ETA."""

    def __init__(self):
        self.started_at = time.monotonic()
        self.last_progress_frame = -1

    def phase(self, title: str):
        print(f"\n[PHASE] {title}")

    def event(self, message: str):
        print(f"[INFO] {message}")

    def warning(self, message: str):
        print(f"[WARN] {message}")

    def progress(self, current: int, total: int, label: str = "Processing"):
        if total <= 0 or current == self.last_progress_frame:
            return
        self.last_progress_frame = current
        elapsed = time.monotonic() - self.started_at
        rate = current / elapsed if elapsed > 0 else 0
        remaining = max(total - current, 0) / rate if rate > 0 else 0
        percent = min(current / total, 1.0)
        width = 28
        filled = int(width * percent)
        bar = "=" * filled + ">" + " " * max(width - filled - 1, 0)
        print(
            f"\r[RUN] {label:<12} [{bar}] {percent:>6.1%}  "
            f"{current:,}/{total:,} frames  {rate:>5.1f} fps  "
            f"elapsed {format_duration(elapsed)}  ETA {format_duration(remaining)}",
            end="",
            flush=True,
        )

    def finish(self):
        print()


def format_duration(seconds: float) -> str:
    seconds = max(int(seconds), 0)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    return f"{minutes:02d}m {seconds:02d}s"

# ---------------------------------------------------------------------------
# COLOR HUES PER MASTER TRACK (BGR format)
# ---------------------------------------------------------------------------
TRACK_COLORS = {
    "red_1": (0, 140, 255),     # orange
    "red_2": (0, 0, 255),       # normal red
    "red_3": (0, 0, 139),       # deep dark red
    "blue_1": (235, 206, 135),  # light blue
    "blue_2": (255, 0, 0),      # normal blue
    "blue_3": (139, 0, 0),      # dark blue
}

COAST_COLORS = {
    "red_1": (0, 70, 128),      # dim orange
    "red_2": (0, 0, 128),       # dim red
    "red_3": (0, 0, 80),        # dim deep dark red
    "blue_1": (118, 103, 68),   # dim light blue
    "blue_2": (128, 0, 0),      # dim blue
    "blue_3": (70, 0, 0),       # dim dark blue
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 1 — VIDEO INGESTION
# ═══════════════════════════════════════════════════════════════════════════

def download_video(url: str, output_path: Path) -> Path:
    """Download the match video from YouTube at 1080p using yt-dlp."""
    import yt_dlp
    import yt_dlp.utils  # type: ignore

    output_path.parent.mkdir(parents=True, exist_ok=True)
    url_sidecar = Path(f"{output_path}.source_url")

    if output_path.exists():
        cached_url = url_sidecar.read_text().strip() if url_sidecar.exists() else ""
        size_mb = output_path.stat().st_size / (1024 * 1024)
        cached_video = cv2.VideoCapture(str(output_path))
        is_readable = cached_video.isOpened() and cached_video.get(cv2.CAP_PROP_FRAME_COUNT) > 0
        cached_video.release()
        if size_mb > 1.0 and is_readable and cached_url == url:
            print(f"[DOWNLOAD] Using cached video ({size_mb:.1f} MB): {output_path.name}")
            return output_path
        reason = "URL changed" if cached_url and cached_url != url else "incomplete/unreadable or missing URL stamp"
        print(f"[DOWNLOAD] Replacing cache ({reason}): {output_path.name}")
        output_path.unlink(missing_ok=True)
        url_sidecar.unlink(missing_ok=True)

    partial_path = Path(f"{output_path}.part")
    if partial_path.exists():
        partial_path.unlink()

    print(f"[DOWNLOAD] Downloading 1080p source → {output_path.name}")

    # Prefer progressive/compatible streams; YouTube often 403s on some SABR/adaptive URLs.
    format_attempts = [
        "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]",
        "best[height<=1080][ext=mp4]/best[height<=720][ext=mp4]/best[height<=1080]/best",
        "bv*[height<=720]+ba/b[height<=720]/b",
    ]

    base_opts: dict = {
        "outtmpl": str(output_path),
        "quiet": True,
        "no_warnings": False,
        "js_runtimes": {"deno": {}},
        "remote_components": ["ejs:github"],
        "http_chunk_size": 10 * 1024 * 1024,
        "retries": 10,
        "fragment_retries": 10,
        "concurrent_fragment_downloads": 1,
        "progress_hooks": [_download_hook],
        # Helps when googlevideo returns 403 on default web client
        "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
    }

    # YouTube may require a browser session for some IPs / accounts.
    # export YTDLP_BROWSER=chrome   (or safari / firefox)
    browser = os.environ.get("YTDLP_BROWSER")
    if browser:
        base_opts["cookiesfrombrowser"] = (browser,)
        print(f"[DOWNLOAD] Using cookies from browser: {browser}")

    last_error: Exception | None = None
    for idx, fmt in enumerate(format_attempts, start=1):
        output_path.unlink(missing_ok=True)
        partial_path.unlink(missing_ok=True)
        opts = dict(base_opts)
        opts["format"] = fmt
        try:
            print(f"[DOWNLOAD] Attempt {idx}/{len(format_attempts)} format={fmt[:48]}…")
            with yt_dlp.YoutubeDL(opts) as ydl:  # type: ignore
                ydl.download([url])
            last_error = None
            break
        except yt_dlp.utils.DownloadError as error:
            last_error = error
            print(f"[DOWNLOAD] Attempt {idx} failed: {error}")

    if last_error is not None:
        raise RuntimeError(
            "YouTube download blocked (HTTP 403). Try:\n"
            "  1) brew install ffmpeg\n"
            "  2) export YTDLP_BROWSER=chrome   # then re-run\n"
            "  3) pip install -U yt-dlp\n"
            f"Last error: {last_error}"
        ) from last_error

    downloaded_video = cv2.VideoCapture(str(output_path))
    is_readable = downloaded_video.isOpened() and downloaded_video.get(cv2.CAP_PROP_FRAME_COUNT) > 0
    downloaded_video.release()
    if not is_readable:
        raise RuntimeError(
            f"Downloaded file is not a readable video: {output_path}. "
            "Install ffmpeg (brew install ffmpeg) and retry."
        )

    url_sidecar.write_text(url.strip() + "\n", encoding="utf-8")
    print(f"[DOWNLOAD] Ready: {output_path.name}")
    return output_path


def _download_hook(d: dict):
    """Progress callback for yt-dlp."""
    if d["status"] == "downloading":
        pct = d.get("_percent_str", "??%")
        speed = d.get("_speed_str", "??")
        eta = d.get("_eta_str", "??")
        print(f"[DOWNLOAD]   {pct}  speed={speed}  ETA={eta}", end="\r")
    elif d["status"] == "finished":
        print(f"\n[DOWNLOAD]   Finished downloading, now post-processing...")

def extract_teams_from_results_screen(
    video_path: Path, reader, timestamp_sec: float = RESULTS_SCREEN_SEC
) -> tuple[list[str], list[str]]:
    """
    Auto-detect team numbers from the match video using a dual-strategy approach:
    1. Scoreboard Strategy: Try to read team numbers directly from the top scoreboard during the match (playoff layout).
       Uses voting consensus across 10 frames and optimized crop y-coordinates (y: 13-22%).
    2. Results Screen Strategy: Fallback to reading team numbers from the post-match results screen.
       Uses widened crop coordinates and returns up to 5 candidates per alliance to avoid slicing out correct teams.
    """
    import re
    from collections import Counter

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print("[TEAM-DETECT] ❌ Could not open video for team detection.")
        return [], []

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0

    def _extract_team_numbers(crop_img, label: str, max_teams: int = 5) -> list[str]:
        if crop_img is None or crop_img.size == 0:
            return []
        results = reader.readtext(crop_img, allowlist="0123456789", detail=0)
        raw_text = " ".join(results)
        if VERBOSE_LOGGING:
            print(f"[TEAM-DETECT] {label}: '{raw_text}'")
        # Find all 3-5 digit numbers (FRC team numbers range ~100–99999)
        candidates = re.findall(r'\b\d{3,5}\b', raw_text)
        seen = set()
        unique = []
        for c in candidates:
            if c not in seen:
                seen.add(c)
                unique.append(c)
        return unique[:max_teams]

    # -----------------------------------------------------------------------
    # STRATEGY 1: Scoreboard Detection (Playoffs Layout) with Voting Consensus
    # -----------------------------------------------------------------------
    print("[TEAM-DETECT] Reading scoreboard samples")
    
    red_votes = Counter()
    blue_votes = Counter()
    
    # Sample stable frames throughout the active match, including the last 30 seconds and the last frame of the match
    sample_seconds = [15.0, 35.0, 55.0, 75.0, 95.0, 115.0, 135.0, 150.0, 160.0, 170.0, 180.0]
    
    for test_sec in sample_seconds:
        target_frame = int(test_sec * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        if ret:
            h, w = frame.shape[:2]
            # Red banner containing 3 team numbers: y: 13-22%, x: 20-41%
            red_crop = frame[int(h * 0.13):int(h * 0.22), int(w * 0.20):int(w * 0.41)]
            # Blue banner containing 3 team numbers: y: 13-22%, x: 59-80%
            blue_crop = frame[int(h * 0.13):int(h * 0.22), int(w * 0.59):int(w * 0.80)]

            red_teams = _extract_team_numbers(red_crop, f"RED Scoreboard (at {test_sec}s)", max_teams=5)
            blue_teams = _extract_team_numbers(blue_crop, f"BLUE Scoreboard (at {test_sec}s)", max_teams=5)

            for t in red_teams:
                red_votes[t] += 1
            for t in blue_teams:
                blue_votes[t] += 1

    if VERBOSE_LOGGING:
        print(f"[TEAM-DETECT] Scoreboard votes - RED: {dict(red_votes)}")
        print(f"[TEAM-DETECT] Scoreboard votes - BLUE: {dict(blue_votes)}")

    # We need at least 3 teams on each side with a minimum frequency (appearing in at least 3 frames)
    strong_red = [t for t, count in red_votes.most_common(3) if count >= 3]
    strong_blue = [t for t, count in blue_votes.most_common(3) if count >= 3]

    if len(strong_red) == 3 and len(strong_blue) == 3:
        print(f"[TEAM-DETECT] Scoreboard teams: RED {strong_red} | BLUE {strong_blue}")
        cap.release()
        return strong_red, strong_blue
    else:
        print("[TEAM-DETECT] Scoreboard incomplete; checking results screen")

    # -----------------------------------------------------------------------
    # STRATEGY 2: Results Screen Detection (Fallback)
    # -----------------------------------------------------------------------
    print("[TEAM-DETECT] Reading results screen")
    target_frame = int(timestamp_sec * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        print("[TEAM-DETECT] ❌ Could not read frame at results screen.")
        return [], []

    h, w = frame.shape[:2]
    if VERBOSE_LOGGING:
        print(f"[TEAM-DETECT] Frame {target_frame} ({w}x{h})")

    # Widened crop coordinates to cover both playoff and qualification layouts.
    # Excludes the center where scores/detailed match stats are located.
    y_start = int(h * 0.25)
    y_end   = int(h * 0.65)
    left_crop  = frame[y_start:y_end, 0:int(w * 0.32)]
    right_crop = frame[y_start:y_end, int(w * 0.68):w]

    # Return up to 5 unique teams to ensure correct teams are not sliced out by false positives
    red_teams  = _extract_team_numbers(left_crop, "RED Results Screen", max_teams=5)
    blue_teams = _extract_team_numbers(right_crop, "BLUE Results Screen", max_teams=5)

    print(f"[TEAM-DETECT] Results teams: RED {red_teams} | BLUE {blue_teams}")

    if len(red_teams) < 3 or len(blue_teams) < 3:
        print("[TEAM-DETECT] Warning: fewer than 3 teams found for one alliance")

    return red_teams, blue_teams


# ═══════════════════════════════════════════════════════════════════════════
# STEP 2 — OCR & TEAM MAPPING
# ═══════════════════════════════════════════════════════════════════════════

def init_ocr():
    """Initialize EasyOCR reader."""
    import easyocr
    print("[OCR] Loading EasyOCR")
    reader = easyocr.Reader(["en"], gpu=True)
    print("[OCR] Ready")
    return reader


def run_ocr_on_crop(reader, crop_img, expected_teams: list[str]) -> tuple[str | None, int]:
    """
    Enhanced OCR logic that tries multiple crops and preprocessing steps,
    checking for a fuzzy match against the expected teams in real-time.
    
    Tries:
      1. Bottom-60% crop + preprocessed (grayscale + 2x resize + CLAHE)
      2. Bottom-60% crop + raw
      3. Full crop + preprocessed
      4. Full crop + raw
      
    Returns (matched_team, confidence) or (None, 0).
    """
    import cv2
    from thefuzz import fuzz, process
    import re

    if crop_img is None or crop_img.size == 0:
        return None, 0

    h, w = crop_img.shape[:2]

    # Generate Candidate Crops:
    # 1. Bottom 60% crop (highly likely to contain bumper numbers in FRC robots)
    # 2. Full crop (fallback in case the bounding box is already tight)
    crops = []
    if h >= 30:
        bottom_h = crop_img[int(h * 0.40):h, :]
        crops.append(("bottom_60", bottom_h))
    crops.append(("full", crop_img))

    # We will try each crop with and without preprocessing
    for label, crop in crops:
        if crop.size == 0:
            continue

        # Try preprocessed and raw variations
        for prep_type in ["preprocessed", "raw"]:
            if prep_type == "preprocessed":
                # Convert to grayscale
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                # Resize 2x using cubic interpolation for smoother text edges
                ch, cw = gray.shape[:2]
                resized = cv2.resize(gray, (cw * 2, ch * 2), interpolation=cv2.INTER_CUBIC)
                # Apply CLAHE to boost contrast
                clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                ocr_input = clahe.apply(resized)
            else:
                ocr_input = crop

            # Run EasyOCR with a strictly digit allowlist
            results = reader.readtext(ocr_input, allowlist="0123456789", detail=0)
            candidates = []
            for result_text in results:
                candidates.extend(re.findall(r"\d{3,5}", result_text))

            if not candidates:
                continue

            # If there are no expected teams, return the text if it looks reasonable
            if not expected_teams:
                return candidates[0], 100
                continue

            # Match each OCR token separately. Concatenating tokens can mix two
            # robots or a robot number with scoreboard text in the same crop.
            matches = []
            for candidate in candidates:
                ranked = process.extract(
                    candidate, expected_teams, scorer=fuzz.ratio, limit=2
                )
                if ranked:
                    best_team, confidence = ranked[0][0], ranked[0][1]
                    runner_up = ranked[1][1] if len(ranked) > 1 else 0
                    matches.append((confidence, runner_up, candidate, best_team))

            if matches:
                confidence, runner_up, raw_text, matched_team = max(
                    matches, key=lambda item: item[0]
                )
                if confidence >= FUZZY_THRESHOLD and confidence - runner_up >= OCR_MARGIN:
                    if VERBOSE_LOGGING:
                        print(f"[OCR-DEBUG] Strong token on {label} ({prep_type}): OCR='{raw_text}' -> Team {matched_team} ({confidence}%)")
                    return matched_team, confidence
                if VERBOSE_LOGGING:
                    print(f"[OCR-DEBUG] Rejected OCR on {label} ({prep_type}): candidates={candidates}, best={matched_team} ({confidence}%), margin={confidence - runner_up}")

    return None, 0


# ═══════════════════════════════════════════════════════════════════════════
# STEP 3 — YOLO + BoT-SORT INFERENCE
# ═══════════════════════════════════════════════════════════════════════════

def load_model(model_path: Path):
    """Load the YOLOv8 model."""
    import torch
    from ultralytics import YOLO

    print(f"[YOLO] Loading {model_path.name}")
    model = YOLO(str(model_path))

    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    model.to(device)
    print(f"[YOLO] Ready on {device} | classes: {model.names}")
    return model


def run_inference(model, frame):
    """
    Run YOLOv8 + BoT-SORT tracker on a single frame.
    Uses imgsz=1088 to properly handle 1080p input.
    Uses our FRC-tuned botsort_frc.yaml instead of the default botsort.yaml.
    Uses half=True (FP16 half-precision) if running on MPS or CUDA for 2x speed boost.
    """
    import torch
    device = model.device.type if hasattr(model, 'device') else ('cuda' if torch.cuda.is_available() else 'cpu')
    use_half = (device in ['cuda', 'mps'])

    results = model.track(
        frame,
        imgsz=1088,
        conf=0.55,      # Restore the high-precision detector threshold
        #iou=0.45,        Optimized to 0.45 to merge overlapping boxes perfectly
        persist=True,
        tracker=str(PROJECT_ROOT / "config" / "botsort_frc.yaml"),
        device=device,
        half=use_half,  # Enable FP16 half-precision on GPU/MPS for a massive speedup
        verbose=False,
    )
    return results


# ═══════════════════════════════════════════════════════════════════════════
# STEP 4 — GREEDY STITCHER & COASTING (Post-Processing)
# ═══════════════════════════════════════════════════════════════════════════

def get_center(coords):
    """Return the (cx, cy) center of a bounding box [x1, y1, x2, y2]."""
    return ((coords[0] + coords[2]) / 2, (coords[1] + coords[3]) / 2)


def calc_dist(p1, p2):
    """Euclidean distance between two points."""
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])


def build_corrected_telemetry(
    raw_records: list[dict],
    correction_events: list[dict],
    fps: float,
) -> dict[str, list[dict]]:
    """
    Post-processing telemetry correction engine.
    
    1. Aggregates all OCR votes and confirmed correction events per BoT-SORT track_id.
    2. Overrides temporary live mixups by assigning the single true OCR-confirmed team 
       identity to every frame of each track_id trajectory.
    3. Backfills master slots to match start so no frames are lost.
    4. Applies trajectory smoothing & velocity filtering.
    """
    if not raw_records:
        return {}

    # 1. Map each BoT-SORT track_id to its most frequent / latest OCR confirmed team
    track_to_confirmed_team: dict[int, str] = {}
    track_team_votes: dict[int, Counter] = {}

    for event in correction_events:
        tr_id = event.get("track_id")
        team = event.get("team")
        if tr_id is not None and team:
            track_team_votes.setdefault(tr_id, Counter())[str(team)] += 1

    for tr_id, votes in track_team_votes.items():
        track_to_confirmed_team[tr_id] = votes.most_common(1)[0][0]

    # Also collect track_id teams from raw records for unvoted tracks
    for rec in raw_records:
        tr_id = rec.get("track_id")
        prov = rec.get("provisional_team")
        if tr_id is not None and prov and tr_id not in track_to_confirmed_team:
            track_team_votes.setdefault(tr_id, Counter())[str(prov)] += 1

    for tr_id, votes in track_team_votes.items():
        if tr_id not in track_to_confirmed_team:
            track_to_confirmed_team[tr_id] = votes.most_common(1)[0][0]

    # 2. Map master_id -> team (for frames where track_id might be missing)
    master_to_team: dict[str, str] = {}
    for rec in raw_records:
        mid = rec.get("master_id")
        tr_id = rec.get("track_id")
        if mid and tr_id in track_to_confirmed_team and mid not in master_to_team:
            master_to_team[mid] = track_to_confirmed_team[tr_id]

    # 3. Re-assign every raw record to its true post-processed team identity
    corrected_records = []
    for record in raw_records:
        item = dict(record)
        tr_id = item.get("track_id")
        mid = item.get("master_id")

        team_assigned = None
        if tr_id is not None and tr_id in track_to_confirmed_team:
            team_assigned = track_to_confirmed_team[tr_id]
        elif mid and mid in master_to_team:
            team_assigned = master_to_team[mid]
        elif item.get("provisional_team"):
            team_assigned = str(item["provisional_team"])

        if team_assigned:
            item["team"] = team_assigned
            corrected_records.append(item)

    # 4. Group records by assigned team and apply trajectory smoothing
    unfiltered_histories: dict[str, list[dict]] = {}
    for record in corrected_records:
        team = record["team"]
        unfiltered_histories.setdefault(team, []).append(record)

    histories: dict[str, list[dict]] = {}
    for team_id, records in unfiltered_histories.items():
        records.sort(key=lambda r: r["frame"])
        histories[team_id] = smooth_and_filter_trajectory(records, fps, window_size=7, deadband_m=0.03)

    return histories


def smooth_and_filter_trajectory(
    records: list[dict],
    fps: float,
    window_size: int = 7,
    deadband_m: float = 0.03
) -> list[dict]:
    """
    Applies Moving Average Trajectory Smoothing and windowed velocity calculation.
    Accurately computes real robot speeds (1.0 - 5.5 m/s) while filtering stationary jitter.
    """
    if not records:
        return []

    raw_x = [r["x_m"] for r in records]
    raw_y = [r["y_m"] for r in records]
    n = len(records)
    k = window_size // 2

    smooth_x = []
    smooth_y = []
    for i in range(n):
        start_idx = max(0, i - k)
        end_idx = min(n, i + k + 1)
        smooth_x.append(sum(raw_x[start_idx:end_idx]) / (end_idx - start_idx))
        smooth_y.append(sum(raw_y[start_idx:end_idx]) / (end_idx - start_idx))

    cleaned_records = []
    for i in range(n):
        frame = records[i]["frame"]
        time_sec = round(frame / fps, 2)
        
        # Calculate instantaneous speed over a 5-frame window centered at i
        w_start = max(0, i - 2)
        w_end = min(n - 1, i + 2)
        dt = (records[w_end]["frame"] - records[w_start]["frame"]) / fps
        
        if dt > 0 and w_end > w_start:
            dx = smooth_x[w_end] - smooth_x[w_start]
            dy = smooth_y[w_end] - smooth_y[w_start]
            dist = math.hypot(dx, dy)
            calc_speed = dist / dt
            # FRC swerve drives typically reach 2.0 - 5.5 m/s
            speed_mps = round(calc_speed, 2) if calc_speed <= 7.0 else 0.0
            if dist < deadband_m:
                speed_mps = 0.0
        else:
            speed_mps = 0.0

        cleaned_records.append({
            "frame": frame,
            "time_sec": time_sec,
            "x_m": round(smooth_x[i], 2),
            "y_m": round(smooth_y[i], 2),
            "speed_mps": speed_mps
        })

    return cleaned_records


def parse_detections(model, boxes):
    """
    Split raw YOLO boxes into Red and Blue detection lists.
    Each entry: {'coords', 'conf', 'center', 'track_id', 'class_name'}
    Filters out tiny noise boxes. Caps each alliance to top-3 by confidence.
    """
    current_red, current_blue = [], []

    if boxes is None:
        return current_red, current_blue

    for box in boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        coords = box.xyxy[0].tolist()
        class_name = model.names[cls_id].lower()

        # Filter tiny noise
        box_area = (coords[2] - coords[0]) * (coords[3] - coords[1])
        if box_area < MIN_BOX_AREA:
            continue

        # Grab BoT-SORT track ID (may be None on first frame)
        track_id = int(box.id[0]) if box.id is not None else None

        data = {
            "coords": coords,
            "conf": conf,
            "center": get_center(coords),
            "track_id": track_id,
            "class_name": class_name,
        }
        if "red" in class_name:
            current_red.append(data)
        elif "blue" in class_name:
            current_blue.append(data)

    # Keep only top-3 by confidence per alliance
    current_red = sorted(current_red, key=lambda x: x["conf"], reverse=True)[:3]
    current_blue = sorted(current_blue, key=lambda x: x["conf"], reverse=True)[:3]

    return current_red, current_blue


def greedy_assign_and_draw(
    frame,
    team: str,
    current_bots: list[dict],
    master_tracks: dict,
    track_to_team: dict,
    master_to_team: dict,
    homography: Optional[HomographyEngine] = None,
    telemetry_records: Optional[list[dict]] = None,
    frame_idx: int = 0,
    fps: float = 30.0,
):
    master_ids = [f"{team}_1", f"{team}_2", f"{team}_3"]

    # ── 1. GLOBAL GREEDY ASSIGNMENT ───────────────────────────────────
    pairs: list[tuple[float, int, str]] = []
    for bot_idx, bot in enumerate(current_bots):
        for mid in master_ids:
            # Check if this master track recently held this exact BoT-SORT ID
            is_botsort_match = (bot.get("track_id") is not None and 
                                master_tracks[mid].get("last_botsort_id") == bot.get("track_id"))
            is_team_match = (
                bot.get("track_id") in track_to_team
                and master_to_team.get(mid) == track_to_team[bot["track_id"]]
            )
            
            if master_tracks[mid]["coords"] is None:
                # Priority bonus for reclaiming a lost track with the same ID
                bonus = -1000 if is_botsort_match else 0
                pairs.append((0.0 + bonus, bot_idx, mid))
            else:
                last_center = get_center(master_tracks[mid]["coords"])
                dist = calc_dist(bot["center"], last_center)
                
                # THE FIX: If BoT-SORT visually tracked this robot through a crossing, 
                # apply a massive discount so it beats any spatial proximity errors.
                if is_botsort_match:
                    dist -= 1000 
                if is_team_match:
                    # A confirmed OCR identity is stronger than proximity.
                    dist -= 2000
                
                if dist < PROXIMITY_THRESH or dist < 0:
                    pairs.append((dist, bot_idx, mid))

    pairs.sort(key=lambda x: x[0])

    assigned_bots: set[int] = set()
    assigned_masters: set[str] = set()

    for _dist, bot_idx, mid in pairs:
        if bot_idx in assigned_bots or mid in assigned_masters:
            continue

        bot = current_bots[bot_idx]
        assigned_bots.add(bot_idx)
        assigned_masters.add(mid)

        previous_track_id = master_tracks[mid].get("last_botsort_id")
        previous_lost_frames = master_tracks[mid]["lost_frames"]
        current_track_id = bot.get("track_id")
        identity_changed_after_loss = (
            previous_track_id is not None
            and current_track_id is not None
            and previous_track_id != current_track_id
            and previous_lost_frames >= IDENTITY_RESET_LOST_FRAMES
        )
        if identity_changed_after_loss:
            # A different robot may have emerged at the old position. Do not
            # display the disappeared robot's number on it while OCR rechecks.
            master_to_team.pop(mid, None)

        # Update memory
        master_tracks[mid]["coords"] = bot["coords"]
        master_tracks[mid]["lost_frames"] = 0
        master_tracks[mid]["last_botsort_id"] = current_track_id

        botsort_id = bot.get("track_id")
        if botsort_id is not None:
            if botsort_id in track_to_team:
                val = track_to_team[botsort_id]
                for other_mid in master_ids:
                    if other_mid != mid and master_to_team.get(other_mid) == val:
                        del master_to_team[other_mid]
                master_to_team[mid] = val
            elif mid in master_to_team:
                val = master_to_team[mid]
                # Enforce uniqueness inside track_to_team when back-propagating
                for old_id, old_val in list(track_to_team.items()):
                    if old_val == val and old_id != botsort_id:
                        del track_to_team[old_id]
                track_to_team[botsort_id] = val

        current_team = track_to_team.get(current_track_id)
        if current_team is not None:
            team_label = f"TEAM {current_team}"
        elif mid in master_to_team:
            team_label = f"TEAM {master_to_team[mid]}"
        else:
            team_label = f"{mid.upper()}"

        x1, y1, x2, y2 = map(int, bot["coords"])
        color = TRACK_COLORS.get(mid, (0, 255, 0))
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)

        # Transform direct bounding box center to 2D field coordinates
        field_coords = None
        if homography and homography.is_calibrated():
            field_x, field_y = homography.box_center_to_field(bot["coords"])
            field_coords = (field_x, field_y)
            
            # Keep raw identity evidence. Team histories are rebuilt after OCR
            # corrections so a temporary swap does not poison the heatmap.
            if telemetry_records is not None:
                telemetry_records.append({
                    "frame": frame_idx,
                    "master_id": mid,
                    "track_id": current_track_id,
                    "provisional_team": current_team or master_to_team.get(mid),
                    "x_m": field_x,
                    "y_m": field_y,
                })

        label = f"{team_label} ({bot['conf']:.2f})"
        if field_coords:
            label += f" | {field_coords[0]}m, {field_coords[1]}m"

        cv2.putText(
            frame, label, (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
        )

    # ── 2. COAST UNMATCHED MASTER TRACKS ─────────────────────────────
    for mid in master_ids:
        if mid in assigned_masters:
            continue
        track = master_tracks[mid]
        if track["coords"] is not None and track["lost_frames"] < MAX_COAST_FRAMES:
            track["lost_frames"] += 1
            x1, y1, x2, y2 = map(int, track["coords"])
            color = COAST_COLORS.get(mid, (0, 150, 0))
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 1)
            
            if mid in master_to_team:
                label = f"TEAM {master_to_team[mid]} (COASTING)"
            else:
                label = f"{mid.upper()} (COASTING)"
            cv2.putText(
                frame, label, (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1,
            )

    # ── 3. SANITY CHECK: ENFORCE STRICT ALLIANCE-WIDE UNIQUENESS ─────
    # If the same team number is somehow assigned to more than one master track of the same alliance,
    # keep only the most active one and remove the duplicate from others.
    seen_teams = {}
    for mid in master_ids:
        if mid in master_to_team:
            val = master_to_team[mid]
            if val in seen_teams:
                prev_mid = seen_teams[val]
                prev_coasting = master_tracks[prev_mid]["lost_frames"] > 0
                curr_coasting = master_tracks[mid]["lost_frames"] > 0
                
                if prev_coasting and not curr_coasting:
                    # Current is active, previous is coasting. Keep current, delete previous.
                    del master_to_team[prev_mid]
                    seen_teams[val] = mid
                else:
                    # Otherwise, delete current
                    del master_to_team[mid]
            else:
                seen_teams[val] = mid


def apply_pigeonhole_principle(expected_teams: list[str], master_ids: list[str], master_to_team: dict):
    """
    If exactly 2 of the 3 master tracks have been assigned team numbers,
    auto-assign the remaining 3rd expected team number to the unassigned master track.
    """
    if len(expected_teams) != 3:
        return

    # Count how many of our master IDs have an assigned team
    assigned = {mid: master_to_team[mid] for mid in master_ids if mid in master_to_team}
    
    if len(assigned) == 2:
        # Find which master ID is unassigned
        unassigned_mid = [mid for mid in master_ids if mid not in master_to_team][0]
        
        # Find which expected team is not yet assigned
        assigned_teams = set(assigned.values())
        remaining_teams = [t for t in expected_teams if t not in assigned_teams]
        
        if len(remaining_teams) == 1:
            remaining_team = remaining_teams[0]
            master_to_team[unassigned_mid] = remaining_team
            print(f"[DEDUCTION] 💡 Pigeonhole Principle: Auto-assigned remaining Team {remaining_team} to {unassigned_mid.upper()}")


# ═══════════════════════════════════════════════════════════════════════════
# STEP 5 — MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════

def parse_args(argv: Optional[List[str]] = None):
    import argparse

    parser = argparse.ArgumentParser(
        description="FRC RobotDetector — match video → YOLO tracking → telemetry + Maneuver bundle"
    )
    parser.add_argument("--url", type=str, default=DEFAULT_VIDEO_URL or None, help="YouTube URL (ignored if --video is set)")
    parser.add_argument("--video", type=str, default=None, help="Local MP4 path (skips download)")
    parser.add_argument("--match-key", type=str, required=not bool(DEFAULT_MATCH_KEY), default=DEFAULT_MATCH_KEY or None, help="TBA match key, e.g. 2026tuis2_qm12")
    parser.add_argument("--event-key", type=str, default=None, help="Defaults to match-key prefix")
    parser.add_argument("--tba-key", type=str, default=None, help="Override TBA API key")
    parser.add_argument("--skip-tba", action="store_true", help="Force OCR roster instead of TBA")
    parser.add_argument("--skip-heatmaps", action="store_true")
    parser.add_argument("--skip-dual-view", action="store_true")
    parser.add_argument("--out-dir", type=str, default=None, help="Artifact dir (default outputs/<match_key>)")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None):
    global VIDEO_URL, TEMP_VIDEO, OUTPUT_VIDEO

    args = parse_args(argv)
    match_key = (args.match_key or "").strip()
    if not match_key:
        print("Error: --match-key is required (TBA key like 2026tuis2_qm12). Use cv_event_watcher.py for auto mode.")
        return 1
    if not args.video and not args.url:
        print("Error: provide --url (YouTube) or --video (local file)")
        return 1
    event_key = args.event_key or match_key.split("_")[0]
    artifact_dir = Path(args.out_dir) if args.out_dir else (PROJECT_ROOT / "outputs" / match_key)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    video_out_dir = artifact_dir / "videos"
    video_out_dir.mkdir(parents=True, exist_ok=True)
    heatmap_dir = artifact_dir / "heatmaps"
    heatmap_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.datetime.now()
    OUTPUT_VIDEO = video_out_dir / f"{MODEL_PATH.stem}_{now.strftime('%Y-%m-%d_%H-%M-%S')}.mp4"
    telemetry_path = artifact_dir / f"telemetry_{match_key}.json"
    bundle_path = artifact_dir / f"ai_scout_bundle_{match_key}.json"
    source_video = (
        Path(args.video)
        if args.video
        else (artifact_dir / f"{match_key}_source.mp4")
    )
    VIDEO_URL = args.url

    reporter = PipelineReporter()

    # ── 1. Download Video ──────────────────────────────────────────────
    reporter.phase("Video")
    if args.video:
        if not source_video.exists():
            reporter.warning(f"Local video not found: {source_video}")
            sys.exit(1)
        reporter.event(f"Using local video: {source_video}")
    else:
        download_video(VIDEO_URL, source_video)

    # ── 2. Initialize OCR early (needed for team detection) ────────────
    reporter.phase("OCR initialization")
    ocr_reader = init_ocr()

    # ── 3. Team roster (TBA preferred, OCR fallback) ───────────────────
    reporter.phase("Team roster")
    EXPECTED_RED: list[str] = []
    EXPECTED_BLUE: list[str] = []
    roster_source = "ocr"

    if not args.skip_tba:
        try:
            from api_fetch import fetch_match_alliances
            EXPECTED_RED, EXPECTED_BLUE = fetch_match_alliances(match_key, args.tba_key)
            roster_source = "tba"
            reporter.event(f"TBA roster: RED {EXPECTED_RED} | BLUE {EXPECTED_BLUE}")
        except Exception as e:
            reporter.warning(f"TBA roster failed ({e}); falling back to OCR")

    if len(EXPECTED_RED) < 3 or len(EXPECTED_BLUE) < 3:
        EXPECTED_RED, EXPECTED_BLUE = extract_teams_from_results_screen(
            source_video, ocr_reader, RESULTS_SCREEN_SEC
        )
        roster_source = "ocr"
        reporter.event(f"OCR roster: RED {EXPECTED_RED} | BLUE {EXPECTED_BLUE}")

    EXPECTED_ALL = EXPECTED_RED + EXPECTED_BLUE
    reporter.event(f"Teams: RED {EXPECTED_RED} | BLUE {EXPECTED_BLUE} (source={roster_source})")

    # ── 4. Open video & configure output writer ────────────────────────
    cap = cv2.VideoCapture(str(source_video))
    if not cap.isOpened():
        reporter.warning("Could not open video. Aborting.")
        sys.exit(1)

    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    full_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cropped_height = int(full_height * 0.65)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    reporter.event(f"Input: {width}x{full_height} at {fps} FPS | output height {cropped_height}px")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")  # type: ignore
    out = cv2.VideoWriter(str(OUTPUT_VIDEO), fourcc, fps, (width, cropped_height))

    # ── 5. Load YOLO model ─────────────────────────────────────────────
    model = load_model(MODEL_PATH)

    # ── 6. Initialize master track memory ──────────────────────────────
    master_tracks = {
        "red_1":  {"coords": None, "lost_frames": 0, "last_botsort_id": None},
        "red_2":  {"coords": None, "lost_frames": 0, "last_botsort_id": None},
        "red_3":  {"coords": None, "lost_frames": 0, "last_botsort_id": None},
        "blue_1": {"coords": None, "lost_frames": 0, "last_botsort_id": None},
        "blue_2": {"coords": None, "lost_frames": 0, "last_botsort_id": None},
        "blue_3": {"coords": None, "lost_frames": 0, "last_botsort_id": None},
    }

    # OCR mapping: BoT-SORT track_id → official team number string
    track_to_team: dict[int, str] = {}
    ocr_locked_ids: set[int] = set()
    ocr_history: dict[int, deque[str]] = {}
    ocr_last_frame: dict[int, int] = {}
    stable_track_frames: dict[int, int] = {}

    # Master track → team number (persists across BoT-SORT ID flickers)
    # Starts empty so OCR & tracking dynamically lock true team numbers during match
    master_to_team: dict[str, str] = {}

    cover_end_frame = int(COVER_DURATION_SEC * fps)
    match_end_frame = int(MATCH_END_SEC * fps)

    process_total = min(total_frames, match_end_frame) - cover_end_frame
    reporter.event(
        f"Processing {format_duration(process_total / fps)} of video | "
        f"OCR every {OCR_INTERVAL_FRAMES / fps:.1f}s"
    )

    # ── Homography & 2D Field Telemetry Setup ─────────────────────────
    MATCH_KEY = match_key
    EVENT_KEY = event_key
    TELEMETRY_PATH = telemetry_path

    homography = HomographyEngine(event_key=EVENT_KEY)
    if not homography.is_calibrated():
        reporter.phase("Homography Calibration")
        reporter.event(f"No existing 10-point calibration found for '{EVENT_KEY}'. Launching 10-point interactive calibrator (sampling at 5s)...")
        sample_frame_idx = int(5.0 * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, sample_frame_idx)
        ret_first, first_frame = cap.read()
        if ret_first:
            cropped_first = first_frame[0:cropped_height, 0:width]
            homography.calibrate_interactive(cropped_first)
            # Reset capture position back to 0
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        else:
            reporter.warning("Could not read frame for homography calibration.")

    raw_telemetry_records: list[dict] = []
    correction_events: list[dict] = []

    # ── 6. Process every frame ─────────────────────────────────────────
    frame_idx = 0
    reporter.phase("Inference and tracking")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Skip cover frames (first 3 seconds)
        if frame_idx < cover_end_frame:
            frame_idx += 1
            continue

        # Stop once the results screen appears (after 3 minutes)
        if frame_idx >= match_end_frame:
            reporter.event("Reached configured match end")
            break

        # Crop bottom 35% to remove the split-screen overlay
        cropped_frame = frame[0:cropped_height, 0:width]

        # Run YOLO + BoT-SORT inference
        results = run_inference(model, cropped_frame)
        boxes = results[0].boxes

        # Parse into red / blue
        current_red, current_blue = parse_detections(model, boxes)

        # Track stability is used to schedule OCR only on useful, settled crops.
        visible_track_ids = {
            bot["track_id"]
            for bot in current_red + current_blue
            if bot.get("track_id") is not None
        }
        for track_id in list(stable_track_frames):
            if track_id not in visible_track_ids:
                stable_track_frames[track_id] = 0
        for track_id in visible_track_ids:
            stable_track_frames[track_id] = stable_track_frames.get(track_id, 0) + 1

        # ── OCR PHASE (runs periodically on any unlocked tracks) ──────
        if frame_idx % OCR_INTERVAL_FRAMES == 0:
            all_bots = current_red + current_blue
            for bot in all_bots:
                botsort_id = bot.get("track_id")
                if botsort_id is None:
                    continue
                if stable_track_frames.get(botsort_id, 0) < OCR_STABLE_FRAMES:
                    continue
                cooldown = (
                    OCR_LOCKED_COOLDOWN
                    if botsort_id in ocr_locked_ids
                    else OCR_TRACK_COOLDOWN
                )
                if frame_idx - ocr_last_frame.get(botsort_id, -cooldown) < cooldown:
                    continue
                ocr_last_frame[botsort_id] = frame_idx

                # Crop the bounding box region from the frame
                x1, y1, x2, y2 = map(int, bot["coords"])
                
                # Handle inverted coordinates from YOLO (x1 >= x2 or y1 >= y2)
                if x1 > x2:
                    x1, x2 = x2, x1
                if y1 > y2:
                    y1, y2 = y2, y1

                # Clamp to frame boundaries
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(width, x2), min(cropped_height, y2)

                # Skip if crop size is empty or invalid
                if x1 >= x2 or y1 >= y2:
                    continue

                crop = cropped_frame[y1:y2, x1:x2]

                # Determine which expected list to match against
                if "red" in bot["class_name"]:
                    expected = EXPECTED_RED
                elif "blue" in bot["class_name"]:
                    expected = EXPECTED_BLUE
                else:
                    expected = EXPECTED_ALL

                # Run OCR with our new enhanced multi-crop logic!
                matched, confidence = run_ocr_on_crop(ocr_reader, crop, expected)
                if matched and confidence >= FUZZY_THRESHOLD:
                    history = ocr_history.setdefault(
                        botsort_id, deque(maxlen=OCR_HISTORY_SIZE)
                    )
                    history.append(matched)
                    vote_counts = Counter(history)
                    best_team, best_votes = vote_counts.most_common(1)[0]
                    second_votes = (
                        vote_counts.most_common(2)[1][1]
                        if len(vote_counts) > 1
                        else 0
                    )
                    if best_votes < OCR_VOTES_REQUIRED or best_votes <= second_votes:
                        if VERBOSE_LOGGING:
                            print(
                                f"[OCR] Tentative Track ID {botsort_id} → Team {matched} "
                                f"(best={best_team}: {best_votes}/{len(history)} samples)"
                            )
                        continue

                    matched = best_team
                    # Revalidation can replace a stale or incorrect previous lock.
                    for old_id, old_val in list(track_to_team.items()):
                        if old_val == matched and old_id != botsort_id:
                            del track_to_team[old_id]
                            ocr_locked_ids.discard(old_id)
                    track_to_team[botsort_id] = matched
                    ocr_locked_ids.add(botsort_id)
                    correction_events.append({
                        "frame": frame_idx,
                        "track_id": botsort_id,
                        "team": matched,
                    })
                    reporter.event(f"OCR confirmed track {botsort_id} as team {matched}")

        # ── GREEDY STITCHER & DRAW ─────────────────────────────────────
        greedy_assign_and_draw(
            cropped_frame, "red", current_red, master_tracks, track_to_team,
            master_to_team, homography=homography, telemetry_records=raw_telemetry_records,
            frame_idx=frame_idx, fps=fps
        )
        greedy_assign_and_draw(
            cropped_frame, "blue", current_blue, master_tracks, track_to_team,
            master_to_team, homography=homography, telemetry_records=raw_telemetry_records,
            frame_idx=frame_idx, fps=fps
        )

        # ── DEDUCTION (PIGEONHOLE PRINCIPLE) ───────────────────────────
        apply_pigeonhole_principle(EXPECTED_RED, ["red_1", "red_2", "red_3"], master_to_team)
        apply_pigeonhole_principle(EXPECTED_BLUE, ["blue_1", "blue_2", "blue_3"], master_to_team)

        # Write annotated frame
        out.write(cropped_frame)
        frame_idx += 1

        # Terminal telemetry every 50 frames
        if frame_idx % 50 == 0:
            reporter.progress(
                frame_idx - cover_end_frame,
                process_total,
            )

    # ── 7. Export Telemetry JSON & Cleanup ─────────────────────────────
    cap.release()
    out.release()
    cv2.destroyAllWindows()
    reporter.progress(min(frame_idx - cover_end_frame, process_total), process_total)
    reporter.finish()

    # Save structured telemetry JSON
    telemetry_records = build_corrected_telemetry(
        raw_telemetry_records, correction_events, fps
    )
    processed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    telemetry_output = {
        "match_key": MATCH_KEY,
        "event_key": EVENT_KEY,
        "fps": fps,
        "roster_source": roster_source,
        "red_teams": EXPECTED_RED,
        "blue_teams": EXPECTED_BLUE,
        "processed_at": processed_at,
        "field_dimensions_m": {"length": 16.54, "width": 8.21},
        "teams": telemetry_records,
        "correction_events": correction_events,
    }
    with open(TELEMETRY_PATH, "w") as f:
        json.dump(telemetry_output, f, indent=2)

    reporter.phase("Complete — core artifacts")
    reporter.event(f"Frames processed: {max(frame_idx - cover_end_frame, 0):,}")
    reporter.event(f"Video Output: {OUTPUT_VIDEO}")
    reporter.event(f"Telemetry Output: {TELEMETRY_PATH}")
    reporter.event(f"Confirmed teams: {track_to_team}")

    # ── 8. Maneuver AI scout bundle ────────────────────────────────────
    try:
        from export_ai_telemetry import process_ai_telemetry
        reporter.phase("AI scout bundle")
        process_ai_telemetry(
            str(TELEMETRY_PATH),
            str(bundle_path),
            red_teams=EXPECTED_RED,
            blue_teams=EXPECTED_BLUE,
        )
        public_copy = PROJECT_ROOT / "web" / "public" / "ai_scout_bundle.json"
        if public_copy.parent.exists():
            import shutil
            shutil.copy2(bundle_path, public_copy)
            reporter.event(f"Copied bundle → {public_copy}")
    except Exception as e:
        reporter.warning(f"Bundle export failed: {e}")

    # ── 9. Heatmaps ────────────────────────────────────────────────────
    if not args.skip_heatmaps:
        try:
            reporter.phase("Heatmaps")
            from generate_heatmap import (
                generate_alliance_heatmap,
                generate_team_heatmap,
                load_telemetry,
            )
            import generate_heatmap as gh
            gh.OUTPUT_DIR = heatmap_dir
            tel = load_telemetry(Path(TELEMETRY_PATH))
            for team_id in tel.get("teams", {}).keys():
                out_file = heatmap_dir / f"{MATCH_KEY}_team_{team_id}_heatmap.png"
                generate_team_heatmap(tel, team_id, out_file)
            blue_ids = [str(t) for t in tel.get("blue_teams", [])]
            red_ids = [str(t) for t in tel.get("red_teams", [])]
            if blue_ids:
                generate_alliance_heatmap(
                    tel,
                    blue_ids,
                    heatmap_dir / f"{MATCH_KEY}_team_alliance_blue_heatmap.png",
                )
            if red_ids:
                generate_alliance_heatmap(
                    tel,
                    red_ids,
                    heatmap_dir / f"{MATCH_KEY}_team_alliance_red_heatmap.png",
                )
            reporter.event(f"Heatmaps → {heatmap_dir}")
        except Exception as e:
            reporter.warning(f"Heatmap generation failed: {e}")

    # Generate Dual-View Inspection Video (Top: Broadcast Video, Bottom: 2D Field Map)
    if not args.skip_dual_view:
        try:
            time.sleep(0.5)  # Ensure video file handle is fully flushed by OS
            from render_dual_view import render_dual_view_video
            dual_view_output = video_out_dir / f"dual_view_{MATCH_KEY}.mp4"
            reporter.phase("Dual-View Video Synthesis")
            render_dual_view_video(OUTPUT_VIDEO, TELEMETRY_PATH, dual_view_output)
            reporter.event(f"Dual-View Inspection Video: {dual_view_output}")
        except Exception as e:
            reporter.warning(f"Could not synthesize dual-view video: {e}")

    reporter.phase("Done")
    reporter.event(f"Artifact folder: {artifact_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
