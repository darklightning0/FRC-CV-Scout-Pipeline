import { proxyGetJson } from "@/core/lib/apiProxy";
import type {
  GlobalEpaRanks,
  GlobalNormEpa,
  GlobalStatsBundle,
  GlobalTeamAward,
  GlobalTeamProfile,
  GlobalTeamRecord,
  GlobalTeamYear,
  TurkeyStatsBundle,
} from "./types";

interface StatboticsRecord {
  wins?: number;
  losses?: number;
  ties?: number;
  count?: number;
  winrate?: number;
}

interface StatboticsTeamResponse {
  team?: number;
  name?: string;
  country?: string;
  state?: string;
  rookie_year?: number;
  active?: boolean;
  last_active_year?: number;
  record?: StatboticsRecord;
  norm_epa?: {
    current?: number;
    recent?: number;
    mean?: number;
    max?: number;
  };
}

interface StatboticsTeamYearResponse {
  team?: number;
  year?: number;
  name?: string;
  country?: string;
  state?: string;
  rookie_year?: number;
  epa?: {
    total_points?: number;
    unitless?: number;
    norm?: number;
    breakdown?: Record<string, unknown>;
    stats?: { max?: number };
    ranks?: {
      total?: { rank?: number; percentile?: number };
      country?: { rank?: number; percentile?: number };
    };
  };
  record?: StatboticsRecord;
}

interface TBATeamSimple {
  team_number?: number;
  nickname?: string;
  city?: string;
  state_prov?: string;
  country?: string;
  rookie_year?: number;
}

interface TBAAward {
  year?: number;
  name?: string;
  event_key?: string;
}

const asNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const compactRecord = (raw?: StatboticsRecord | null): GlobalTeamRecord | null => {
  if (!raw) return null;
  const wins = asNumber(raw.wins) ?? 0;
  const losses = asNumber(raw.losses) ?? 0;
  const ties = asNumber(raw.ties) ?? 0;
  const count = asNumber(raw.count) ?? wins + losses + ties;
  const winrate = asNumber(raw.winrate) ?? (count ? (wins + 0.5 * ties) / count : 0);
  return { wins, losses, ties, count, winrate };
};

const flattenNumbers = (raw: Record<string, unknown> | undefined, prefix = ""): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenNumbers(value as Record<string, unknown>, path));
    } else {
      const parsed = asNumber(value);
      if (parsed != null) out[path] = parsed;
    }
  }
  return out;
};

const compactYear = (raw: StatboticsTeamYearResponse): GlobalTeamYear | null => {
  const year = asNumber(raw.year);
  if (!year) return null;
  const breakdownSrc = raw.epa?.breakdown;
  const ranks: GlobalEpaRanks = {
    worldRank: asNumber(raw.epa?.ranks?.total?.rank),
    worldPercentile: asNumber(raw.epa?.ranks?.total?.percentile),
    countryRank: asNumber(raw.epa?.ranks?.country?.rank),
    countryPercentile: asNumber(raw.epa?.ranks?.country?.percentile),
  };
  return {
    year,
    name: raw.name,
    epaTotal: asNumber(raw.epa?.total_points),
    epaNorm: asNumber(raw.epa?.norm),
    epaUnitless: asNumber(raw.epa?.unitless),
    epaAuto: asNumber(breakdownSrc?.auto_points),
    epaTeleop: asNumber(breakdownSrc?.teleop_points),
    epaEndgame: asNumber(breakdownSrc?.endgame_points),
    epaMax: asNumber(raw.epa?.stats?.max),
    breakdown: flattenNumbers(breakdownSrc),
    record: compactRecord(raw.record),
    ranks,
  };
};

const compactNormEpa = (raw?: StatboticsTeamResponse["norm_epa"]): GlobalNormEpa | null => {
  if (!raw) return null;
  return {
    current: asNumber(raw.current),
    recent: asNumber(raw.recent),
    mean: asNumber(raw.mean),
    max: asNumber(raw.max),
  };
};

const GLOBAL_BUNDLE_URL = "/data/global-frc-stats.json";
const TURKEY_BUNDLE_URL = "/data/turkey-frc-stats.json";

export async function loadGlobalStatsBundle(): Promise<GlobalStatsBundle | null> {
  try {
    const globalRes = await fetch(GLOBAL_BUNDLE_URL, { cache: "force-cache" });
    if (globalRes.ok) {
      return (await globalRes.json()) as GlobalStatsBundle;
    }
  } catch {
    // Fallback below
  }

  try {
    const turkeyRes = await fetch(TURKEY_BUNDLE_URL, { cache: "force-cache" });
    if (turkeyRes.ok) {
      return (await turkeyRes.json()) as TurkeyStatsBundle;
    }
  } catch (error) {
    console.warn("[GlobalStats] Failed to load offline stats bundle", error);
  }
  return null;
}

