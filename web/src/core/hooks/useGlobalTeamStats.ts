import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGlobalTeamFromApis,
  loadGlobalStatsBundle,
  syncSeasonFromStatbotics,
  syncSeasonFromFirstApi,
  downloadWorldwideStats,
} from "@/core/lib/global-stats/api";
import { loadCachedGlobalTeams, putCachedGlobalTeam, putCachedGlobalTeams } from "@/core/lib/global-stats/cache";
import { canonicalCity, isTurkeyCountry, matchesGlobalStatsFilters, yearForDisplay } from "@/core/lib/global-stats/normalize";
import type { GlobalStatsFilters, GlobalStatsSortField, GlobalTeamProfile } from "@/core/lib/global-stats/types";

const FILTERS_STORAGE_KEY = "global_stats_filters";

const DEFAULT_FILTERS: GlobalStatsFilters = {
  search: "",
  country: "all",
  city: "all",
  district: "all",
  year: "all",
  activeOnly: false,
  offlineOnly: false,
  hasAwardsOnly: false,
  sortField: "epa",
  sortDirection: "desc",
};

const TURKEY_PRIORITY_CITIES = [
  "Izmir",
  "Istanbul",
  "Ankara",
  "Kocaeli",
  "Bursa",
  "Antalya",
  "Eskişehir",
  "Adana",
  "Gaziantep",
  "Konya",
];

