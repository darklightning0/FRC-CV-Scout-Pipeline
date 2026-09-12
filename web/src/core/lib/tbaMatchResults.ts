/**
 * TBA match helpers for Team Stats / Match Strategy.
 */

import type { TBAMatchData } from '@/core/lib/tbaMatchData';

/** Count how many TBA matches a team appears in (completed or scheduled). */
export function countTbaMatchesForTeam(
  matches: Array<Pick<TBAMatchData, 'alliances'>>,
  teamNumber: number
): number {
  const key = `frc${teamNumber}`;
  let count = 0;
  for (const match of matches) {
    const red = match.alliances?.red?.team_keys ?? [];
    const blue = match.alliances?.blue?.team_keys ?? [];
    if (red.includes(key) || blue.includes(key)) count += 1;
  }
  return count;
}

/** Prefer completed matches (has score / winner / post_result) when counting "played". */
export function countTbaMatchesPlayedForTeam(
  matches: TBAMatchData[],
  teamNumber: number
): number {
  const key = `frc${teamNumber}`;
  let count = 0;
  for (const match of matches) {
    const red = match.alliances?.red?.team_keys ?? [];
    const blue = match.alliances?.blue?.team_keys ?? [];
    if (!red.includes(key) && !blue.includes(key)) continue;
    if (isTbaMatchComplete(match)) count += 1;
  }
  return count;
}

export function isTbaMatchComplete(match: TBAMatchData): boolean {
  if (match.winning_alliance === 'red' || match.winning_alliance === 'blue') return true;
  if (match.post_result_time && match.post_result_time > 0) return true;
  const red = match.alliances?.red?.score;
  const blue = match.alliances?.blue?.score;
  // TBA uses -1 for unplayed
  return typeof red === 'number' && typeof blue === 'number' && red >= 0 && blue >= 0;
}

