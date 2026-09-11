"""
homography.py — Interactive 6-Point Field Homography & Coordinate Mapping Engine
=================================================================================
Allows a scout to click 6 key landmarks on Frame 1 of an FRC match broadcast video:
  1. Top-Left Corner          (0.0,  8.21)
  2. Bottom-Left Corner       (0.0,  0.00)
  3. Top-Right Corner         (16.54, 8.21)
  4. Bottom-Right Corner      (16.54, 0.00)
  5. Upper Center White Line  (8.27,  8.21)
  6. Bottom Center White Line (8.27,  0.00)

Saves the homography matrix to config/homography_<event_key>.json for reuse across
all match videos from that regional event.
"""

import json
from pathlib import Path
import cv2
import numpy as np
from typing import Tuple, List, Optional, Dict

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = PROJECT_ROOT / "config"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

# Standard FRC Field Dimensions (in Meters)
FIELD_LENGTH_M = 16.54  # Long side (X)
FIELD_WIDTH_M = 8.21    # Short side (Y)
BLUE_LINE_X = 4.63
RED_LINE_X = 11.91

# Target 10 points in real-world 2D field meters
POINT_NAMES = [
    "1/10: Click TOP-LEFT Corner (Red Alliance Upper Edge in Video [Far Guardrail])",
    "2/10: Click BOTTOM-LEFT Corner (Red Alliance Lower Edge in Video [Near Guardrail])",
    "3/10: Click TOP-RIGHT Corner (Blue Alliance Upper Edge in Video [Far Guardrail])",
    "4/10: Click BOTTOM-RIGHT Corner (Blue Alliance Lower Edge in Video [Near Guardrail — (0,0) Point])",
    "5/10: Click UPPER Center White Line Intersection",
    "6/10: Click BOTTOM Center White Line Intersection",
    "7/10: Click UPPER Blue Tape Line (Right Side Upper in Video)",
    "8/10: Click BOTTOM Blue Tape Line (Right Side Lower in Video)",
    "9/10: Click UPPER Red Tape Line (Left Side Upper in Video)",
    "10/10: Click BOTTOM Red Tape Line (Left Side Lower in Video)",
]

DEFAULT_REAL_POINTS = np.array([
    [FIELD_LENGTH_M, FIELD_WIDTH_M],        # 1. Video Top-Left (Red Wall Far Guardrail)
    [FIELD_LENGTH_M, 0.0],                   # 2. Video Bottom-Left (Red Wall Near Guardrail)
    [0.0, FIELD_WIDTH_M],                    # 3. Video Top-Right (Blue Wall Far Guardrail)
    [0.0, 0.0],                              # 4. Video Bottom-Right (Blue Wall Near Guardrail — (0,0))
    [FIELD_LENGTH_M / 2.0, FIELD_WIDTH_M],   # 5. Upper Center Line
    [FIELD_LENGTH_M / 2.0, 0.0],             # 6. Bottom Center Line
    [BLUE_LINE_X, FIELD_WIDTH_M],            # 7. Upper Blue Line
    [BLUE_LINE_X, 0.0],                      # 8. Bottom Blue Line
    [RED_LINE_X, FIELD_WIDTH_M],             # 9. Upper Red Line
    [RED_LINE_X, 0.0],                       # 10. Bottom Red Line
], dtype=np.float32)


