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
  districtRank?: number | null;
  districtPercentile?: number | null;
  stateRank?: number | null;
  statePercentile?: number | null;
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

export type GlobalStatsSource = "offline" | "online" | "first";

export interface GlobalTeamProfile {
  teamNumber: number;
  name: string;
  fullName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  website?: string | null;
  rookieYear?: number | null;
  active?: boolean;
  lastActiveYear?: number | null;
  careerRecord?: GlobalTeamRecord | null;
  normEpa?: GlobalNormEpa | null;
  districtCode?: string | null;
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
  | "epaMax"
  | "winrate"
  | "worldRank"
  | "countryRank"
  | "district"
  | "rookieYear"
  | "awards";

export type GlobalStatsSortDirection = "asc" | "desc";

export interface GlobalStatsFilters {
  search: string;
  country: string;
  city: string;
  district?: string;
  year: string;
  activeOnly: boolean;
  offlineOnly: boolean;
  hasAwardsOnly?: boolean;
  sortField?: GlobalStatsSortField;
  sortDirection?: GlobalStatsSortDirection;
}

