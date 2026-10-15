/**
 * Offline-first TBA refresh for Strategy Overview.
 * Paints from cache; refreshes matches / COPR / EPA when online.
 */

import { cacheTBAMatches, getCacheMetadata, getCachedTBAEventMatches } from '@/core/lib/tbaCache';
import { fetchTBAEventMatchesDetailed } from '@/core/lib/tbaMatchData';
import { fetchAndCacheEventCOPRs, getCachedEventCOPRs } from '@/core/lib/tba/coprUtils';
import {
  extractTeamsFromMatches,
  fetchAndCacheEventStatboticsEPA,
  getCachedEventStatboticsEPA,
} from '@/core/lib/statbotics/epaUtils';

const STALE_MS = 10 * 60 * 1000;

export type TbaStrategyRefreshResult = {
  eventKey: string;
  updated: boolean;
  reason: 'offline' | 'demo' | 'fresh' | 'refreshed' | 'failed' | 'empty';
};

function isDemoEvent(eventKey: string): boolean {
  return /^demo/i.test(eventKey);
}

/**
 * Refresh TBA matches + COPRs + Statbotics EPA for one event when online.
 * Safe to call anytime: no-ops offline / when cache is fresh.
 */
export async function refreshTbaStrategyDataForEvent(
  eventKey: string,
  options: { force?: boolean } = {}
): Promise<TbaStrategyRefreshResult> {
  const key = eventKey.trim().toLowerCase();
  if (!key) {
    return { eventKey: key, updated: false, reason: 'empty' };
  }

  if (isDemoEvent(key)) {
    return { eventKey: key, updated: false, reason: 'demo' };
  }

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!online) {
    return { eventKey: key, updated: false, reason: 'offline' };
  }

  const cached = await getCachedTBAEventMatches(key, true);
  const meta = await getCacheMetadata(key);
  const hasCopr = getCachedEventCOPRs(key).size > 0;
  const hasEpa = getCachedEventStatboticsEPA(key).size > 0;
  const stale = !meta || Date.now() - meta.lastFetchedAt > STALE_MS;
  const needsMatches = options.force || cached.length === 0 || stale;
  const needsMetrics = options.force || !hasCopr || !hasEpa;

  if (!needsMatches && !needsMetrics) {
    return { eventKey: key, updated: false, reason: 'fresh' };
  }

  try {
    let matches = cached;

    if (needsMatches) {
      const fresh = await fetchTBAEventMatchesDetailed(key);
      if (Array.isArray(fresh) && fresh.length > 0) {
        await cacheTBAMatches(fresh);
        matches = fresh;
      } else if (cached.length === 0) {
        return { eventKey: key, updated: false, reason: 'empty' };
      }
    }

    if (needsMetrics || needsMatches) {
      await fetchAndCacheEventCOPRs(key, '');
      const teams = extractTeamsFromMatches(matches);
      if (teams.length > 0) {
        await fetchAndCacheEventStatboticsEPA(key, teams);
      }
    }

    return { eventKey: key, updated: true, reason: 'refreshed' };
  } catch (error) {
    console.warn(`[Strategy TBA] refresh failed for ${key}, keeping cache`, error);
    return { eventKey: key, updated: false, reason: 'failed' };
  }
}

export async function refreshTbaStrategyDataForEvents(
  eventKeys: string[],
  options: { force?: boolean } = {}
): Promise<{ anyUpdated: boolean; results: TbaStrategyRefreshResult[] }> {
  const unique = [...new Set(eventKeys.map((k) => k.trim().toLowerCase()).filter(Boolean))];
  const results: TbaStrategyRefreshResult[] = [];

  for (const key of unique) {
    results.push(await refreshTbaStrategyDataForEvent(key, options));
  }

  return {
    anyUpdated: results.some((r) => r.updated),
    results,
  };
}
