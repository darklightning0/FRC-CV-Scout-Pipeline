/**
 * Aggregate CV telemetry into pick-list ranking metrics (zone % + crossings).
 */

import { db } from '@/core/db/database';
import type { CvMatchTelemetryEntry } from '@/core/types/cv-telemetry';

export type CvTeamPickMetrics = {
  teamNumber: number;
  matchCount: number;
  avgAllianceZonePct: number;
  avgNeutralZonePct: number;
  avgOpponentZonePct: number;
  avgTrenchCrossings: number;
  avgBumpCrossings: number;
  avgTotalCrossings: number;
  /**
   * Higher = more aggressive field presence for picking:
   * opponent zone share + weighted crossings.
   */
  cvRankScore: number;
};

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

export function aggregateCvPickMetrics(
  entries: CvMatchTelemetryEntry[]
): Map<number, CvTeamPickMetrics> {
  const byTeam = new Map<number, CvMatchTelemetryEntry[]>();
  for (const entry of entries) {
    const list = byTeam.get(entry.teamNumber) ?? [];
    list.push(entry);
    byTeam.set(entry.teamNumber, list);
  }

  const result = new Map<number, CvTeamPickMetrics>();
  for (const [teamNumber, rows] of byTeam) {
    const alliance = rows.map((r) => r.zoneOccupancyPct.alliance);
    const neutral = rows.map((r) => r.zoneOccupancyPct.neutral);
    const opponent = rows.map((r) => r.zoneOccupancyPct.opponent);
    const trench = rows.map((r) => r.trenchCrossings);
    const bump = rows.map((r) => r.bumpCrossings);
    const avgOpponentZonePct = mean(opponent);
    const avgTrenchCrossings = mean(trench);
    const avgBumpCrossings = mean(bump);
    const avgTotalCrossings = avgTrenchCrossings + avgBumpCrossings;

    result.set(teamNumber, {
      teamNumber,
      matchCount: rows.length,
      avgAllianceZonePct: mean(alliance),
      avgNeutralZonePct: mean(neutral),
      avgOpponentZonePct,
      avgTrenchCrossings,
      avgBumpCrossings,
      avgTotalCrossings,
      // Opponent time dominates; crossings add a smaller bonus (typical 0–6 range)
      cvRankScore: avgOpponentZonePct + avgTotalCrossings * 4,
    });
  }
  return result;
}

export async function loadCvPickMetricsForEvent(
  eventKey: string
): Promise<Map<number, CvTeamPickMetrics>> {
  const normalized = eventKey.trim();
  if (!normalized) return new Map();
  const entries = await db.cvMatchTelemetry.where('eventKey').equals(normalized).toArray();
  return aggregateCvPickMetrics(entries);
}

export const CV_PICK_SORT_OPTIONS = [
  { value: 'cvRankScore', label: 'CV Rank (opp zone + crossings)' },
  { value: 'cvOpponentZonePct', label: 'CV Opponent Zone %' },
  { value: 'cvAllianceZonePct', label: 'CV Alliance Zone %' },
  { value: 'cvTotalCrossings', label: 'CV Crossings (trench+bump)' },
] as const;

export function getCvSortValue(
  metrics: CvTeamPickMetrics | undefined,
  sortOption: string
): number | null {
  if (!metrics) return null;
  switch (sortOption) {
    case 'cvRankScore':
      return metrics.cvRankScore;
    case 'cvOpponentZonePct':
      return metrics.avgOpponentZonePct;
    case 'cvAllianceZonePct':
      return metrics.avgAllianceZonePct;
    case 'cvTotalCrossings':
      return metrics.avgTotalCrossings;
    default:
      return null;
  }
}

export function isCvSortOption(sortOption: string): boolean {
  return CV_PICK_SORT_OPTIONS.some((opt) => opt.value === sortOption);
}
