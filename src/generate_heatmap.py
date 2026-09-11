"""
generate_heatmap.py — FRC 2026 2D Field Telemetry & Heatmap Generator
======================================================================
Reads an exported match telemetry JSON file (e.g. outputs/telemetry_2026tuis2_qm48.json)
and generates:
  1. 2D Robot Trajectory Plots (field movement lines per team)
  2. 2D Gaussian KDE Heatmaps (high-density scoring & defense zones per team)
  3. Combined Alliance Field Summary Image
"""

import json
from pathlib import Path
import argparse
import numpy as np
import cv2
import matplotlib.pyplot as plt
from scipy.stats import gaussian_kde

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "heatmaps"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

FIELD_IMAGE_PATH = PROJECT_ROOT / "src" / "2026_Field_Crop_No-Fuel_White.png"

# Standard FRC Field Dimensions (Meters)
FIELD_LENGTH_M = 16.54
FIELD_WIDTH_M = 8.21

# Team alliance color schemes
TEAM_COLORS = {
    "red_1": "#ff3333",
    "red_2": "#ff6666",
    "red_3": "#cc0000",
    "blue_1": "#3366ff",
    "blue_2": "#6699ff",
    "blue_3": "#0033cc"
}


def load_telemetry(telemetry_path: Path) -> dict:
    with open(telemetry_path, "r") as f:
        return json.load(f)


def draw_field_diagram(ax, field_length=FIELD_LENGTH_M, field_width=FIELD_WIDTH_M):
    """Draws 2026 field blueprint image layout as background."""
    if FIELD_IMAGE_PATH.exists():
        img = cv2.imread(str(FIELD_IMAGE_PATH))
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        ax.imshow(img_rgb, extent=[0, field_length, 0, field_width], aspect="auto")
    else:
        ax.set_facecolor("#1e1e24")
        ax.plot([0, field_length, field_length, 0, 0], [0, 0, field_width, field_width, 0],
                color="#ffffff", linewidth=2.5)
        ax.plot([field_length / 2.0, field_length / 2.0], [0, field_width],
                color="#ffffff", linestyle="--", linewidth=2.0)

    ax.set_xlim(-0.2, field_length + 0.2)
    ax.set_ylim(-0.2, field_width + 0.2)
    ax.set_aspect("equal")
    ax.set_xlabel("Field Length (Meters)", color="#111111", fontsize=10, fontweight="bold")
    ax.set_ylabel("Field Width (Meters)", color="#111111", fontsize=10, fontweight="bold")
    ax.tick_params(colors="#111111")


def generate_team_heatmap(telemetry: dict, team_id: str, output_path: Path):
    """Generates a 2D Gaussian KDE Heatmap for a specific team on the 2026 field background."""
    history = telemetry.get("teams", {}).get(team_id, [])
    if not history:
        print(f"[HEATMAP] No telemetry data found for team '{team_id}'.")
        return

    # Extract valid (X, Y) points
    x_coords = [p["x_m"] for p in history if p["x_m"] > 0 and p["y_m"] > 0]
    y_coords = [p["y_m"] for p in history if p["x_m"] > 0 and p["y_m"] > 0]

    if len(x_coords) < 10:
        print(f"[HEATMAP] Not enough points ({len(x_coords)}) to generate KDE heatmap for team '{team_id}'.")
        return

    fig, ax = plt.subplots(figsize=(12, 6), dpi=150)
    draw_field_diagram(ax)

    # Calculate 2D KDE
    x = np.array(x_coords)
    y = np.array(y_coords)
    xy = np.vstack([x, y])
    kde = gaussian_kde(xy)

    # Grid for density mapping
    grid_x, grid_y = np.mgrid[0:FIELD_LENGTH_M:200j, 0:FIELD_WIDTH_M:100j]
    grid_coords = np.vstack([grid_x.ravel(), grid_y.ravel()])
    z = kde(grid_coords).reshape(grid_x.shape)

    # Contour heatmap plot
    contour = ax.contourf(grid_x, grid_y, z, levels=15, cmap="magma", alpha=0.65)
    ax.plot(x, y, color="#000000", alpha=0.5, linewidth=1.0, label="Robot Trajectory")

    # Metrics Telemetry Box
    total_dist = sum(
        np.sqrt((history[i]["x_m"] - history[i-1]["x_m"])**2 + (history[i]["y_m"] - history[i-1]["y_m"])**2)
        for i in range(1, len(history))
    )
    avg_speed = np.mean([p.get("speed_mps", 0) for p in history])

    info_str = f"Team: {team_id} | Total Distance: {total_dist:.1f} m | Avg Speed: {avg_speed:.2f} m/s"
    ax.set_title(f"FRC 2026 2D Position Heatmap — Team {team_id}\n{info_str}", color="#111111", fontsize=12, fontweight="bold", pad=12)

    plt.tight_layout()
    plt.savefig(output_path, facecolor="#ffffff", edgecolor="none")
    plt.close()
    print(f"[HEATMAP] Saved heatmap to: {output_path}")


def generate_all_heatmaps(telemetry_path: Path):
    telemetry = load_telemetry(telemetry_path)
    match_key = telemetry.get("match_key", "match")

    teams = telemetry.get("teams", {})
    for team_id in teams.keys():
        out_file = OUTPUT_DIR / f"{match_key}_team_{team_id}_heatmap.png"
        generate_team_heatmap(telemetry, team_id, out_file)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate 2D Field Heatmaps from Match Telemetry JSON")
    parser.add_argument("--telemetry", type=str, required=True, help="Path to telemetry JSON file")
    args = parser.parse_args()

    generate_all_heatmaps(Path(args.telemetry))
