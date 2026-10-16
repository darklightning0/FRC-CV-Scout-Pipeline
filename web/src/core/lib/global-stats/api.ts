import { proxyGetJson } from "@/core/lib/apiProxy";
import type {
  GlobalEpaRanks,
  GlobalNormEpa,
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
  district?: string | null;
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
  district?: string | null;
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
      district?: { rank?: number; percentile?: number };
      state?: { rank?: number; percentile?: number };
    };
  };
  record?: StatboticsRecord;
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
    districtRank: asNumber(raw.epa?.ranks?.district?.rank),
    districtPercentile: asNumber(raw.epa?.ranks?.district?.percentile),
    stateRank: asNumber(raw.epa?.ranks?.state?.rank),
    statePercentile: asNumber(raw.epa?.ranks?.state?.percentile),
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

const TURKEY_BUNDLE_URL = "/data/turkey-frc-stats.json";

export async function loadOfflineStatsBundle(): Promise<TurkeyStatsBundle | null> {
  try {
    const turkeyRes = await fetch(TURKEY_BUNDLE_URL, { cache: "force-cache" });
    if (turkeyRes.ok) {
      return (await turkeyRes.json()) as TurkeyStatsBundle;
    }
  } catch (error) {
    console.warn("[GlobalStats] Failed to load offline Turkey stats bundle", error);
  }
  return null;
}

export const loadGlobalStatsBundle = loadOfflineStatsBundle;
export const loadTurkeyStatsBundle = loadOfflineStatsBundle;

