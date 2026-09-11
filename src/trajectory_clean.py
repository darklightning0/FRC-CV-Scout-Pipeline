"""
trajectory_clean.py — Reject ID-swap teleports / impossible speeds before
smoothing, export, and heatmap drawing.

FRC robots ~≤ 5.5 m/s; anything implying faster motion is almost always a
track-ID mix or homography flicker (the "child scribble" heatmaps).
"""

from __future__ import annotations

import math
from typing import Iterable


MAX_SPEED_MPS = 7.0
# Absolute floor so single-frame noise under ~20cm is kept
MIN_ACCEPT_M = 0.25


def _frame_of(r: dict) -> int:
    return int(r.get("frame", 0) or 0)


def _xy(r: dict) -> tuple[float, float] | None:
    try:
        x = float(r.get("x_m", 0) or 0)
        y = float(r.get("y_m", 0) or 0)
    except (TypeError, ValueError):
        return None
    if x < 0 or y < 0:
        return None
    return x, y


def reject_teleport_records(
    records: list[dict],
    fps: float,
    max_speed_mps: float = MAX_SPEED_MPS,
) -> list[dict]:
    """
    Keep a temporally coherent trail. Drop points that would require
    super-human speed from the last accepted point (ID swaps / flicker).
    """
    if not records:
        return []
    ordered = sorted(records, key=_frame_of)
    fps = max(float(fps or 30.0), 1.0)

    kept: list[dict] = []
    for r in ordered:
        xy = _xy(r)
        if xy is None:
            continue
        if not kept:
            kept.append(r)
            continue
        prev = kept[-1]
        pxy = _xy(prev)
        if pxy is None:
            kept.append(r)
            continue
        dt = (_frame_of(r) - _frame_of(prev)) / fps
        if dt <= 0:
            continue
        dist = math.hypot(xy[0] - pxy[0], xy[1] - pxy[1])
        max_dist = max(MIN_ACCEPT_M, max_speed_mps * dt * 1.35)
        if dist > max_dist:
            # Teleport — skip; stay anchored so we can re-acquire nearby later
            continue
        kept.append(r)
    return kept


def break_polyline_on_jumps(
    xs: Iterable[float],
    ys: Iterable[float],
    max_jump_m: float = 1.25,
) -> list[list[tuple[float, float]]]:
    """Split a path into continuous segments for drawing (no teleport lines)."""
    segments: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    prev: tuple[float, float] | None = None
    for x, y in zip(xs, ys):
        pt = (float(x), float(y))
        if prev is not None:
            if math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > max_jump_m:
                if len(current) >= 2:
                    segments.append(current)
                current = [pt]
                prev = pt
                continue
        current.append(pt)
        prev = pt
    if len(current) >= 2:
        segments.append(current)
    return segments


def moving_average_xy(
    records: list[dict],
    window: int = 9,
) -> list[dict]:
    """Light spatial MA after teleport rejection (preserves frame/time fields)."""
    if len(records) < 3 or window < 3:
        return records
    half = window // 2
    out: list[dict] = []
    for i, r in enumerate(records):
        x_sum = 0.0
        y_sum = 0.0
        n = 0
        for j in range(max(0, i - half), min(len(records), i + half + 1)):
            xy = _xy(records[j])
            if xy is None:
                continue
            x_sum += xy[0]
            y_sum += xy[1]
            n += 1
        if n == 0:
            continue
        nr = dict(r)
        nr["x_m"] = round(x_sum / n, 3)
        nr["y_m"] = round(y_sum / n, 3)
        out.append(nr)
    return out


def clean_team_records(records: list[dict], fps: float = 60.0) -> list[dict]:
    """Full clean pipeline for one team's raw/corrected history."""
    return moving_average_xy(reject_teleport_records(records, fps), window=9)
