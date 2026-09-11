/**
 * Load CV telemetry rows for selected Match Strategy teams / match key.
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/core/db/database';
import type { CvMatchTelemetryEntry } from '@/core/types/cv-telemetry';

/** Preference when match UI only has a number (no qm/qf/f prefix). */
const MATCH_LEVEL_PRIORITY = ['qm', 'qf', 'sf', 'f1m', 'f2m', 'f3m'] as const;

export function matchKeyCandidates(eventKey: string, matchNumber: string): string[] {
  const raw = matchNumber.trim().toLowerCase();
  if (!eventKey || !raw) return [];

  // Accept full keys or typed prefixes: "qm1", "f1m1", "2026tuis2_qm1"
  if (raw.includes('_')) return [raw.startsWith(eventKey) ? raw : `${eventKey}_${raw}`];
  const typed = raw.match(/^(qm|qf|sf|f1m|f2m|f3m)(\d+)$/);
  if (typed) return [`${eventKey}_${typed[1]}${typed[2]}`];

  const num = raw.replace(/^0+/, '') || raw;
  return MATCH_LEVEL_PRIORITY.map((lvl) => `${eventKey}_${lvl}${num}`);
}

function matchKeyRank(matchKey: string): number {
  const lower = matchKey.toLowerCase();
  for (let i = 0; i < MATCH_LEVEL_PRIORITY.length; i++) {
    if (lower.includes(`_${MATCH_LEVEL_PRIORITY[i]}`)) return i;
  }
  return 99;
}

export function useMatchCvTelemetry(
  eventKey: string,
  matchNumber: string,
  selectedTeams: (number | null)[]
) {
  const [entries, setEntries] = useState<CvMatchTelemetryEntry[]>([]);

  const teamSet = useMemo(
    () => new Set(selectedTeams.filter((t): t is number => typeof t === 'number' && t > 0)),
    [selectedTeams]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventKey || teamSet.size === 0) {
        setEntries([]);
        return;
      }
      const all = await db.cvMatchTelemetry.where('eventKey').equals(eventKey).toArray();
      const candidates = matchKeyCandidates(eventKey, matchNumber);
      const forTeams = all.filter((e) => teamSet.has(e.teamNumber));
      const forMatch =
        candidates.length > 0
          ? forTeams.filter((e) => candidates.includes(e.matchKey))
          : forTeams;

      // Prefer one concrete match key (qm before finals) so "1" does not mix qm1 + f1m1.
      let source = forMatch;
      if (forMatch.length > 0) {
        const bestKey = [...forMatch]
          .sort((a, b) => {
            const rk = matchKeyRank(a.matchKey) - matchKeyRank(b.matchKey);
            if (rk !== 0) return rk;
            return (b.importedAt ?? 0) - (a.importedAt ?? 0);
          })[0]!.matchKey;
        source = forMatch.filter((e) => e.matchKey === bestKey);
      } else {
        // No silent cross-match fallback — empty is clearer than wrong finals data.
        source = [];
      }

      const byTeam = new Map<number, CvMatchTelemetryEntry>();
      for (const e of source) {
        const prev = byTeam.get(e.teamNumber);
        if (!prev || (e.importedAt ?? 0) > (prev.importedAt ?? 0)) {
          byTeam.set(e.teamNumber, e);
        }
      }
      if (!cancelled) setEntries([...byTeam.values()]);
    };
    void load();
    const onImported = () => void load();
    window.addEventListener('cv-telemetry-imported', onImported);
    return () => {
      cancelled = true;
      window.removeEventListener('cv-telemetry-imported', onImported);
    };
  }, [eventKey, matchNumber, teamSet]);

  const resolvedMatchKey =
    entries[0]?.matchKey ?? matchKeyCandidates(eventKey, matchNumber)[0] ?? '';

  return { entries, teamSet, resolvedMatchKey };
}