export async function downloadWorldwideStats(
  onProgress?: (message: string, percent: number) => void
): Promise<{ count: number; teams: GlobalTeamProfile[] }> {
  onProgress?.("Connecting to Statbotics global teams index...", 10);

  // 1. Fetch all teams directory from Statbotics
  const teamsMap = new Map<number, GlobalTeamProfile>();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const page = await proxyGetJson<StatboticsTeamResponse[]>(
      "statbotics",
      `/teams?limit=${limit}&offset=${offset}`
    );
    if (!Array.isArray(page) || page.length === 0) break;

    for (const raw of page) {
      const num = asNumber(raw.team);
      if (num) {
        teamsMap.set(num, {
          teamNumber: num,
          name: raw.name || `Team ${num}`,
          country: raw.country,
          state: raw.state,
          districtCode: raw.district?.toUpperCase() || null,
          rookieYear: raw.rookie_year,
          active: Boolean(raw.active),
          lastActiveYear: raw.last_active_year,
          careerRecord: compactRecord(raw.record),
          normEpa: compactNormEpa(raw.norm_epa),
          years: [],
          source: "online",
          updatedAt: Date.now(),
        });
      }
    }
    const currentPct = Math.min(45, 10 + Math.round((teamsMap.size / 3800) * 35));
    onProgress?.(`Loaded ${teamsMap.size} worldwide teams...`, currentPct);
    if (page.length < limit) break;
    offset += limit;
  }

  // 2. Fetch current 2026 season stats for all teams
  onProgress?.("Pulling 2026 season EPA telemetry & global rankings...", 50);
  offset = 0;
  let yearCount = 0;

  while (true) {
    const page = await proxyGetJson<StatboticsTeamYearResponse[]>(
      "statbotics",
      `/team_years?year=2026&limit=${limit}&offset=${offset}`
    );
    if (!Array.isArray(page) || page.length === 0) break;

    for (const raw of page) {
      const num = asNumber(raw.team);
      const compacted = compactYear(raw);
      if (num && compacted) {
        const team = teamsMap.get(num);
        if (team) {
          team.years = [compacted];
          if (compacted.epaNorm != null) {
            team.normEpa = { ...team.normEpa, current: compacted.epaNorm };
          }
        }
        yearCount++;
      }
    }
    const currentPct = Math.min(75, 50 + Math.round((yearCount / 3500) * 25));
    onProgress?.(`Loaded 2026 telemetry (${yearCount} teams)...`, currentPct);
    if (page.length < limit) break;
    offset += limit;
  }

  // 3. Enrich official FIRST Inspires 2026 rosters (schools, districts, robot names)
  onProgress?.("Enriching official schools, districts & robot names...", 80);
  try {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= 40) {
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
          website?: string;
        }>;
        pageTotal?: number;
      }>("first", `/2026/teams?page=${page}`);

      totalPages = resp.pageTotal || totalPages;
      const pageTeams = resp.teams || [];

      for (const t of pageTeams) {
        if (!t.teamNumber) continue;
        const existing = teamsMap.get(t.teamNumber);
        if (existing) {
          if (t.schoolName?.trim()) existing.schoolName = t.schoolName.trim();
          if (t.robotName?.trim()) existing.robotName = t.robotName.trim();
          if (t.nameFull?.trim()) existing.fullName = t.nameFull.trim();
          if (t.website?.trim()) existing.website = t.website.trim();
          if (t.districtCode?.trim()) existing.districtCode = t.districtCode.trim().toUpperCase();
          if (t.city) existing.city = t.city;
        } else {
          teamsMap.set(t.teamNumber, {
            teamNumber: t.teamNumber,
            name: t.nameShort || `Team ${t.teamNumber}`,
            fullName: t.nameFull?.trim() || null,
            schoolName: t.schoolName?.trim() || null,
            robotName: t.robotName?.trim() || null,
            districtCode: t.districtCode?.trim().toUpperCase() || null,
            city: t.city,
            state: t.stateProv,
            country: t.country,
            website: t.website?.trim() || null,
            rookieYear: t.rookieYear,
            years: [],
            active: true,
            source: "first",
            updatedAt: Date.now(),
          });
        }
      }
      onProgress?.(
        `Enriching official FIRST rosters (${Math.round((page / totalPages) * 100)}%)...`,
        Math.min(95, 80 + Math.round((page / totalPages) * 15))
      );
      if (page >= totalPages) break;
      page++;
    }
  } catch (err) {
    console.warn("[GlobalStats] FIRST API enrichment error (non-fatal):", err);
  }

  onProgress?.("Writing worldwide pack to IndexedDB offline storage...", 98);
  const allTeams = Array.from(teamsMap.values());
  return { count: allTeams.length, teams: allTeams };
}

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
  const currentSeason = new Date().getFullYear();
  const [statboticsTeam, teamYears, tbaTeam, tbaAwards, firstTeamResp] = await Promise.all([
    proxyGetJson<StatboticsTeamResponse>("statbotics", `/team/${teamNumber}`).catch(() => null),
    proxyGetJson<StatboticsTeamYearResponse[]>("statbotics", `/team_years?team=${teamNumber}&limit=1000`).catch(() => []),
    proxyGetJson<{
      key?: string;
      nickname?: string;
      name?: string;
      city?: string;
      state_prov?: string;
      country?: string;
      rookie_year?: number;
      website?: string;
      postal_code?: string;
      school_name?: string;
    }>("tba", `/team/frc${teamNumber}`).catch(() => null),
    proxyGetJson<TBAAward[]>("tba", `/team/frc${teamNumber}/awards`).catch(() => []),
    proxyGetJson<{
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
        website?: string;
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
        website?: string;
      }>;
    }>("first", `/${currentSeason}/teams?teamNumber=${teamNumber}`).catch(() => null),
  ]);

  const firstTeam = firstTeamResp?.teams?.[0] || firstTeamResp?.Teams?.[0];

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

  const district = (firstTeam?.districtCode?.trim() || statboticsTeam?.district?.toUpperCase() || null);
  const school = (firstTeam?.schoolName?.trim() || tbaTeam?.school_name?.trim() || null);
  const robot = (firstTeam?.robotName?.trim() || null);
  const fullName = (firstTeam?.nameFull?.trim() || tbaTeam?.name?.trim() || null);
  const website = (firstTeam?.website?.trim() || tbaTeam?.website?.trim() || null);

  return {
    teamNumber,
    name: firstTeam?.nameShort || tbaTeam?.nickname || statboticsTeam?.name || `Team ${teamNumber}`,
    fullName,
    schoolName: school,
    robotName: robot,
    districtCode: district,
    city: firstTeam?.city || tbaTeam?.city,
    state: firstTeam?.stateProv || tbaTeam?.state_prov || statboticsTeam?.state,
    country: firstTeam?.country || tbaTeam?.country || statboticsTeam?.country,
    postalCode: tbaTeam?.postal_code || null,
    website,
    rookieYear: firstTeam?.rookieYear || tbaTeam?.rookie_year || statboticsTeam?.rookie_year,
    active: Boolean(statboticsTeam?.active),
    lastActiveYear: statboticsTeam?.last_active_year,
    careerRecord: compactRecord(statboticsTeam?.record),
    normEpa: compactNormEpa(statboticsTeam?.norm_epa),
    years,
    awards,
    source: firstTeam ? "first" : "online",
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

