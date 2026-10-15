export interface GlobalTeamRecord {
  wins: number;
  losses: number;
  ties: number;
  count: number;
  winrate: number;
}

export interface GlobalNormEpa {
  current?: number | null;
  recent?: number | null;
  mean?: number | null;
  max?: number | null;
}

export interface GlobalEpaRanks {
  worldRank?: number | null;
  worldPercentile?: number | null;
  countryRank?: number | null;
  countryPercentile?: number | null;
}

export interface GlobalTeamYear {
  year: number;
  name?: string | null;
  epaTotal?: number | null;
  epaNorm?: number | null;
  epaUnitless?: number | null;
  epaAuto?: number | null;
  epaTeleop?: number | null;
  epaEndgame?: number | null;
  epaMax?: number | null;
  breakdown: Record<string, number>;
  record: GlobalTeamRecord | null;
  ranks: GlobalEpaRanks;
}

export interface GlobalTeamAward {
  year: number;
  name: string;
  eventKey?: string;
}

export type GlobalStatsSource = "offline" | "online";

export interface GlobalTeamProfile {
  teamNumber: number;
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  rookieYear?: number | null;
  active?: boolean;
  lastActiveYear?: number | null;
  careerRecord?: GlobalTeamRecord | null;
  normEpa?: GlobalNormEpa | null;
  robotName?: string | null;
  schoolName?: string | null;
  years: GlobalTeamYear[];
  awards?: GlobalTeamAward[];
  source: GlobalStatsSource;
  updatedAt: number;
}

export interface GlobalStatsBundle {
  generatedAt: number;
  region: string;
  teamCount: number;
  yearRowCount: number;
  cities: string[];
  teams: GlobalTeamProfile[];
}

export type TurkeyStatsBundle = GlobalStatsBundle;

export type GlobalStatsSortField =
  | "teamNumber"
  | "name"
  | "epa"
  | "auto"
  | "teleop"
  | "endgame"
  | "winrate"
  | "worldRank"
  | "countryRank"
  | "awards";

export type GlobalStatsSortDirection = "asc" | "desc";

export interface GlobalStatsFilters {
  search: string;
  country: string;
  city: string;
  year: string;
  activeOnly: boolean;
  offlineOnly: boolean;
  hasAwardsOnly?: boolean;
  sortField?: GlobalStatsSortField;
  sortDirection?: GlobalStatsSortDirection;
}