export const loadTurkeyStatsBundle = loadGlobalStatsBundle;

export async function syncSeasonFromStatbotics(
  year: number,
  onProgress?: (loaded: number) => void
): Promise<{ year: number; records: Map<number, GlobalTeamYear>; count: number }> {
  const records = new Map<number, GlobalTeamYear>();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const page = await proxyGetJson<StatboticsTeamYearResponse[]>(
      "statbotics",
      `/team_years?year=${year}&limit=${limit}&offset=${offset}`
    );

    if (!Array.isArray(page) || page.length === 0) {
      break;
    }

    for (const raw of page) {
      const teamNum = asNumber(raw.team);
      const compacted = compactYear(raw);
      if (teamNum && compacted) {
        records.set(teamNum, compacted);
      }
    }

    onProgress?.(records.size);

    if (page.length < limit) {
      break;
    }
    offset += limit;
  }

  return { year, records, count: records.size };
}

export async function fetchGlobalTeamFromApis(teamNumber: number): Promise<GlobalTeamProfile> {
  const [statboticsTeam, teamYears, tbaTeam, tbaAwards] = await Promise.all([
    proxyGetJson<StatboticsTeamResponse>("statbotics", `/team/${teamNumber}`),
    proxyGetJson<StatboticsTeamYearResponse[]>("statbotics", `/team_years?team=${teamNumber}&limit=1000`),
    proxyGetJson<TBATeamSimple>("tba", `/team/frc${teamNumber}/simple`).catch(() => null),
    proxyGetJson<TBAAward[]>("tba", `/team/frc${teamNumber}/awards`).catch(() => []),
  ]);

  const years = (Array.isArray(teamYears) ? teamYears : [])
    .map(compactYear)
    .filter((year): year is GlobalTeamYear => year != null)
    .sort((a, b) => a.year - b.year);

  const awards: GlobalTeamAward[] = (Array.isArray(tbaAwards) ? tbaAwards : [])
    .map((award) => ({
      year: asNumber(award.year) ?? 0,
      name: award.name || "Award",
      eventKey: award.event_key,
    }))
    .filter((award) => award.year > 0);

  return {
    teamNumber,
    name: tbaTeam?.nickname || statboticsTeam?.name || `Team ${teamNumber}`,
    city: tbaTeam?.city,
    state: tbaTeam?.state_prov || statboticsTeam?.state,
    country: tbaTeam?.country || statboticsTeam?.country,
    rookieYear: tbaTeam?.rookie_year || statboticsTeam?.rookie_year,
    active: Boolean(statboticsTeam?.active),
    lastActiveYear: statboticsTeam?.last_active_year,
    careerRecord: compactRecord(statboticsTeam?.record),
    normEpa: compactNormEpa(statboticsTeam?.norm_epa),
    years,
    awards,
    source: "online",
    updatedAt: Date.now(),
  };
}

export interface FirstSyncTeam {
  teamNumber: number;
  nameShort?: string;
  nameFull?: string;
  schoolName?: string | null;
  robotName?: string | null;
  districtCode?: string | null;
  city?: string;
  stateProv?: string;
  country?: string;
  rookieYear?: number;
}

export async function syncSeasonFromFirstApi(
  season: number,
  onProgress?: (count: number) => void
): Promise<{ season: number; teams: Map<number, FirstSyncTeam>; count: number }> {
  const result = new Map<number, FirstSyncTeam>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const resp = await proxyGetJson<{
      teams?: Array<{
        teamNumber: number;
        nameShort?: string;
        nameFull?: string;
        schoolName?: string | null;
        robotName?: string | null;
        districtCode?: string | null;
        city?: string;
        stateProv?: string;
        country?: string;
        rookieYear?: number;
      }>;
      Teams?: Array<{
        teamNumber: number;
        nameShort?: string;
        nameFull?: string;
        schoolName?: string | null;
        robotName?: string | null;
        districtCode?: string | null;
        city?: string;
        stateProv?: string;
        country?: string;
        rookieYear?: number;
      }>;
      pageTotal?: number;
    }>("first", `/${season}/teams?page=${page}`);

    const pageTeams = resp.teams || resp.Teams || [];
    totalPages = resp.pageTotal || totalPages;

    for (const t of pageTeams) {
      if (t.teamNumber) {
        result.set(t.teamNumber, {
          teamNumber: t.teamNumber,
          nameShort: t.nameShort,
          nameFull: t.nameFull,
          schoolName: t.schoolName?.trim() || null,
          robotName: t.robotName?.trim() || null,
          districtCode: t.districtCode?.trim() || null,
          city: t.city,
          stateProv: t.stateProv,
          country: t.country,
          rookieYear: t.rookieYear,
        });
      }
    }

    onProgress?.(result.size);

    if (pageTeams.length === 0 || page >= totalPages) {
      break;
    }
    page++;
  }

  return { season, teams: result, count: result.size };
}

