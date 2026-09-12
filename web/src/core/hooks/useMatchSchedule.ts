/**
 * Match Schedule — TBA schedule + scores + scout status for an event.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCachedTBAEventMatches, cacheTBAMatches } from '@/core/lib/tbaCache';
import { fetchTBAEventMatchesDetailed } from '@/core/lib/tbaMatchData';
import type { TBAMatchData } from '@/core/lib/tbaMatchData';
import {
  isTbaMatchComplete,
  summarizeTbaMatchResults,
  type TbaMatchResultsSummary,
} from '@/core/lib/tbaMatchResults';
import { getEntriesByEvent } from '@/core/db/scoutingDatabase';
import { setCurrentEvent } from '@/core/lib/tba/eventDataUtils';

export type TeamCardKind = 'yellow' | 'red' | 'dq';

export type ScheduleTeamSlot = {
  teamNumber: number;
  cards: TeamCardKind[];
};

export type MatchScoutInfo = {
  scouted: boolean;
  scoutNames: string[];
  scoutedTeamCount: number;
  expectedTeamCount: number;
};

export type MatchScheduleRow = {
  matchKey: string;
  displayName: string;
  compLevel: string;
  matchNumber: number;
  setNumber: number;
  scheduledTime: number | null;
  complete: boolean;
  winner: 'red' | 'blue' | 'tie' | 'unknown';
  redScore: number | null;
  blueScore: number | null;
  redTeams: ScheduleTeamSlot[];
  blueTeams: ScheduleTeamSlot[];
  summary: TbaMatchResultsSummary | null;
  scout: MatchScoutInfo;
};

function teamKeyToNumber(key: string): number {
  return Number.parseInt(key.replace(/^frc/i, ''), 10);
}

function matchSortKey(m: TBAMatchData): [number, number, number] {
  const levelOrder: Record<string, number> = {
    qm: 0,
    ef: 1,
    qf: 2,
    sf: 3,
    f: 4,
  };
  const lvl = levelOrder[(m.comp_level || '').toLowerCase()] ?? 9;
  return [lvl, m.set_number || 0, m.match_number || 0];
}

function cardsForTeam(
  summary: TbaMatchResultsSummary | null,
  alliance: 'red' | 'blue',
  teamNumber: number
): TeamCardKind[] {
  if (!summary) return [];
  const side = summary[alliance];
  const out: TeamCardKind[] = [];
  if (side.dqTeamNumbers.includes(teamNumber)) out.push('dq');
  for (const card of side.cards) {
    if (card.teamNumber !== undefined && card.teamNumber !== teamNumber) continue;
    // Skip alliance-wide cards without a team so we don't paint every robot
    if (card.teamNumber === undefined) continue;
    const label = card.label.toLowerCase();
    if (label.includes('red')) out.push('red');
    else if (label.includes('yellow')) out.push('yellow');
  }
  return [...new Set(out)];
}

function buildSlots(
  teamKeys: string[],
  summary: TbaMatchResultsSummary | null,
  alliance: 'red' | 'blue'
): ScheduleTeamSlot[] {
  return teamKeys
    .map(teamKeyToNumber)
    .filter((n) => Number.isFinite(n))
    .map((teamNumber) => ({
      teamNumber,
      cards: cardsForTeam(summary, alliance, teamNumber),
    }));
}

export function useMatchSchedule(eventKey: string) {
  const [matches, setMatches] = useState<TBAMatchData[]>([]);
  const [scoutByMatchNumber, setScoutByMatchNumber] = useState<
    Map<number, { names: Set<string>; teams: Set<number> }>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState<string>('all');

  const load = useCallback(async (refreshFromTba: boolean) => {
    const key = eventKey.trim().toLowerCase();
    if (!key) {
      setMatches([]);
      setScoutByMatchNumber(new Map());
      setError(null);
      return;
    }

    if (refreshFromTba) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      let tbaMatches = await getCachedTBAEventMatches(key, true);

      if (refreshFromTba || tbaMatches.length === 0) {
        try {
          const fresh = await fetchTBAEventMatchesDetailed(key);
          if (Array.isArray(fresh) && fresh.length > 0) {
            await cacheTBAMatches(fresh);
            tbaMatches = fresh;
          }
        } catch (fetchErr) {
          if (tbaMatches.length === 0) {
            throw fetchErr;
          }
          console.warn('[MatchSchedule] TBA refresh failed, using cache', fetchErr);
        }
      }

      tbaMatches = [...tbaMatches].sort((a, b) => {
        const ka = matchSortKey(a);
        const kb = matchSortKey(b);
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
      });

      setMatches(tbaMatches);

      const rawEntries = [
        ...(await getEntriesByEvent(key)),
        ...(await getEntriesByEvent(eventKey.trim())),
      ];
      // Dedupe by id if present
      const seen = new Set<string>();
      const entries = rawEntries.filter((e) => {
        const id = String((e as { id?: string }).id || `${e.matchKey}-${e.teamNumber}-${e.scoutName}`);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      const byMatch = new Map<number, { names: Set<string>; teams: Set<number> }>();
      for (const entry of entries) {
        const num = entry.matchNumber;
        if (!Number.isFinite(num)) continue;
        let bucket = byMatch.get(num);
        if (!bucket) {
          bucket = { names: new Set(), teams: new Set() };
          byMatch.set(num, bucket);
        }
        if (entry.scoutName?.trim()) bucket.names.add(entry.scoutName.trim());
        if (entry.teamNumber) bucket.teams.add(entry.teamNumber);
      }
      setScoutByMatchNumber(byMatch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
      setMatches([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [eventKey]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const rows: MatchScheduleRow[] = useMemo(() => {
    return matches.map((match) => {
      const complete = isTbaMatchComplete(match);
      const summary = complete ? summarizeTbaMatchResults(match) : null;
      const redKeys = match.alliances?.red?.team_keys ?? [];
      const blueKeys = match.alliances?.blue?.team_keys ?? [];
      const expected = redKeys.length + blueKeys.length;

      const scoutBucket = scoutByMatchNumber.get(match.match_number);
      // Prefer matching by short key for quals when multiple comp levels share numbers
      // For simplicity use match_number; playoff collisions rare in display filters
      const scoutNames = scoutBucket ? [...scoutBucket.names].sort() : [];
      const scoutedTeamCount = scoutBucket?.teams.size ?? 0;

      return {
        matchKey: match.key,
        displayName: summary?.displayName
          ?? (() => {
            const level = (match.comp_level || 'qm').toUpperCase();
            return level === 'QM'
              ? `Qualification ${match.match_number}`
              : `${level} ${match.set_number > 0 ? `${match.set_number}-` : ''}${match.match_number}`;
          })(),
        compLevel: match.comp_level || 'qm',
        matchNumber: match.match_number,
        setNumber: match.set_number || 0,
        scheduledTime: match.time || match.predicted_time || null,
        complete,
        winner: summary?.winner ?? 'unknown',
        redScore: complete ? (match.alliances?.red?.score ?? null) : null,
        blueScore: complete ? (match.alliances?.blue?.score ?? null) : null,
        redTeams: buildSlots(redKeys, summary, 'red'),
        blueTeams: buildSlots(blueKeys, summary, 'blue'),
        summary,
        scout: {
          scouted: scoutedTeamCount > 0,
          scoutNames,
          scoutedTeamCount,
          expectedTeamCount: expected || 6,
        },
      };
    });
  }, [matches, scoutByMatchNumber]);

  const availableTeams = useMemo(() => {
    const set = new Set<number>();
    for (const row of rows) {
      for (const t of row.redTeams) set.add(t.teamNumber);
      for (const t of row.blueTeams) set.add(t.teamNumber);
    }
    return [...set].sort((a, b) => a - b).map(String);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!filterTeam || filterTeam === 'all') return rows;
    const n = Number.parseInt(filterTeam, 10);
    if (!Number.isFinite(n)) return rows;
    return rows.filter(
      (r) =>
        r.redTeams.some((t) => t.teamNumber === n) ||
        r.blueTeams.some((t) => t.teamNumber === n)
    );
  }, [rows, filterTeam]);

  const persistEventKey = useCallback((next: string) => {
    const normalized = next.trim();
    localStorage.setItem('eventKey', normalized);
    if (normalized) {
      try {
        setCurrentEvent(normalized);
      } catch {
        localStorage.setItem('current_event', normalized);
      }
    }
  }, []);

  return {
    rows,
    filteredRows,
    availableTeams,
    filterTeam,
    setFilterTeam,
    isLoading,
    isRefreshing,
    error,
    refresh: () => load(true),
    persistEventKey,
  };
}
