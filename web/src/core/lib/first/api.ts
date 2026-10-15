/**
 * FIRST Inspires Events API (v3.0) Client
 * Documentation: https://frc-events.firstinspires.org/services/API
 */

import { proxyGetJson } from '../apiProxy';

export interface FirstTeam {
  teamNumber: number;
  nameFull: string;
  nameShort: string;
  city: string;
  stateProv: string;
  country: string;
  rookieYear: number;
  robotName?: string | null;
  districtCode?: string | null;
  schoolName?: string | null;
  website?: string | null;
}

export interface FirstTeamsResponse {
  teams: FirstTeam[];
  teamCountTotal: number;
  teamCountPage: number;
  pageCurrent: number;
  pageTotal: number;
}

export interface FirstEvent {
  code: string;
  divisionCode?: string | null;
  name: string;
  type: string;
  districtCode?: string | null;
  venue: string;
  city: string;
  stateprov: string;
  country: string;
  dateStart: string;
  dateEnd: string;
  website?: string | null;
}

export interface FirstEventsResponse {
  events: FirstEvent[];
  eventCount: number;
}

export interface FirstRankingItem {
  rank: number;
  teamNumber: number;
  sortOrder1: number;
  sortOrder2: number;
  sortOrder3: number;
  sortOrder4: number;
  sortOrder5: number;
  sortOrder6: number;
  wins: number;
  losses: number;
  ties: number;
  qualAverage: number;
  dq: number;
  matchesPlayed: number;
}

export interface FirstRankingsResponse {
  Rankings: FirstRankingItem[];
}

export interface FirstMatchTeam {
  teamNumber: number;
  station: string;
  dq: boolean;
}

export interface FirstMatch {
  description: string;
  level: string;
  startTime: string;
  matchNumber: number;
  field?: string;
  tournamentLevel: string;
  teams: FirstMatchTeam[];
  scoreRedFinal?: number | null;
  scoreBlueFinal?: number | null;
  scoreRedFoul?: number | null;
  scoreBlueFoul?: number | null;
  scoreRedAuto?: number | null;
  scoreBlueAuto?: number | null;
}

export interface FirstMatchesResponse {
  Matches: FirstMatch[];
}

export interface FirstAward {
  awardId: number;
  teamId?: number;
  teamNumber?: number;
  name: string;
  series: number;
  person?: string | null;
}

export interface FirstAwardsResponse {
  Awards: FirstAward[];
}

/**
 * Fetch official FIRST team roster for a given season, optionally filtered by page or team number.
 */
export async function fetchFirstSeasonTeams(
  season: number,
  page = 1,
  teamNumber?: number
): Promise<FirstTeamsResponse> {
  const query = new URLSearchParams({ page: String(page) });
  if (teamNumber) {
    query.set('teamNumber', String(teamNumber));
  }
  return proxyGetJson<FirstTeamsResponse>('first', `/${season}/teams?${query.toString()}`);
}

/**
 * Fetch official profile for a specific team in a season (includes official robot name and school).
 */
export async function fetchFirstTeam(season: number, teamNumber: number): Promise<FirstTeam | null> {
  try {
    const res = await fetchFirstSeasonTeams(season, 1, teamNumber);
    return res.teams?.find((t) => t.teamNumber === teamNumber) || null;
  } catch (err) {
    console.warn(`[FIRST API] Failed to fetch team ${teamNumber} for season ${season}:`, err);
    return null;
  }
}

/**
 * Fetch official FIRST events for a given season.
 */
export async function fetchFirstEvents(
  season: number,
  districtCode?: string
): Promise<FirstEventsResponse> {
  const query = new URLSearchParams();
  if (districtCode) {
    query.set('districtCode', districtCode);
  }
  const qs = query.toString();
  return proxyGetJson<FirstEventsResponse>('first', `/${season}/events${qs ? `?${qs}` : ''}`);
}

/**
 * Fetch official rankings for an event.
 */
export async function fetchFirstEventRankings(
  season: number,
  eventCode: string
): Promise<FirstRankingsResponse> {
  return proxyGetJson<FirstRankingsResponse>('first', `/${season}/rankings/${eventCode}`);
}

/**
 * Fetch official match schedule and results for an event.
 */
export async function fetchFirstEventMatches(
  season: number,
  eventCode: string,
  tournamentLevel?: 'qual' | 'playoff'
): Promise<FirstMatchesResponse> {
  const query = new URLSearchParams();
  if (tournamentLevel) {
    query.set('tournamentLevel', tournamentLevel);
  }
  const qs = query.toString();
  return proxyGetJson<FirstMatchesResponse>(
    'first',
    `/${season}/matches/${eventCode}${qs ? `?${qs}` : ''}`
  );
}

/**
 * Fetch awards given at an event or to a team in a season.
 */
export async function fetchFirstAwards(
  season: number,
  options: { eventCode?: string; teamNumber?: number } = {}
): Promise<FirstAwardsResponse> {
  const query = new URLSearchParams();
  if (options.eventCode) query.set('eventCode', options.eventCode);
  if (options.teamNumber) query.set('teamNumber', String(options.teamNumber));
  const qs = query.toString();
  return proxyGetJson<FirstAwardsResponse>('first', `/${season}/awards/${season}${qs ? `?${qs}` : ''}`);
}