class HomographyEngine:
    """Handles 10-point interactive calibration, matrix persistence, and pixel->field conversion."""

    def __init__(self, event_key: str = "default_event", field_length: float = FIELD_LENGTH_M, field_width: float = FIELD_WIDTH_M):
        self.event_key = event_key
        self.field_length = field_length
        self.field_width = field_width
        self.config_path = CONFIG_DIR / f"homography_{self.event_key}.json"
        self.matrix: Optional[np.ndarray] = None
        self.real_points = np.array([
            [self.field_length, self.field_width],
            [self.field_length, 0.0],
            [0.0, self.field_width],
            [0.0, 0.0],
            [self.field_length / 2.0, self.field_width],
            [self.field_length / 2.0, 0.0],
            [BLUE_LINE_X, self.field_width],
            [BLUE_LINE_X, 0.0],
            [RED_LINE_X, self.field_width],
            [RED_LINE_X, 0.0],
        ], dtype=np.float32)

        # Attempt auto-loading existing config
        self.load()

    def is_calibrated(self) -> bool:
        return self.matrix is not None

    def save(self):
        """Save the homography matrix to JSON."""
        if self.matrix is None:
            return
        data = {
            "event_key": self.event_key,
            "field_length_m": self.field_length,
            "field_width_m": self.field_width,
            "matrix": self.matrix.tolist()
        }
        with open(self.config_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[HOMOGRAPHY] Matrix saved to: {self.config_path}")

    def load(self) -> bool:
        """Load homography matrix from JSON if it exists."""
        if self.config_path.exists():
            try:
                with open(self.config_path, "r") as f:
                    data = json.load(f)
                self.matrix = np.array(data["matrix"], dtype=np.float64)
                print(f"[HOMOGRAPHY] Loaded saved matrix for event '{self.event_key}' from {self.config_path.name}")
                return True
            except Exception as e:
                print(f"[HOMOGRAPHY] Error loading matrix: {e}")
                self.matrix = None
        return False

    def calibrate_interactive(self, frame: np.ndarray) -> Optional[np.ndarray]:
        """
        Launches an interactive OpenCV window where the user clicks 6 key points on the frame:
        1. Top-Left Corner
        2. Bottom-Left Corner
        3. Top-Right Corner
        4. Bottom-Right Corner
        5. Upper Center Line
        6. Bottom Center Line
        """
        image_points: List[Tuple[float, float]] = []
        display_frame = frame.copy()
        h, w = display_frame.shape[:2]

        # Calculate scale factor for display if image is large
        max_dim = 1280
        scale = min(1.0, max_dim / max(h, w))
        if scale < 1.0:
            resized_display = cv2.resize(display_frame, (int(w * scale), int(h * scale)))
        else:
            resized_display = display_frame.copy()

        window_name = f"10-Point Field Calibration — {self.event_key}"

        def mouse_callback(event, x, y, flags, param):
            nonlocal resized_display, image_points
            if event == cv2.EVENT_LBUTTONDOWN and len(image_points) < 10:
                # Convert back to unscaled frame coordinates
                orig_x = float(x) / scale
                orig_y = float(y) / scale
                image_points.append((orig_x, orig_y))
                
                # Draw point and label
                idx = len(image_points) - 1
                cv2.circle(resized_display, (x, y), 6, (0, 0, 255), -1)
                cv2.putText(resized_display, f"P{idx+1}", (x + 8, y - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                cv2.imshow(window_name, resized_display)

        cv2.namedWindow(window_name, cv2.WINDOW_AUTOSIZE)
        cv2.setMouseCallback(window_name, mouse_callback)

        print("\n=======================================================")
        print(f" 🎯 INTERACTIVE 10-POINT HOMOGRAPHY CALIBRATION ({self.event_key})")
        print("=======================================================")
        print("Please click the following 10 points on the video window in order:")
        for idx, text in enumerate(POINT_NAMES):
            print(f"  {idx+1}. {text}")
        print("Press 'r' to reset points. Press 'q' or 'ESC' to cancel.")
        print("=======================================================\n")

        while True:
            # Draw current instructions on screen
            canvas = resized_display.copy()
            if len(image_points) < 10:
                prompt_str = POINT_NAMES[len(image_points)]
                cv2.rectangle(canvas, (0, 0), (canvas.shape[1], 40), (0, 0, 0), -1)
                cv2.putText(canvas, prompt_str, (15, 26),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 0), 2)
            else:
                cv2.rectangle(canvas, (0, 0), (canvas.shape[1], 40), (0, 128, 0), -1)
                cv2.putText(canvas, "✅ 10 Points Selected! Press ENTER / SPACE to confirm or 'r' to reset.",
                            (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            cv2.imshow(window_name, canvas)
            key = cv2.waitKey(20) & 0xFF

            if key in [13, 32] and len(image_points) == 10:  # Enter or Space
                break
            elif key == ord('r'):
                image_points.clear()
                resized_display = cv2.resize(display_frame, (int(w * scale), int(h * scale))) if scale < 1.0 else display_frame.copy()
                print("[HOMOGRAPHY] Points reset. Start clicking again from Point 1.")
            elif key in [27, ord('q')]:
                print("[HOMOGRAPHY] Calibration cancelled by user.")
                cv2.destroyWindow(window_name)
                return None

        cv2.destroyWindow(window_name)

        # Compute Homography Matrix using RANSAC
        src_pts = np.array(image_points, dtype=np.float32)
        H, mask = cv2.findHomography(src_pts, self.real_points, cv2.RANSAC, 5.0)

        if H is not None:
            self.matrix = H
            self.save()
            print(f"[HOMOGRAPHY] Successfully calibrated matrix for event '{self.event_key}'!")
            return H
        else:
            print("[HOMOGRAPHY] ❌ Failed to calculate Homography matrix from points.")
            return None

    def pixel_to_field(self, px: float, py: float) -> Tuple[float, float]:
        """
        Converts pixel coordinates (px, py) on the video frame into
        real-world field coordinates (X_meters, Y_meters) on the carpet.
        
        Clamps results to valid field boundaries [0, field_length] and [0, field_width].
        """
        if self.matrix is None:
            raise ValueError("Homography engine is not calibrated! Run calibrate_interactive() or load a config first.")

        pt = np.array([px, py, 1.0], dtype=np.float64)
        target = self.matrix @ pt

        if abs(target[2]) < 1e-6:
            return 0.0, 0.0

        x_m = target[0] / target[2]
        y_m = target[1] / target[2]

        # Clamp to valid field boundaries
        x_m_clamped = float(np.clip(x_m, 0.0, self.field_length))
        y_m_clamped = float(np.clip(y_m, 0.0, self.field_width))

        return round(x_m_clamped, 2), round(y_m_clamped, 2)

    def box_center_to_field(self, box_xyxy: List[float]) -> Tuple[float, float]:
        """
        Extracts point at 30% height from bottom (70% down from top y1) of bounding box [x1, y1, x2, y2]
        and projects it onto the 2D field plane.
        """
        x1, y1, x2, y2 = box_xyxy
        center_x = (x1 + x2) / 2.0
        target_y = y1 + 0.7 * (y2 - y1)  # 30% from bottom of bounding box
        return self.pixel_to_field(center_x, target_y)

    def bottom_center_to_field(self, box_xyxy: List[float]) -> Tuple[float, float]:
        """Alias for backward compatibility using 30% box point."""
        return self.box_center_to_field(box_xyxy)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Test 6-Point Homography Engine")
    parser.add_argument("--video", type=str, default=str(PROJECT_ROOT / "outputs" / "temp_1080p_match.mp4"), help="Path to match video")
    parser.add_argument("--event", type=str, default="2026tuis2", help="Event key")
    parser.add_argument("--seek-sec", type=float, default=5.0, help="Seconds into video to sample calibration frame (skips thumbnail intro)")
    args = parser.parse_args()

    engine = HomographyEngine(event_key=args.event)

    if engine.is_calibrated():
        print(f"✅ Found existing calibration matrix for '{args.event}'.")
        print("Matrix:\n", engine.matrix)
    else:
        print(f"No existing calibration for '{args.event}'. Opening video at {args.seek_sec}s for 10-point calibration...")
        cap = cv2.VideoCapture(args.video)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        seek_frame = int(args.seek_sec * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, seek_frame)
        ret, frame = cap.read()
        cap.release()

        if ret:
            engine.calibrate_interactive(frame)
        else:
            print(f"❌ Could not read video frame at {args.seek_sec}s from: {args.video}")
