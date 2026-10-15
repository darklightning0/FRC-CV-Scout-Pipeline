/**
 * Team Statistics Hook for Strategy Overview Page
 *
 * Wraps useAllTeamStats with Strategy Overview filtering/aggregation.
 * Offline-first TBA: paints from cache, refreshes matches/COPR/EPA when online,
 * and falls back Matches / point columns to TBA when scout data is empty.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { type UseAllTeamStatsDebugInfo, useAllTeamStats, type UseAllTeamStatsOptions } from "./useAllTeamStats";
import { StrategyConfig, ColumnFilter, TeamData, AggregationType } from "@/core/types/strategy";
import type { TeamStats } from "@/core/types/team-stats";
import { getCachedTBAEventKeys } from "@/core/lib/tbaCache";
import { getCurrentEvent } from "@/core/lib/tba/eventDataUtils";
import { refreshTbaStrategyDataForEvents } from "@/core/lib/tba/refreshTbaStrategyData";

export interface UseTeamStatisticsResult {
    teamStats: TeamData[];
    filteredTeamStats: TeamData[];
    availableEvents: string[];
    isLoading: boolean;
    error: Error | null;
    debugInfo?: UseAllTeamStatsDebugInfo;
    mappingMs?: number;
    aggregationMs?: number;
    filterMs?: number;
    tbaStatus: {
        isOnline: boolean;
        isRefreshing: boolean;
        lastUpdatedAt: number | null;
        dataSource: 'cache' | 'tba' | 'none';
    };
    refreshTba: () => void;
}

function normalizeEventFilter(eventFilter: string | string[] | undefined): string[] {
    if (!eventFilter) {
        return [];
    }

    if (Array.isArray(eventFilter)) {
        return [...new Set(eventFilter.filter((eventKey): eventKey is string => !!eventKey && eventKey !== 'all'))];
    }

    if (eventFilter === 'all') {
        return [];
    }

    return [eventFilter];
}

function hasScoutPointSamples(stats: TeamStats, rawKey: string): boolean {
    if ((stats.matchCount ?? 0) <= 0) {
        return false;
    }
    const values = stats.rawValues?.[rawKey];
    return Array.isArray(values) && values.length > 0;
}

function resolveMatchCount(stats: TeamStats): number {
    const tba = stats.tbaMatchesPlayed ?? 0;
    if (tba > 0) {
        return tba;
    }
    return stats.matchCount ?? 0;
}

function resolveColumnValue(
    stats: TeamStats,
    path: string,
    aggregationType: AggregationType
): number | string | undefined {
    const scoutValue = getValueByPath(stats, path, aggregationType);

    if (path === 'rawValues.totalPoints') {
        if (hasScoutPointSamples(stats, 'totalPoints')) {
            return (typeof scoutValue === 'number' || typeof scoutValue === 'string' ? scoutValue : undefined);
        }
        if (typeof stats.coprTotalPoints === 'number' && Number.isFinite(stats.coprTotalPoints)) {
            return stats.coprTotalPoints;
        }
        if (typeof stats.statboticsTotalPoints === 'number' && Number.isFinite(stats.statboticsTotalPoints)) {
            return stats.statboticsTotalPoints;
        }
        return (typeof scoutValue === 'number' || typeof scoutValue === 'string' ? scoutValue : undefined);
    }

    if (path === 'rawValues.autoPoints') {
        if (hasScoutPointSamples(stats, 'autoPoints')) {
            return (typeof scoutValue === 'number' || typeof scoutValue === 'string' ? scoutValue : undefined);
        }
        if (typeof stats.coprTotalAutoPoints === 'number' && Number.isFinite(stats.coprTotalAutoPoints)) {
            return stats.coprTotalAutoPoints;
        }
        if (typeof stats.statboticsAutoPoints === 'number' && Number.isFinite(stats.statboticsAutoPoints)) {
            return stats.statboticsAutoPoints;
        }
        return (typeof scoutValue === 'number' || typeof scoutValue === 'string' ? scoutValue : undefined);
    }

    if (path === 'rawValues.teleopPoints') {
        if (hasScoutPointSamples(stats, 'teleopPoints')) {
            return (typeof scoutValue === 'number' || typeof scoutValue === 'string' ? scoutValue : undefined);
        }
        if (typeof stats.coprTotalTeleopPoints === 'number' && Number.isFinite(stats.coprTotalTeleopPoints)) {
            return stats.coprTotalTeleopPoints;
        }
        if (typeof stats.statboticsTeleopPoints === 'number' && Number.isFinite(stats.statboticsTeleopPoints)) {
            return stats.statboticsTeleopPoints;
        }
        return (typeof scoutValue === 'number' || typeof scoutValue === 'string' ? scoutValue : undefined);
    }

    if (path === 'rawValues.endgamePoints') {
        if (hasScoutPointSamples(stats, 'endgamePoints')) {
            return (typeof scoutValue === 'number' || typeof scoutValue === 'string' ? scoutValue : undefined);
        }
        if (typeof stats.coprEndgameTowerPoints === 'number' && Number.isFinite(stats.coprEndgameTowerPoints)) {
            return stats.coprEndgameTowerPoints;
        }
        if (typeof stats.statboticsEndgamePoints === 'number' && Number.isFinite(stats.statboticsEndgamePoints)) {
            return stats.statboticsEndgamePoints;
        }
        return (typeof scoutValue === 'number' || typeof scoutValue === 'string' ? scoutValue : undefined);
    }

    return typeof scoutValue === 'number' || typeof scoutValue === 'string'
        ? scoutValue
        : undefined;
}

export const useTeamStatistics = (
    eventFilter: string | string[] | undefined,
    config: StrategyConfig,
    columnFilters: Record<string, ColumnFilter>,
    aggregationType: AggregationType = 'average',
    allTeamStatsOptions: UseAllTeamStatsOptions = {}
): UseTeamStatisticsResult => {
    const selectedEventKeys = useMemo(() => normalizeEventFilter(eventFilter), [eventFilter]);
    const [refreshNonce, setRefreshNonce] = useState(0);
    const [forceRefreshTick, setForceRefreshTick] = useState(0);
    const forceRefreshRef = useRef(false);
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
    const [dataSource, setDataSource] = useState<'cache' | 'tba' | 'none'>('none');

    const { teamStats: allTeamStats, isLoading, error, debugInfo } = useAllTeamStats(undefined, {
        ...allTeamStatsOptions,
        refreshNonce,
    });

    const availableEvents = useMemo(() => {
        return Array.from(new Set(allTeamStats.map((team) => team.eventKey).filter(Boolean))).sort();
    }, [allTeamStats]);

    const refreshEventKeySignature = useMemo(() => {
        const keys = selectedEventKeys.length > 0 ? selectedEventKeys : availableEvents;
        return [...new Set(keys.map((k) => k.trim().toLowerCase()).filter(Boolean))].sort().join(',');
    }, [selectedEventKeys, availableEvents]);

    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            let keys = refreshEventKeySignature
                ? refreshEventKeySignature.split(',').filter(Boolean)
                : [];

            if (keys.length === 0) {
                const cachedKeys = await getCachedTBAEventKeys();
                const current = getCurrentEvent()?.trim();
                keys = [
                    ...cachedKeys,
                    ...(current ? [current.toLowerCase()] : []),
                ];
            }

            keys = [...new Set(keys.map((k) => k.trim().toLowerCase()).filter(Boolean))];
            if (keys.length === 0) {
                if (!cancelled) {
                    setDataSource('none');
                    setIsRefreshing(false);
                }
                return;
            }

            if (!cancelled) {
                setDataSource('cache');
            }

            if (!isOnline) {
                return;
            }

            if (!cancelled) setIsRefreshing(true);
            try {
                const force = forceRefreshRef.current;
                forceRefreshRef.current = false;
                const { anyUpdated } = await refreshTbaStrategyDataForEvents(keys, {
                    force,
                });
                if (cancelled) return;
                if (anyUpdated) {
                    setDataSource('tba');
                    setLastUpdatedAt(Date.now());
                    setRefreshNonce((n) => n + 1);
                } else {
                    setDataSource('cache');
                    setLastUpdatedAt(Date.now());
                }
            } finally {
                if (!cancelled) setIsRefreshing(false);
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [refreshEventKeySignature, isOnline, forceRefreshTick]);

    const filteredSourceTeamStats = useMemo(() => {
        if (selectedEventKeys.length === 0) {
            return allTeamStats;
        }

        const selectedSet = new Set(selectedEventKeys);
        return allTeamStats.filter((team) => selectedSet.has(team.eventKey));
    }, [allTeamStats, selectedEventKeys]);

    const { mappedTeamStats, mappingMs } = useMemo(() => {
        const startedAt = performance.now();
        const mapped = filteredSourceTeamStats.map(stats => {
            const teamData: TeamData = {
                teamNumber: stats.teamNumber,
                eventKey: stats.eventKey,
                matchCount: resolveMatchCount(stats),
                rawValues: stats.rawValues,
            };

            config.columns.forEach(col => {
                if (["teamNumber", "eventKey", "matchCount"].includes(col.key)) return;

                const value = resolveColumnValue(stats, col.key, aggregationType);
                if (typeof value === 'number' || typeof value === 'string') {
                    teamData[col.key] = value;
                }
            });

            if (typeof stats.tbaMatchesPlayed === 'number') {
                teamData.tbaMatchesPlayed = stats.tbaMatchesPlayed;
            }

            return teamData;
        });
        return {
            mappedTeamStats: mapped,
            mappingMs: performance.now() - startedAt,
        };
    }, [filteredSourceTeamStats, config.columns, aggregationType]);

    const { teamStats, aggregationMs } = useMemo(() => {
        const startedAt = performance.now();
        if (selectedEventKeys.length === 1) {
            return {
                teamStats: mappedTeamStats,
                aggregationMs: performance.now() - startedAt,
            };
        }

        // "All events" should show one row per team, aggregated across events.
        const byTeam = new Map<number, TeamData[]>();
        for (const row of mappedTeamStats) {
            const rows = byTeam.get(row.teamNumber) ?? [];
            rows.push(row);
            byTeam.set(row.teamNumber, rows);
        }

        const consolidated: TeamData[] = [];

        for (const [teamNumber, rows] of byTeam.entries()) {
            const consolidatedEventKey = selectedEventKeys.length === 0 ? 'all' : 'multiple';
            const merged: TeamData = {
                teamNumber,
                eventKey: consolidatedEventKey,
                matchCount: rows.reduce((sum, row) => {
                    const count = typeof row.matchCount === 'number' ? row.matchCount : 0;
                    return sum + count;
                }, 0),
                rawValues: {},
            };

            const allKeys = new Set<string>();
            rows.forEach(row => {
                Object.keys(row).forEach(key => allKeys.add(key));
            });

            for (const key of allKeys) {
                if (key === 'teamNumber' || key === 'eventKey' || key === 'matchCount') {
                    continue;
                }

                if (key === 'tbaMatchesPlayed') {
                    merged.tbaMatchesPlayed = rows.reduce((sum, row) => {
                        const count = typeof row.tbaMatchesPlayed === 'number' ? row.tbaMatchesPlayed : 0;
                        return sum + count;
                    }, 0);
                    continue;
                }

                if (key === 'rawValues') {
                    const mergedRawValues: Record<string, number[]> = {};

                    rows.forEach(row => {
                        const rawValues = row.rawValues;
                        if (!rawValues) {
                            return;
                        }

                        Object.entries(rawValues).forEach(([rawKey, rawMetricValues]) => {
                            if (!mergedRawValues[rawKey]) {
                                mergedRawValues[rawKey] = [];
                            }

                            mergedRawValues[rawKey]!.push(...rawMetricValues);
                        });
                    });

                    merged.rawValues = mergedRawValues;
                    continue;
                }

                const numericValues = rows
                    .map(row => row[key])
                    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

                if (numericValues.length > 0) {
                    if (aggregationType === 'average') {
                        const weighted = rows
                            .map(row => {
                                const value = row[key];
                                const weight = typeof row.matchCount === 'number' ? row.matchCount : 0;
                                return { value, weight };
                            })
                            .filter(
                                (pair): pair is { value: number; weight: number } =>
                                    typeof pair.value === 'number' &&
                                    Number.isFinite(pair.value) &&
                                    pair.weight > 0
                            );

                        const totalWeight = weighted.reduce((sum, pair) => sum + pair.weight, 0);
                        if (totalWeight > 0) {
                            const weightedSum = weighted.reduce((sum, pair) => sum + pair.value * pair.weight, 0);
                            merged[key] = weightedSum / totalWeight;
                            continue;
                        }
                    }

                    merged[key] = aggregateArray(numericValues, aggregationType);
                    continue;
                }

                const firstDefined = rows.find(row => row[key] !== undefined)?.[key];
                if (firstDefined !== undefined) {
                    merged[key] = firstDefined;
                }
            }

            consolidated.push(merged);
        }

        return {
            teamStats: consolidated.sort((a, b) => a.teamNumber - b.teamNumber),
            aggregationMs: performance.now() - startedAt,
        };
    }, [selectedEventKeys, mappedTeamStats, aggregationType]);

    // Apply column filters
    const { filteredTeamStats, filterMs } = useMemo(() => {
        const startedAt = performance.now();
        if (Object.keys(columnFilters).length === 0) {
            return {
                filteredTeamStats: teamStats,
                filterMs: performance.now() - startedAt,
            };
        }

        return {
            filteredTeamStats: teamStats.filter(team => {
            return Object.entries(columnFilters).every(([key, filter]) => {
                const val = team[key];
                if (typeof val !== 'number') return true;

                switch (filter.operator) {
                    case ">": return val > filter.value;
                    case ">=": return val >= filter.value;
                    case "<": return val < filter.value;
                    case "<=": return val <= filter.value;
                    case "=": return Math.abs(val - filter.value) < 0.001;
                    case "!=": return Math.abs(val - filter.value) >= 0.001;
                    case "between":
                        return filter.value2 !== undefined
                            ? val >= filter.value && val <= filter.value2
                            : true;
                    default: return true;
                }
            });
            }),
            filterMs: performance.now() - startedAt,
        };
    }, [teamStats, columnFilters]);

    return {
        teamStats,
        filteredTeamStats,
        availableEvents,
        isLoading,
        error,
        debugInfo,
        mappingMs,
        aggregationMs,
        filterMs,
        tbaStatus: {
            isOnline,
            isRefreshing,
            lastUpdatedAt,
            dataSource,
        },
        refreshTba: () => {
            forceRefreshRef.current = true;
            setForceRefreshTick((n) => n + 1);
        },
    };
};


/**
 * Helper to get nested value from object using dot notation
 * If the value is an array (like rawValues), aggregate it based on the aggregationType
 */
