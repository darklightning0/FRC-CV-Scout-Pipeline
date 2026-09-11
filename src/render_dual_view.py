"""
render_dual_view.py — Split-Screen Dual-View Calibration & Telemetry Inspector (2026 Game)
==========================================================================================
Combines the annotated camera broadcast video (top half) with a synchronized 2D top-down
2026 field blueprint background (bottom half) rendering real-time robot position dots, trails, and speed HUD.

Usage:
    python src/render_dual_view.py --video outputs/videos/best_8_2026-09-09_14-59-56.mp4 --telemetry outputs/telemetry_2024tuis2_qm48.json
"""

import json
import math
import argparse
from pathlib import Path
import cv2
import numpy as np
from typing import Dict, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "videos"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 2026 FRC Field Background Image
FIELD_IMAGE_PATH = PROJECT_ROOT / "src" / "2026_Field_Crop_No-Fuel_White.png"

# Standard FRC Field Dimensions (Meters)
FIELD_LENGTH_M = 16.54
FIELD_WIDTH_M = 8.21

# Team Color Palette (BGR for OpenCV)
SPECIFIC_TEAM_COLORS = [
    (0, 0, 255),    # Red 1
    (0, 140, 255),  # Orange/Red 2
    (0, 220, 255),  # Yellow/Red 3
    (255, 100, 0),  # Blue 1
    (255, 180, 0),  # Light Blue 2
    (255, 50, 150)  # Purple Blue 3
]


