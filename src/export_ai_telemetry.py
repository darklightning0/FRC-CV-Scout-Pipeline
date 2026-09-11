#!/usr/bin/env python3
"""
export_ai_telemetry.py — Bridge CV telemetry → Maneuver AI scout bundle
"""

from __future__ import annotations

import argparse
import json
import math
import os
from datetime import datetime, timezone
from typing import Optional


FIELD_LENGTH_DEFAULT = 16.54
FIELD_WIDTH_DEFAULT = 8.21
# Absolute field bands (blue wall at X=0, red wall at X=length)
BLUE_ALLIANCE_X_MAX = 5.1
RED_ALLIANCE_X_MIN = 11.4


def _infer_alliance(records: list[dict], red_teams: set[str], blue_teams: set[str], team_id: str) -> str:
    if team_id in red_teams:
        return "red"
    if team_id in blue_teams:
        return "blue"
    # Fallback: median X in first 5s — blue starts left, red starts right
    early = [r for r in records if r.get("time_sec", 0) <= 5.0 and r.get("x_m", 0) > 0]
    if not early:
        early = [r for r in records if r.get("x_m", 0) > 0][:30]
    if not early:
        return "unknown"
    xs = sorted(r["x_m"] for r in early)
    median_x = xs[len(xs) // 2]
    return "blue" if median_x < (FIELD_LENGTH_DEFAULT / 2) else "red"


def _zone_for_point(x: float, alliance: str) -> str:
    """Alliance-relative zone using absolute X bands."""
    if BLUE_ALLIANCE_X_MAX <= x <= RED_ALLIANCE_X_MIN:
        return "neutral"
    on_blue_side = x < BLUE_ALLIANCE_X_MAX
    on_red_side = x > RED_ALLIANCE_X_MIN
    if alliance == "blue":
        if on_blue_side:
            return "alliance"
        if on_red_side:
            return "opponent"
    elif alliance == "red":
        if on_red_side:
            return "alliance"
        if on_blue_side:
            return "opponent"
    else:
        # Unknown alliance: report absolute sides as alliance/opponent by midpoint
        mid = FIELD_LENGTH_DEFAULT / 2
        return "alliance" if x < mid else "opponent"
    return "neutral"


def process_ai_telemetry(
    telemetry_file: str,
    output_file: Optional[str] = None,
    red_teams: Optional[list[str]] = None,
    blue_teams: Optional[list[str]] = None,
):
    if not os.path.exists(telemetry_file):
        print(f"Error: Telemetry file {telemetry_file} does not exist.")
        return None

    with open(telemetry_file, "r") as f:
        data = json.load(f)

    match_key = data.get("match_key", "unknown_match")
    field_length = data.get("field_dimensions_m", {}).get("length", FIELD_LENGTH_DEFAULT)
    field_width = data.get("field_dimensions_m", {}).get("width", FIELD_WIDTH_DEFAULT)

    red_set = set(str(t) for t in (red_teams or data.get("red_teams") or []))
    blue_set = set(str(t) for t in (blue_teams or data.get("blue_teams") or []))

    teams_data = data.get("teams", {})
    ai_bundle = {
        "schema_version": 1,
        "match_key": match_key,
        "event_key": match_key.split("_")[0] if "_" in match_key else match_key,
        "processed_at": data.get("processed_at") or datetime.now(timezone.utc).isoformat(),
        "field_dimensions_m": {"length": field_length, "width": field_width},
        "red_teams": sorted(red_set) if red_set else [],
        "blue_teams": sorted(blue_set) if blue_set else [],
        "teams_telemetry": {},
    }

    print(f"Processing AI Telemetry for Match {match_key} across {len(teams_data)} teams...")

    for team_id, records in teams_data.items():
        if not records:
            continue

        records = sorted(records, key=lambda r: r.get("frame", 0))
        # Drop ID-swap teleports before distance / path export (fixes scribble trails)
        try:
            from trajectory_clean import clean_team_records
            fps = float(data.get("fps") or data.get("video_fps") or 60.0)
            before = len(records)
            records = clean_team_records(records, fps=fps)
            if before and len(records) < before * 0.5:
                print(
                    f"  • Team {team_id}: teleport filter kept {len(records)}/{before} points "
                    f"(likely ID mix)"
                )
        except Exception as exc:
            print(f"  • Team {team_id}: clean skipped ({exc})")

        if not records:
            continue

        alliance = _infer_alliance(records, red_set, blue_set, str(team_id))

        speeds = [r.get("speed_mps", 0) for r in records if r.get("speed_mps", 0) > 0]
        max_speed = max(speeds) if speeds else 0.0
        avg_speed = sum(speeds) / len(speeds) if speeds else 0.0

        total_dist = 0.0
        for i in range(1, len(records)):
            x1, y1 = records[i - 1]["x_m"], records[i - 1]["y_m"]
            x2, y2 = records[i]["x_m"], records[i]["y_m"]
            if x1 >= 0 and y1 >= 0 and x2 >= 0 and y2 >= 0:
                d = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
                # Ignore residual teleports in distance (robot can't jump >1.5m/sample)
                if d < 1.5:
                    total_dist += d

        alliance_cnt = neutral_cnt = opponent_cnt = total_valid = 0
        auto_path = []
        teleop_path = []
        endgame_path = []
        match_path = []
        trench_crossings = bump_crossings = 0
        prev_x = None

        # Phase splits (seconds from match start) — FRC-style windows
        AUTO_END = 18.0
        TELEOP_END = 130.0  # ~2:10; remainder treated as endgame
        SAMPLE_DT = 0.5

        for r in records:
            x = r.get("x_m", 0)
            y = r.get("y_m", 0)
            time_sec = float(r.get("time_sec", 0) or 0)
            if x < 0 or y < 0:
                continue

            total_valid += 1
            zone = _zone_for_point(x, alliance)
            if zone == "alliance":
                alliance_cnt += 1
            elif zone == "opponent":
                opponent_cnt += 1
            else:
                neutral_cnt += 1

            point = {
                "x_m": round(x, 2),
                "y_m": round(y, 2),
                "x": round(x / field_length, 4),
                "y": round(y / field_width, 4),
                "timeSec": round(time_sec, 2),
            }

            def _append_sampled(bucket: list, pt: dict) -> None:
                if len(bucket) == 0 or pt["timeSec"] - bucket[-1]["timeSec"] >= SAMPLE_DT:
                    bucket.append(pt)

            _append_sampled(match_path, point)
            if time_sec <= AUTO_END:
                _append_sampled(auto_path, point)
            elif time_sec <= TELEOP_END:
                _append_sampled(teleop_path, point)
            else:
                _append_sampled(endgame_path, point)

            if prev_x is not None:
                crossed = (prev_x < BLUE_ALLIANCE_X_MAX <= x) or (x < BLUE_ALLIANCE_X_MAX <= prev_x) or (
                    prev_x < RED_ALLIANCE_X_MIN <= x
                ) or (x < RED_ALLIANCE_X_MIN <= prev_x)
                if crossed:
                    if y < 2.0 or y > 6.2:
                        trench_crossings += 1
                    else:
                        bump_crossings += 1
            prev_x = x

        zone_occupancy = {
            "alliance": round((alliance_cnt / total_valid) * 100, 1) if total_valid else 0,
            "neutral": round((neutral_cnt / total_valid) * 100, 1) if total_valid else 0,
            "opponent": round((opponent_cnt / total_valid) * 100, 1) if total_valid else 0,
        }

        ai_bundle["teams_telemetry"][str(team_id)] = {
            "team_id": str(team_id),
            "alliance": alliance,
            "max_speed_mps": round(max_speed, 2),
            "avg_speed_mps": round(avg_speed, 2),
            "total_distance_m": round(total_dist, 1),
            "zone_occupancy_pct": zone_occupancy,
            "trench_crossings": trench_crossings,
            "bump_crossings": bump_crossings,
            "auto_path_waypoints": auto_path,
            "teleop_path_waypoints": teleop_path,
            "endgame_path_waypoints": endgame_path,
            "match_path_waypoints": match_path,
            "sample_count": total_valid,
        }

        print(
            f"  • Team {team_id} ({alliance}): Peak {max_speed:.1f} m/s | "
            f"Dist: {total_dist:.1f} m | Auto pts: {len(auto_path)}"
        )

    if not output_file:
        output_file = f"outputs/ai_scout_bundle_{match_key}.json"

    os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
    with open(output_file, "w") as f:
        json.dump(ai_bundle, f, indent=2)

    print(f"✅ Exported AI scout bundle → {output_file}")
    return output_file


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert YOLO telemetry to Maneuver AI scout bundle")
    parser.add_argument("--telemetry", type=str, required=True, help="Path to raw telemetry JSON")
    parser.add_argument("--output", type=str, default=None, help="Output bundle path")
    parser.add_argument("--red", nargs="*", default=None, help="Red alliance team numbers")
    parser.add_argument("--blue", nargs="*", default=None, help="Blue alliance team numbers")
    args = parser.parse_args()
    process_ai_telemetry(args.telemetry, args.output, args.red, args.blue)