function readStoredFilters(): GlobalStatsFilters {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function mergeTeams(existing: GlobalTeamProfile[], incoming: GlobalTeamProfile[]): GlobalTeamProfile[] {
  const byNumber = new Map(existing.map((team) => [team.teamNumber, { ...team }]));
  for (const team of incoming) {
    const prev = byNumber.get(team.teamNumber);
    if (!prev) {
      byNumber.set(team.teamNumber, { ...team });
      continue;
    }

    // Merge years: keep whichever has more years or combine them
    let mergedYears = prev.years ?? [];
    if ((team.years?.length ?? 0) >= (prev.years?.length ?? 0)) {
      mergedYears = team.years;
    } else if (team.years?.length) {
      const yearsMap = new Map((prev.years ?? []).map((y) => [y.year, y]));
      for (const y of team.years) {
        yearsMap.set(y.year, { ...(yearsMap.get(y.year) ?? {}), ...y });
      }
      mergedYears = [...yearsMap.values()].sort((a, b) => a.year - b.year);
    }

    // Merge awards: keep whichever has more awards
    const mergedAwards = (team.awards?.length ?? 0) >= (prev.awards?.length ?? 0)
      ? team.awards
      : prev.awards;

    byNumber.set(team.teamNumber, {
      ...prev,
      ...team,
      name: team.name || prev.name,
      fullName: team.fullName?.trim() || prev.fullName?.trim() || null,
      schoolName: team.schoolName?.trim() || prev.schoolName?.trim() || null,
      robotName: team.robotName?.trim() || prev.robotName?.trim() || null,
      districtCode: team.districtCode?.trim() || prev.districtCode?.trim() || null,
      city: team.city || prev.city,
      state: team.state || prev.state,
      country: team.country || prev.country,
      website: team.website?.trim() || prev.website?.trim() || null,
      postalCode: team.postalCode || prev.postalCode || null,
      rookieYear: team.rookieYear ?? prev.rookieYear,
      active: team.active ?? prev.active,
      careerRecord: team.careerRecord || prev.careerRecord,
      normEpa: team.normEpa || prev.normEpa,
      years: mergedYears,
      awards: mergedAwards,
      source: team.source === "offline" ? "offline" : (prev.source || team.source),
      updatedAt: Math.max(team.updatedAt ?? 0, prev.updatedAt ?? 0, Date.now()),
    });
  }
  return [...byNumber.values()].sort((a, b) => a.teamNumber - b.teamNumber);
}

export function useGlobalTeamStats() {
  const [teams, setTeams] = useState<GlobalTeamProfile[]>([]);
  const [filters, setFilters] = useState<GlobalStatsFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [downloadingGlobal, setDownloadingGlobal] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ message: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bundleGeneratedAt, setBundleGeneratedAt] = useState<number | null>(null);

  useEffect(() => {
    setFilters(readStoredFilters());
  }, []);

  useEffect(() => {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [cached, bundle] = await Promise.all([loadCachedGlobalTeams(), loadGlobalStatsBundle()]);
        if (cancelled) return;
        const bundleTeams = (bundle?.teams ?? []).map((team: GlobalTeamProfile) => ({ ...team, source: "offline" as const }));
        const merged = mergeTeams(cached, bundleTeams);
        if (merged.length > 0) {
          await putCachedGlobalTeams(merged);
        }
        setBundleGeneratedAt(bundle?.generatedAt ?? null);
        setTeams(merged);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load team statistics");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTeams = useMemo(() => {
    const matched = teams.filter((team) => matchesGlobalStatsFilters(team, filters));
    const sortField = filters.sortField ?? "epa";
    const sortDirection = filters.sortDirection ?? "desc";
    const dir = sortDirection === "asc" ? 1 : -1;

    return matched.sort((a, b) => {
      const yearA = yearForDisplay(a, filters.year);
      const yearB = yearForDisplay(b, filters.year);

      let valA: number | string | null = null;
      let valB: number | string | null = null;

      switch (sortField) {
        case "epa":
          valA = yearA?.epaTotal ?? a.normEpa?.current ?? -9999;
          valB = yearB?.epaTotal ?? b.normEpa?.current ?? -9999;
          break;
        case "auto":
          valA = yearA?.epaAuto ?? -9999;
          valB = yearB?.epaAuto ?? -9999;
          break;
        case "teleop":
          valA = yearA?.epaTeleop ?? -9999;
          valB = yearB?.epaTeleop ?? -9999;
          break;
        case "endgame":
          valA = yearA?.epaEndgame ?? -9999;
          valB = yearB?.epaEndgame ?? -9999;
          break;
        case "epaMax":
          valA = yearA?.epaMax ?? a.normEpa?.max ?? -9999;
          valB = yearB?.epaMax ?? b.normEpa?.max ?? -9999;
          break;
        case "winrate": {
          const recA = filters.year === "all" ? a.careerRecord : yearA?.record;
          const recB = filters.year === "all" ? b.careerRecord : yearB?.record;
          valA = recA?.winrate ?? -1;
          valB = recB?.winrate ?? -1;
          break;
        }
        case "worldRank":
          valA = yearA?.ranks?.worldRank ?? 999999;
          valB = yearB?.ranks?.worldRank ?? 999999;
          // default rank sort is ascending (rank 1 is best)
          return (Number(valA) - Number(valB)) * (sortDirection === "asc" ? -1 : 1) * dir;
        case "countryRank":
          valA = yearA?.ranks?.countryRank ?? 999999;
          valB = yearB?.ranks?.countryRank ?? 999999;
          return (Number(valA) - Number(valB)) * (sortDirection === "asc" ? -1 : 1) * dir;
        case "district":
          valA = a.districtCode ?? "";
          valB = b.districtCode ?? "";
          break;
        case "rookieYear":
          valA = a.rookieYear ?? 9999;
          valB = b.rookieYear ?? 9999;
          break;
        case "teamNumber":
          return (a.teamNumber - b.teamNumber) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "robotName":
          valA = a.robotName ?? "";
          valB = b.robotName ?? "";
          break;
        case "awards":
          valA = a.awards?.length ?? 0;
          valB = b.awards?.length ?? 0;
          break;
        default:
          valA = a.teamNumber;
          valB = b.teamNumber;
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return (valA - valB) * dir;
      }
      return String(valA ?? "").localeCompare(String(valB ?? "")) * dir;
    });
  }, [teams, filters]);

  const countryOptions = useMemo(() => {
    const detected = new Set<string>();
    for (const team of teams) {
      if (team.country) {
        if (isTurkeyCountry(team.country)) {
          detected.add("Turkey");
        } else {
          detected.add(team.country.trim());
        }
      }
    }
    const priority = ["Turkey", "USA", "Canada", "Israel", "Mexico", "Australia"];
    const topFound = priority.filter((c) => detected.has(c));
    const others = [...detected]
      .filter((c) => !priority.includes(c))
      .sort((a, b) => a.localeCompare(b));
    return ["all", ...topFound, ...others];
  }, [teams]);

  const cityOptions = useMemo(() => {
    const detected = new Set<string>();
    for (const team of teams) {
      if (filters.country === "Turkey" && !isTurkeyCountry(team.country)) {
        continue;
      }
      const canon = canonicalCity(team.city, team.state);
      if (canon) detected.add(canon);
    }

    if (filters.country === "Turkey") {
      const topFound = TURKEY_PRIORITY_CITIES.filter((c) => detected.has(c));
      const remaining = [...detected]
        .filter((c) => !TURKEY_PRIORITY_CITIES.includes(c))
        .sort((a, b) => a.localeCompare(b));
      return [...topFound, ...remaining];
    }

    return [...detected].sort((a, b) => a.localeCompare(b));
  }, [teams, filters.country]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const team of teams) {
      for (const year of team.years) years.add(year.year);
    }
    return [...years].sort((a, b) => b - a);
  }, [teams]);

  const districtOptions = useMemo(() => {
    const set = new Set<string>();
    for (const team of teams) {
      if (team.districtCode) set.add(team.districtCode.toUpperCase());
    }
    return ["all", ...Array.from(set).sort()];
  }, [teams]);

  const toggleSort = useCallback((field: GlobalStatsSortField) => {
    setFilters((prev) => {
      if (prev.sortField === field) {
        return {
          ...prev,
          sortDirection: prev.sortDirection === "asc" ? "desc" : "asc",
        };
      }
      return {
        ...prev,
        sortField: field,
        sortDirection: field === "worldRank" || field === "countryRank" ? "asc" : "desc",
      };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const lookupTeam = useCallback(async (teamNumber: number) => {
    setLookupLoading(true);
    setError(null);
    try {
      const profile = await fetchGlobalTeamFromApis(teamNumber);
      await putCachedGlobalTeam(profile);
      setTeams((current) => mergeTeams(current, [profile]));
      return profile;
    } catch (lookupError) {
      const message = lookupError instanceof Error ? lookupError.message : "Could not look up that team";
      setError(message);
      return null;
    } finally {
      setLookupLoading(false);
    }
  }, []);

  const syncStatbotics = useCallback(
    async (targetYear?: number) => {
      setSyncLoading(true);
      setError(null);
      try {
        const yearToSync =
          targetYear ??
          (filters.year !== "all" && Number.isFinite(Number(filters.year))
            ? Number(filters.year)
            : 2026);

        const result = await syncSeasonFromStatbotics(yearToSync);
        if (result.count === 0) {
          return { updated: 0, year: yearToSync };
        }

        const existingMap = new Map(teams.map((t) => [t.teamNumber, t]));
        const updatedList: GlobalTeamProfile[] = [];

        result.records.forEach((seasonYear, teamNum) => {
          const existing = existingMap.get(teamNum);
          if (existing) {
            const filteredYears = existing.years.filter((y) => y.year !== yearToSync);
            const updatedYears = [...filteredYears, seasonYear].sort((a, b) => a.year - b.year);
            const updatedTeam: GlobalTeamProfile = {
              ...existing,
              years: updatedYears,
              updatedAt: Date.now(),
            };
            if (seasonYear.epaNorm != null) {
              updatedTeam.normEpa = {
                ...existing.normEpa,
                current: seasonYear.epaNorm,
              };
            }
            updatedList.push(updatedTeam);
          } else {
            const newTeam: GlobalTeamProfile = {
              teamNumber: teamNum,
              name: seasonYear.name || `Team ${teamNum}`,
              years: [seasonYear],
              active: true,
              source: "online",
              updatedAt: Date.now(),
            };
            updatedList.push(newTeam);
          }
        });

        await putCachedGlobalTeams(updatedList);
        setTeams((prev) => mergeTeams(prev, updatedList));

        return { updated: updatedList.length, year: yearToSync };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sync Statbotics data";
        setError(message);
        return { updated: 0, error: message };
      } finally {
        setSyncLoading(false);
      }
    },
    [filters.year, teams]
  );

  const syncFirstApi = useCallback(
    async (targetSeason?: number, onProgress?: (count: number) => void) => {
      const yearToSync =
        targetSeason ??
        (filters.year !== "all" && Number.isFinite(Number(filters.year))
          ? Number(filters.year)
          : 2026);

      setSyncLoading(true);
      setError(null);

      try {
        const result = await syncSeasonFromFirstApi(yearToSync, onProgress);
        if (result.count === 0) {
          return { updated: 0, year: yearToSync };
        }

        const existingMap = new Map(teams.map((t) => [t.teamNumber, t]));
        const updatedList: GlobalTeamProfile[] = [];

        result.teams.forEach((firstTeam, teamNum) => {
          const existing = existingMap.get(teamNum);
          if (existing) {
            const updatedTeam: GlobalTeamProfile = {
              ...existing,
              schoolName: firstTeam.schoolName || existing.schoolName,
              robotName: firstTeam.robotName || existing.robotName,
              districtCode: firstTeam.districtCode || existing.districtCode,
              source: "first",
              updatedAt: Date.now(),
            };
            updatedList.push(updatedTeam);
          } else {
            const newTeam: GlobalTeamProfile = {
              teamNumber: teamNum,
              name: firstTeam.nameShort || `Team ${teamNum}`,
              city: firstTeam.city,
              state: firstTeam.stateProv,
              country: firstTeam.country,
              districtCode: firstTeam.districtCode,
              schoolName: firstTeam.schoolName,
              robotName: firstTeam.robotName,
              rookieYear: firstTeam.rookieYear,
              years: [],
              active: true,
              source: "first",
              updatedAt: Date.now(),
            };
            updatedList.push(newTeam);
          }
        });

        await putCachedGlobalTeams(updatedList);
        setTeams((prev) => mergeTeams(prev, updatedList));

        return { updated: updatedList.length, year: yearToSync };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sync FIRST API data";
        setError(message);
        return { updated: 0, error: message };
      } finally {
        setSyncLoading(false);
      }
    },
    [filters.year, teams]
  );

  const syncAll = useCallback(
    async (targetSeason?: number) => {
      const yearToSync =
        targetSeason ??
        (filters.year !== "all" && Number.isFinite(Number(filters.year))
          ? Number(filters.year)
          : 2026);

      setSyncLoading(true);
      setError(null);

      try {
        const [statResult, firstResult] = await Promise.allSettled([
          syncSeasonFromStatbotics(yearToSync),
          syncSeasonFromFirstApi(yearToSync),
        ]);

        const existingMap = new Map(teams.map((t) => [t.teamNumber, t]));

        if (statResult.status === "fulfilled" && statResult.value.count > 0) {
          statResult.value.records.forEach((seasonYear, teamNum) => {
            const existing = existingMap.get(teamNum);
            if (existing) {
              const filteredYears = existing.years.filter((y) => y.year !== yearToSync);
              const updatedYears = [...filteredYears, seasonYear].sort((a, b) => a.year - b.year);
              const updatedTeam: GlobalTeamProfile = {
                ...existing,
                years: updatedYears,
                updatedAt: Date.now(),
              };
              if (seasonYear.epaNorm != null) {
                updatedTeam.normEpa = {
                  ...existing.normEpa,
                  current: seasonYear.epaNorm,
                };
              }
              existingMap.set(teamNum, updatedTeam);
            } else {
              existingMap.set(teamNum, {
                teamNumber: teamNum,
                name: seasonYear.name || `Team ${teamNum}`,
                years: [seasonYear],
                active: true,
                source: "online",
                updatedAt: Date.now(),
              });
            }
          });
        }

        if (firstResult.status === "fulfilled" && firstResult.value.count > 0) {
          firstResult.value.teams.forEach((firstTeam, teamNum) => {
            const existing = existingMap.get(teamNum);
            if (existing) {
              existingMap.set(teamNum, {
                ...existing,
                schoolName: firstTeam.schoolName || existing.schoolName,
                robotName: firstTeam.robotName || existing.robotName,
                districtCode: firstTeam.districtCode || existing.districtCode,
                source: "first",
                updatedAt: Date.now(),
              });
            } else {
              existingMap.set(teamNum, {
                teamNumber: teamNum,
                name: firstTeam.nameShort || `Team ${teamNum}`,
                city: firstTeam.city,
                state: firstTeam.stateProv,
                country: firstTeam.country,
                districtCode: firstTeam.districtCode,
                schoolName: firstTeam.schoolName,
                robotName: firstTeam.robotName,
                rookieYear: firstTeam.rookieYear,
                years: [],
                active: true,
                source: "first",
                updatedAt: Date.now(),
              });
            }
          });
        }

        const mergedAll = Array.from(existingMap.values());
        await putCachedGlobalTeams(mergedAll);
        setTeams(mergedAll);

        const statCount = statResult.status === "fulfilled" ? statResult.value.count : 0;
        const firstCount = firstResult.status === "fulfilled" ? firstResult.value.count : 0;

        return {
          updated: Math.max(statCount, firstCount),
          statCount,
          firstCount,
          year: yearToSync,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sync season data";
        setError(message);
        return { updated: 0, error: message };
      } finally {
        setSyncLoading(false);
      }
    },
    [filters.year, teams]
  );

  const hasWorldwideData = useMemo(() => {
    return teams.some((t) => t.country && !isTurkeyCountry(t.country));
  }, [teams]);

  const downloadGlobalData = useCallback(async () => {
    setDownloadingGlobal(true);
    setError(null);
    setDownloadProgress({ message: "Connecting to Statbotics global directory...", percent: 5 });
    try {
      const result = await downloadWorldwideStats((message, percent) => {
        setDownloadProgress({ message, percent });
      });

      setDownloadProgress({
        message: `Saving ${result.count.toLocaleString()} worldwide teams to local cache...`,
        percent: 96,
      });

      let updatedTeams: GlobalTeamProfile[] = [];
      setTeams((prevTeams) => {
        const merged = mergeTeams(prevTeams, result.teams);
        updatedTeams = merged;
        void putCachedGlobalTeams(merged);
        return merged;
      });

      setDownloadProgress({
        message: `Successfully installed ${result.count.toLocaleString()} global teams!`,
        percent: 100,
      });

      return { success: true, count: result.count, teams: updatedTeams };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download worldwide telemetry";
      setError(message);
      return { success: false, error: message };
    } finally {
      setTimeout(() => {
        setDownloadingGlobal(false);
        setDownloadProgress(null);
      }, 1200);
    }
  }, []);

  return {
    teams,
    filteredTeams,
    filters,
    setFilters,
    loading,
    lookupLoading,
    syncLoading,
    downloadingGlobal,
    downloadProgress,
    hasWorldwideData,
    downloadGlobalData,
    error,
    bundleGeneratedAt,
    countryOptions,
    cityOptions,
    districtOptions,
    yearOptions,
    toggleSort,
    resetFilters,
    lookupTeam,
    syncStatbotics,
    syncFirstApi,
    syncAll,
  };
}