class DualViewRenderer:
    """Renders 2026 field background canvas and stacks it below the camera video."""

    def __init__(self, canvas_width: int = 1920, canvas_height: int = 500):
        self.width = canvas_width
        self.height = canvas_height
        
        # Load 2026 Field Image as background
        if FIELD_IMAGE_PATH.exists():
            base_img = cv2.imread(str(FIELD_IMAGE_PATH))
            self.base_canvas = cv2.resize(base_img, (self.width, self.height))
        else:
            self.base_canvas = np.zeros((self.height, self.width, 3), dtype=np.uint8)
            self.base_canvas[:] = (30, 30, 35)

    def field_to_pixel(self, x_m: float, y_m: float) -> Tuple[int, int]:
        """
        Converts 2D field coordinates (meters) to canvas pixel coordinates (px).
        Offsets rendering area below the top title bar (y = 40 to y = height - 10).
        """
        norm_x = np.clip(x_m / FIELD_LENGTH_M, 0.0, 1.0)
        norm_y = np.clip(y_m / FIELD_WIDTH_M, 0.0, 1.0)
        
        margin_top = 42
        usable_h = self.height - margin_top - 12
        usable_w = self.width - 40
        
        px = int(20 + norm_x * usable_w)
        py = int(margin_top + (1.0 - norm_y) * usable_h)  # Invert Y for screen space
        
        # Clamp to canvas bounds
        px = int(np.clip(px, 15, self.width - 15))
        py = int(np.clip(py, margin_top + 5, self.height - 15))
        return px, py

    def draw_field_base(self) -> np.ndarray:
        """Returns a fresh copy of the 2026 field background canvas."""
        canvas = self.base_canvas.copy()

        # Header Title Overlay
        cv2.rectangle(canvas, (0, 0), (self.width, 36), (0, 0, 0), -1)
        cv2.putText(canvas, "FRC 2026 — REAL-TIME 2D FIELD TRACKING & HOMOGRAPHY INSPECTOR",
                    (20, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        return canvas

    def render_frame_canvas(
        self,
        telemetry: dict,
        current_frame: int,
        trail_frames: int = 90
    ) -> np.ndarray:
        """Renders the 2D field canvas for a specific frame."""
        canvas = self.draw_field_base()
        teams_data = telemetry.get("teams", {})

        team_color_idx = 0

        for team_id, records in teams_data.items():
            if not records:
                continue

            color = SPECIFIC_TEAM_COLORS[team_color_idx % len(SPECIFIC_TEAM_COLORS)]
            team_color_idx += 1

            # Filter points up to current frame
            past_records = [r for r in records if r["frame"] <= current_frame and r["x_m"] > 0]
            if not past_records:
                continue

            # 1. Draw Trail History (last `trail_frames` frames)
            recent_trail = [r for r in past_records if current_frame - r["frame"] <= trail_frames]
            if len(recent_trail) > 1:
                trail_pts = [self.field_to_pixel(r["x_m"], r["y_m"]) for r in recent_trail]
                for i in range(1, len(trail_pts)):
                    alpha = i / len(trail_pts)
                    thickness = int(1 + 3 * alpha)
                    cv2.line(canvas, trail_pts[i-1], trail_pts[i], color, thickness, cv2.LINE_AA)

            # 2. Draw Current Position Marker
            curr = past_records[-1]
            if current_frame - curr["frame"] <= 15:  # Currently active
                px, py = self.field_to_pixel(curr["x_m"], curr["y_m"])
                
                # Outer glow & circle marker
                cv2.circle(canvas, (px, py), 12, color, -1, cv2.LINE_AA)
                cv2.circle(canvas, (px, py), 14, (255, 255, 255), 2, cv2.LINE_AA)
                
                # Team label & speed text
                label = f"{team_id} ({curr.get('speed_mps', 0.0):.1f}m/s)"
                cv2.putText(canvas, label, (px + 16, py + 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3)  # Shadow
                cv2.putText(canvas, label, (px + 16, py + 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

        return canvas


def render_dual_view_video(video_path: Path, telemetry_path: Path, output_path: Path):
    """
    Reads the camera video and telemetry JSON, creates the dual-view split-screen,
    and writes out the combined MP4 video with zero telemetry latency.
    """
    print(f"[DUAL-VIEW] Loading video: {video_path}")
    print(f"[DUAL-VIEW] Loading telemetry: {telemetry_path}")

    if not telemetry_path.exists():
        outputs_dir = PROJECT_ROOT / "outputs"
        fallback_paths = [
            outputs_dir / "telemetry_2024tuis2_qm48.json",
            *outputs_dir.glob("telemetry_*.json")
        ]
        found_fallback = None
        for p in fallback_paths:
            if p.exists():
                found_fallback = p
                break
        
        if found_fallback:
            print(f"⚠️ Warning: Requested telemetry '{telemetry_path.name}' not found. Falling back to: {found_fallback}")
            telemetry_path = found_fallback
        else:
            print(f"❌ Error: Could not find telemetry file at {telemetry_path}")
            return

    with open(telemetry_path, "r") as f:
        telemetry = json.load(f)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"❌ Error: Could not open video file {video_path}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Bottom 2D field canvas height matching field image aspect ratio
    bottom_h = 500
    output_h = h + bottom_h
    output_w = w

    renderer = DualViewRenderer(canvas_width=output_w, canvas_height=bottom_h)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")  # type: ignore
    out = cv2.VideoWriter(str(output_path), fourcc, fps, (output_w, output_h))

    // Detect if the video is already trimmed (legacy pipelines skipped a 3s cover)
    cover_end_frame = int(0.0 * fps)
    
    # Check if telemetry frames start near cover_end_frame (e.g., ~180)
    all_telemetry_frames = [
        rec["frame"]
        for team_recs in telemetry.get("teams", {}).values()
        for rec in team_recs
    ]
    min_telemetry_frame = min(all_telemetry_frames) if all_telemetry_frames else 0

    print(f"[DUAL-VIEW] Synthesizing 2026 dual-view video ({output_w}x{output_h} @ {fps:.1f} FPS)...")

    video_frame_idx = 0

    while cap.isOpened():
        ret, top_frame = cap.read()
        if not ret:
            break

        # Calculate exact matching telemetry frame index (zero latency sync)
        if min_telemetry_frame >= cover_end_frame:
            telemetry_frame_idx = video_frame_idx + cover_end_frame
        else:
            telemetry_frame_idx = video_frame_idx

        # Generate bottom 2026 2D field canvas
        bottom_canvas = renderer.render_frame_canvas(telemetry, telemetry_frame_idx)

        # Vertically stack top camera video + bottom 2026 field map
        combined_frame = np.vstack([top_frame, bottom_canvas])

        out.write(combined_frame)
        video_frame_idx += 1

        if video_frame_idx % 100 == 0:
            print(f"  Processed {video_frame_idx}/{total_frames} frames...")

    cap.release()
    out.release()
    print(f"✅ [DUAL-VIEW] Output saved to: {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Render Dual-View 3D Video + 2D Field Telemetry Video")
    parser.add_argument("--video", type=str, default=str(PROJECT_ROOT / "outputs" / "temp_1080p_match.mp4"), help="Path to video")
    parser.add_argument("--telemetry", type=str, default=str(PROJECT_ROOT / "outputs" / "telemetry_2026tuis2_qm48.json"), help="Path to telemetry JSON")
    parser.add_argument("--output", type=str, default=None, help="Output MP4 video path")
    args = parser.parse_args()

    video_p = Path(args.video)
    telemetry_p = Path(args.telemetry)
    out_p = Path(args.output) if args.output else OUTPUT_DIR / f"dual_view_{telemetry_p.stem}.mp4"

    render_dual_view_video(video_p, telemetry_p, out_p)