function getValueByPath(obj: any, path: string, aggregationType: AggregationType = 'average'): any {
    if (!obj) return undefined;

    // Direct match
    if (obj[path] !== undefined) {
        const value = obj[path];
        return Array.isArray(value) ? aggregateArray(value, aggregationType) : value;
    }

    // Dot notation
    if (path.includes('.')) {
        const value = path.split('.').reduce((o, key) => o?.[key], obj);
        return Array.isArray(value) ? aggregateArray(value, aggregationType) : value;
    }

    return undefined;
}

/**
 * Aggregate an array of numbers based on aggregation type
 */
function aggregateArray(values: number[], type: AggregationType): number {
    if (values.length === 0) return 0;

    switch (type) {
        case 'average': {
            const sum = values.reduce((acc, val) => acc + val, 0);
            return sum / values.length;
        }
        case 'max': {
            return Math.max(...values);
        }
        case 'min': {
            return Math.min(...values);
        }
        case 'p75': {
            const sorted = [...values].sort((a, b) => a - b);
            const index = Math.ceil(sorted.length * 0.75) - 1;
            return sorted[index] ?? 0;
        }
        case 'p25': {
            const sorted = [...values].sort((a, b) => a - b);
            const index = Math.ceil(sorted.length * 0.25) - 1;
            return sorted[index] ?? 0;
        }
        case 'median': {
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0
                ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
                : sorted[mid] ?? 0;
        }
        case 'sum': {
            return values.reduce((acc, val) => acc + val, 0);
        }
        default:
            return 0;
    }
}