export function findTbaMatchByNumber(
  matches: TBAMatchData[],
  matchNumber: number | string,
  preferredCompLevel = 'qm'
): TBAMatchData | null {
  const num = typeof matchNumber === 'string' ? Number.parseInt(matchNumber, 10) : matchNumber;
  if (!Number.isFinite(num) || num <= 0) return null;

  const exact = matches.find(
    (m) => m.match_number === num && (m.comp_level || '').toLowerCase() === preferredCompLevel
  );
  if (exact) return exact;

  return matches.find((m) => m.match_number === num) ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

export type TbaAllianceSideSummary = {
  score: number;
  autoPoints?: number;
  teleopPoints?: number;
  endgamePoints?: number;
  foulPoints?: number;
  foulCount?: number;
  techFoulCount?: number;
  rp?: number;
  hubAutoCount?: number;
  hubTeleopCount?: number;
  climbs: Array<{ station: number; teamNumber: number; level: string }>;
  dqTeamNumbers: number[];
  /** Best-effort TBA card strings if present in breakdown */
  cards: Array<{ teamNumber?: number; label: string }>;
};

export type TbaMatchResultsSummary = {
  matchKey: string;
  displayName: string;
  compLevel: string;
  matchNumber: number;
  complete: boolean;
  winner: 'red' | 'blue' | 'tie' | 'unknown';
  red: TbaAllianceSideSummary;
  blue: TbaAllianceSideSummary;
};

function parseClimbs(
  _alliance: 'red' | 'blue',
  teamKeys: string[],
  breakdown: Record<string, unknown> | null
): Array<{ station: number; teamNumber: number; level: string }> {
  if (!breakdown) return [];
  const out: Array<{ station: number; teamNumber: number; level: string }> = [];
  for (let i = 0; i < 3; i += 1) {
    const teamKey = teamKeys[i];
    if (!teamKey) continue;
    const teamNumber = Number.parseInt(teamKey.replace(/^frc/i, ''), 10);
    if (!Number.isFinite(teamNumber)) continue;
    const raw =
      str(breakdown[`endGameTowerRobot${i + 1}`]) ||
      str(breakdown[`endGameRobot${i + 1}`]) ||
      str(breakdown[`tba_endGameRobot${i + 1}`]) ||
      'None';
    if (!raw || raw === 'None' || raw === 'none') continue;
    out.push({ station: i + 1, teamNumber, level: raw });
  }
  return out;
}

function parseCards(
  teamKeys: string[],
  breakdown: Record<string, unknown> | null
): Array<{ teamNumber?: number; label: string }> {
  if (!breakdown) return [];
  const cards: Array<{ teamNumber?: number; label: string }> = [];

  // Common TBA patterns across years
  const allianceCard = str(breakdown.card) || str(breakdown.allianceCard);
  if (allianceCard && allianceCard !== 'none' && allianceCard !== 'None') {
    cards.push({ label: allianceCard });
  }

  for (let i = 0; i < 3; i += 1) {
    const teamKey = teamKeys[i];
    const teamNumber = teamKey
      ? Number.parseInt(teamKey.replace(/^frc/i, ''), 10)
      : undefined;
    const label =
      str(breakdown[`cardRobot${i + 1}`]) ||
      str(breakdown[`tba_cardRobot${i + 1}`]) ||
      str(breakdown[`yellowCardRobot${i + 1}`]) ||
      str(breakdown[`redCardRobot${i + 1}`]);
    if (label && label !== 'none' && label !== 'None') {
      cards.push({
        teamNumber: Number.isFinite(teamNumber) ? teamNumber : undefined,
        label,
      });
    }
  }

  // Boolean flags (alliance-wide or per-robot)
  if (breakdown.yellowCard === true) cards.push({ label: 'Yellow card' });
  if (breakdown.redCard === true) cards.push({ label: 'Red card' });
  for (let i = 0; i < 3; i += 1) {
    const teamKey = teamKeys[i];
    const teamNumber = teamKey
      ? Number.parseInt(teamKey.replace(/^frc/i, ''), 10)
      : undefined;
    const tn = Number.isFinite(teamNumber) ? teamNumber : undefined;
    if (breakdown[`yellowCardRobot${i + 1}`] === true) {
      cards.push({ teamNumber: tn, label: 'Yellow card' });
    }
    if (breakdown[`redCardRobot${i + 1}`] === true) {
      cards.push({ teamNumber: tn, label: 'Red card' });
    }
  }

  return cards;
}

function summarizeAlliance(
  alliance: 'red' | 'blue',
  match: TBAMatchData
): TbaAllianceSideSummary {
  const side = match.alliances[alliance];
  const breakdownRoot = asRecord(match.score_breakdown);
  const breakdown = asRecord(breakdownRoot?.[alliance]);

  const dqTeamNumbers = (side.dq_team_keys ?? [])
    .map((k) => Number.parseInt(k.replace(/^frc/i, ''), 10))
    .filter((n) => Number.isFinite(n));

  const hubScore = asRecord(breakdown?.hubScore);

  return {
    score: side.score ?? 0,
    autoPoints: num(breakdown?.autoPoints),
    teleopPoints: num(breakdown?.teleopPoints),
    endgamePoints:
      num(breakdown?.endGamePoints) ??
      num(breakdown?.endgamePoints) ??
      num(breakdown?.towerPoints),
    foulPoints: num(breakdown?.foulPoints),
    foulCount: num(breakdown?.foulCount),
    techFoulCount: num(breakdown?.techFoulCount),
    rp: num(breakdown?.rp) ?? num(breakdown?.totalRp),
    hubAutoCount: num(hubScore?.autoCount) ?? num(breakdown?.autoHubCount),
    hubTeleopCount: num(hubScore?.teleopCount) ?? num(breakdown?.teleopHubCount),
    climbs: parseClimbs(alliance, side.team_keys ?? [], breakdown),
    dqTeamNumbers,
    cards: parseCards(side.team_keys ?? [], breakdown),
  };
}

export function summarizeTbaMatchResults(match: TBAMatchData): TbaMatchResultsSummary {
  const redScore = match.alliances.red.score ?? 0;
  const blueScore = match.alliances.blue.score ?? 0;
  let winner: TbaMatchResultsSummary['winner'] = 'unknown';
  if (match.winning_alliance === 'red' || match.winning_alliance === 'blue') {
    winner = match.winning_alliance;
  } else if (isTbaMatchComplete(match)) {
    winner = redScore === blueScore ? 'tie' : redScore > blueScore ? 'red' : 'blue';
  }

  const level = (match.comp_level || 'qm').toUpperCase();
  const displayName =
    level === 'QM'
      ? `Qualification ${match.match_number}`
      : `${level} ${match.match_number}`;

  return {
    matchKey: match.key,
    displayName,
    compLevel: match.comp_level,
    matchNumber: match.match_number,
    complete: isTbaMatchComplete(match),
    winner,
    red: summarizeAlliance('red', match),
    blue: summarizeAlliance('blue', match),
  };
}
