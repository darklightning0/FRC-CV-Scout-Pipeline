"""
generate_heatmap.py — FRC 2026 field heatmaps (UI-clean)

Uses the meter-calibrated field crop so paths stay inside the field border,
then darkens the white backdrop to match Maneuver’s dark map look.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from scipy.stats import gaussian_kde

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "heatmaps"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Meter-accurate: field fills the frame (do not use Maneuver chrome art here).
FIELD_IMAGE_PATH = PROJECT_ROOT / "src" / "2026_Field_Crop_No-Fuel_White.png"

FIELD_LENGTH_M = 16.54
FIELD_WIDTH_M = 8.21

OUT_W = 1600
OUT_H = 800


def load_telemetry(telemetry_path: Path) -> dict:
    with open(telemetry_path, "r") as f:
        return json.load(f)


def _load_field_canvas() -> np.ndarray:
    """Stretch calibrated crop to 2:1 and restyle white void → dark UI tone."""
    if not FIELD_IMAGE_PATH.exists():
        canvas = np.full((OUT_H, OUT_W, 3), 30, dtype=np.uint8)
        cv2.rectangle(canvas, (0, 0), (OUT_W - 1, OUT_H - 1), (200, 200, 200), 2)
        return canvas

    img = cv2.imread(str(FIELD_IMAGE_PATH), cv2.IMREAD_COLOR)
    canvas = cv2.resize(img, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)

    # White page → dark so it matches Team Stats field cards
    white = np.all(canvas.astype(np.int16) >= 235, axis=2)
    canvas[white] = (45, 45, 48)
    return canvas


def field_to_px(x_m: float, y_m: float) -> tuple[int, int]:
    """Meters → full-canvas pixels (crop is full-bleed field). y=0 at bottom."""
    nx = float(np.clip(x_m / FIELD_LENGTH_M, 0.0, 1.0))
    ny = float(np.clip(y_m / FIELD_WIDTH_M, 0.0, 1.0))
    # Inset 1.5% so wall-hugging tracks stay inside the drawn border stroke
    inset_x = int(OUT_W * 0.015)
    inset_y = int(OUT_H * 0.015)
    usable_w = OUT_W - 2 * inset_x - 1
    usable_h = OUT_H - 2 * inset_y - 1
    px = int(round(inset_x + nx * usable_w))
    py = int(round(inset_y + (1.0 - ny) * usable_h))
    return px, py


def _team_xy(telemetry: dict, team_id: str) -> tuple[np.ndarray, np.ndarray] | None:
    history = telemetry.get("teams", {}).get(team_id, [])
    if not history:
        return None
    x_coords = [
        float(np.clip(p["x_m"], 0.0, FIELD_LENGTH_M))
        for p in history
        if p.get("x_m", 0) > 0 and p.get("y_m", 0) > 0
    ]
    y_coords = [
        float(np.clip(p["y_m"], 0.0, FIELD_WIDTH_M))
        for p in history
        if p.get("x_m", 0) > 0 and p.get("y_m", 0) > 0
    ]
    if len(x_coords) < 10:
        return None
    return np.asarray(x_coords, dtype=np.float64), np.asarray(y_coords, dtype=np.float64)


def _kde_heat_u8(x: np.ndarray, y: np.ndarray, roi_w: int, roi_h: int) -> np.ndarray:
    kde = gaussian_kde(np.vstack([x, y]))
    gx, gy = np.mgrid[0:FIELD_LENGTH_M:320j, 0:FIELD_WIDTH_M:160j]
    z = kde(np.vstack([gx.ravel(), gy.ravel()])).reshape(gx.shape)
    heat = np.flipud(z.T)
    heat = heat / (heat.max() + 1e-12)
    heat_u8 = (np.clip(heat, 0, 1) * 255).astype(np.uint8)
    return cv2.resize(heat_u8, (roi_w, roi_h), interpolation=cv2.INTER_LINEAR)


def _blend_colored_heat(
    canvas: np.ndarray,
    heat_u8: np.ndarray,
    color_bgr: tuple[int, int, int],
    alpha_scale: float = 0.5,
) -> None:
    inset_x = int(OUT_W * 0.015)
    inset_y = int(OUT_H * 0.015)
    roi_h, roi_w = heat_u8.shape[:2]
    y1, y2 = inset_y, inset_y + roi_h
    x1, x2 = inset_x, inset_x + roi_w
    alpha = (heat_u8.astype(np.float32) / 255.0) * alpha_scale
    tint = np.zeros((roi_h, roi_w, 3), dtype=np.float32)
    tint[:, :] = color_bgr
    region = canvas[y1:y2, x1:x2].astype(np.float32)
    blended = region * (1.0 - alpha[:, :, None]) + tint * alpha[:, :, None]
    canvas[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)


def generate_team_heatmap(telemetry: dict, team_id: str, output_path: Path):
    xy = _team_xy(telemetry, team_id)
    if xy is None:
        history = telemetry.get("teams", {}).get(team_id, [])
        if not history:
            print(f"[HEATMAP] No telemetry data found for team '{team_id}'.")
        else:
            print(f"[HEATMAP] Not enough points to generate KDE heatmap for team '{team_id}'.")
        return

    x, y = xy
    canvas = _load_field_canvas()
    inset_x = int(OUT_W * 0.015)
    inset_y = int(OUT_H * 0.015)
    roi_w = OUT_W - 2 * inset_x
    roi_h = OUT_H - 2 * inset_y
    heat_u8 = _kde_heat_u8(x, y, roi_w, roi_h)
    heat_color = cv2.applyColorMap(heat_u8, cv2.COLORMAP_MAGMA)
    alpha = (heat_u8.astype(np.float32) / 255.0) * 0.55

    y1, y2 = inset_y, inset_y + roi_h
    x1, x2 = inset_x, inset_x + roi_w
    region = canvas[y1:y2, x1:x2].astype(np.float32)
    blended = region * (1.0 - alpha[:, :, None]) + heat_color.astype(np.float32) * alpha[:, :, None]
    canvas[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)

    step = max(1, len(x) // 1500)
    pts = np.array(
        [field_to_px(float(xx), float(yy)) for xx, yy in zip(x[::step], y[::step])],
        dtype=np.int32,
    )
    if len(pts) >= 2:
        cv2.polylines(
            canvas,
            [pts],
            isClosed=False,
            color=(238, 211, 34),
            thickness=2,
            lineType=cv2.LINE_AA,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), canvas)
    print(f"[HEATMAP] Saved heatmap to: {output_path}")


# Distinct BGR colors for up to 3 alliance robots (readable on dark field)
ALLIANCE_STACK_COLORS_BGR = (
    (248, 189, 56),   # sky
    (250, 167, 167),  # soft red/pink
    (153, 211, 52),   # lime
)


def generate_alliance_heatmap(
    telemetry: dict,
    team_ids: list[str],
    output_path: Path,
    colors_bgr: tuple[tuple[int, int, int], ...] = ALLIANCE_STACK_COLORS_BGR,
) -> bool:
    """Stack up to 3 team KDEs onto one field image with distinct colors."""
    canvas = _load_field_canvas()
    inset_x = int(OUT_W * 0.015)
    inset_y = int(OUT_H * 0.015)
    roi_w = OUT_W - 2 * inset_x
    roi_h = OUT_H - 2 * inset_y

    drawn = 0
    for idx, team_id in enumerate(team_ids[:3]):
        xy = _team_xy(telemetry, str(team_id))
        if xy is None:
            continue
        x, y = xy
        heat_u8 = _kde_heat_u8(x, y, roi_w, roi_h)
        color = colors_bgr[idx % len(colors_bgr)]
        _blend_colored_heat(canvas, heat_u8, color, alpha_scale=0.48)

        step = max(1, len(x) // 1200)
        pts = np.array(
            [field_to_px(float(xx), float(yy)) for xx, yy in zip(x[::step], y[::step])],
            dtype=np.int32,
        )
        if len(pts) >= 2:
            cv2.polylines(
                canvas,
                [pts],
                isClosed=False,
                color=color,
                thickness=2,
                lineType=cv2.LINE_AA,
            )
        drawn += 1

    if drawn == 0:
        print(f"[HEATMAP] No alliance teams with enough points for {output_path.name}")
        return False

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), canvas)
    print(f"[HEATMAP] Saved stacked alliance heatmap to: {output_path}")
    return True


def generate_all_heatmaps(telemetry_path: Path):
    telemetry = load_telemetry(telemetry_path)
    match_key = telemetry.get("match_key", "match")
    for team_id in telemetry.get("teams", {}).keys():
        out_file = OUTPUT_DIR / f"{match_key}_team_{team_id}_heatmap.png"
        generate_team_heatmap(telemetry, team_id, out_file)

    blue = [str(t) for t in telemetry.get("blue_teams", [])]
    red = [str(t) for t in telemetry.get("red_teams", [])]
    if blue:
        generate_alliance_heatmap(
            telemetry, blue, OUTPUT_DIR / f"{match_key}_team_alliance_blue_heatmap.png"
        )
    if red:
        generate_alliance_heatmap(
            telemetry, red, OUTPUT_DIR / f"{match_key}_team_alliance_red_heatmap.png"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate clean field heatmaps from telemetry JSON")
    parser.add_argument("--telemetry", type=str, required=True, help="Path to telemetry JSON file")
    args = parser.parse_args()
    generate_all_heatmaps(Path(args.telemetry))
