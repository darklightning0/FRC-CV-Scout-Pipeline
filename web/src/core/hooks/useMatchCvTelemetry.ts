/**
 * Load CV telemetry rows for selected Match Strategy teams / match key.
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/core/db/database';
import type { CvMatchTelemetryEntry } from '@/core/types/cv-telemetry';

export function matchKeyCandidates(eventKey: string, matchNumber: string): string[] {
  const n = matchNumber.trim();
  if (!eventKey || !n) return [];
  const num = n.replace(/^0+/, '') || n;
  return [
    `${eventKey}_qm${num}`,
    `${eventKey}_qf${num}`,
    `${eventKey}_sf${num}`,
    `${eventKey}_f1m${num}`,
    `${eventKey}_f2m${num}`,
    `${eventKey}_f3m${num}`,
  ];
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
      const byTeam = new Map<number, CvMatchTelemetryEntry>();
      const source = forMatch.length > 0 ? forMatch : forTeams;
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

  const resolvedMatchKey = entries[0]?.matchKey ?? matchKeyCandidates(eventKey, matchNumber)[0] ?? '';

  return { entries, teamSet, resolvedMatchKey };
}
