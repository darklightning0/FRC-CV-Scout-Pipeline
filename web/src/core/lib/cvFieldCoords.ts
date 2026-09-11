/**
 * CV field coordinates ↔ canvas pixels.
 *
 * Telemetry stores normalized 0–1 with:
 *   x: blue wall → red wall
 *   y: field y_m / width (y=0 at the BOTTOM of the field in meters)
 *
 * Screen / PNG field images have y=0 at the TOP, so we flip Y when drawing.
 * Python heatmaps already flip (`1 - ny`); client overlays must match that.
 */

import type { CvFieldPoint } from '@/core/types/cv-telemetry';

export const BLUE_ALLIANCE_HUES = ['#1e3a8a', '#2563eb', '#22d3ee'] as const; // dark → mid → cyan
export const RED_ALLIANCE_HUES = ['#7f1d1d', '#dc2626', '#fb7185'] as const; // dark → mid → light

export function cvNormToCanvas(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: x * width,
    y: (1 - y) * height,
  };
}

/** Sort by match clock so start markers are not mid-path. */
export function sortCvPointsByTime(points: CvFieldPoint[]): CvFieldPoint[] {
  if (points.length < 2) return points;
  return [...points].sort((a, b) => (a.timeSec ?? 0) - (b.timeSec ?? 0));
}

/** Light moving-average smoother for display (does not mutate source). */
export function smoothCvPoints(points: CvFieldPoint[], window = 3): CvFieldPoint[] {
  const sorted = sortCvPointsByTime(points);
  if (sorted.length < 3 || window < 2) return sorted;
  const half = Math.floor(window / 2);
  const out: CvFieldPoint[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j += 1) {
      const p = sorted[Math.max(0, Math.min(sorted.length - 1, j))]!;
      sx += p.x;
      sy += p.y;
      n += 1;
    }
    const src = sorted[i]!;
    out.push({ x: sx / n, y: sy / n, timeSec: src.timeSec });
  }
  return out;
}

export function allianceColorForSlot(
  alliance: 'red' | 'blue' | 'unknown',
  slotWithinAlliance: number
): string {
  const hues = alliance === 'red' ? RED_ALLIANCE_HUES : BLUE_ALLIANCE_HUES;
  return hues[Math.max(0, Math.min(2, slotWithinAlliance))]!;
}
