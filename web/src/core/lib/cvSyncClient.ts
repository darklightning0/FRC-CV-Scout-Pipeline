/**
 * Pull AI scout bundles into Dexie (TBA-style poll).
 *
 * Default: same-origin Netlify function (scouts only need Wi‑Fi + open Maneuver).
 * Optional override: local sync server / tunnel URL in localStorage or VITE_CV_API_URL.
 */

import {
  adaptAiScoutBundle,
  isAiScoutBundle,
  makeCvTelemetryId,
} from '@/core/lib/cvTelemetryAdapter';
import { db, importCvMatchTelemetryEntries } from '@/core/db/database';
import type { AiScoutBundle } from '@/core/types/cv-telemetry';

const CV_SYNC_URL_KEY = 'cv_sync_base_url';
const DEFAULT_POLL_MS = 60_000;

export type CvSyncIndexMatch = {
  match_key: string;
  teams?: string[];
  processed_at?: string;
  bundle_path?: string;
};

export type CvSyncIndex = {
  event_key: string;
  updated_at?: string;
  matches: CvSyncIndexMatch[];
};

export type CvSyncPullResult = {
  importedMatches: number;
  importedTeams: number;
  matchKeys: string[];
};

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/** True when talking to /.netlify/functions/cv-api (query-param API). */
export function isNetlifyCvFunctionBase(baseUrl: string): boolean {
  return /\/\.netlify\/functions\/cv-api\/?$/i.test(normalizeBase(baseUrl));
}

export function getBuiltinCvApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/.netlify/functions/cv-api`;
  }
  return 'http://127.0.0.1:8888/.netlify/functions/cv-api';
}

function envDefaultApiUrl(): string {
  return ((import.meta.env.VITE_CV_API_URL as string | undefined) || '').trim();
}

export function getStoredCvSyncBaseUrl(): string {
  const stored = localStorage.getItem(CV_SYNC_URL_KEY)?.trim();
  if (stored) return stored;
  const fromEnv = envDefaultApiUrl();
  if (fromEnv) return fromEnv;
  return getBuiltinCvApiBaseUrl();
}

export function setStoredCvSyncBaseUrl(url: string): void {
  localStorage.setItem(CV_SYNC_URL_KEY, url.trim().replace(/\/$/, ''));
}

export function clearStoredCvSyncBaseUrl(): void {
  localStorage.removeItem(CV_SYNC_URL_KEY);
}

export async function fetchCvSyncHealth(baseUrl: string): Promise<boolean> {
  const base = normalizeBase(baseUrl);
  const url = isNetlifyCvFunctionBase(base)
    ? `${base}?action=health`
    : `${base}/health`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return false;
  const data = (await res.json()) as { ok?: boolean };
  return data.ok === true;
}

export async function fetchCvSyncIndex(baseUrl: string, eventKey: string): Promise<CvSyncIndex> {
  const base = normalizeBase(baseUrl);
  const url = isNetlifyCvFunctionBase(base)
    ? `${base}?action=index&event=${encodeURIComponent(eventKey)}`
    : `${base}/api/cv/index?event=${encodeURIComponent(eventKey)}`;

  const res = await fetch(url);
  if (res.status === 404) {
    return { event_key: eventKey, matches: [] };
  }
  if (!res.ok) {
    throw new Error(`CV sync index failed (${res.status})`);
  }
  return (await res.json()) as CvSyncIndex;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchAndStoreHeatmap(
  base: string,
  eventKey: string,
  matchKey: string,
  teamNumber: number
): Promise<void> {
  const url = isNetlifyCvFunctionBase(base)
    ? `${base}?action=heatmap&event=${encodeURIComponent(eventKey)}&match=${encodeURIComponent(matchKey)}&team=${teamNumber}`
    : `${base}/api/cv/heatmap/${encodeURIComponent(eventKey)}/${encodeURIComponent(matchKey)}/${teamNumber}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    if (!blob.type.includes('png') && blob.size < 100) return;
    const dataUrl = await blobToDataUrl(blob);
    const id = makeCvTelemetryId(matchKey, teamNumber);
    await db.cvMatchTelemetry.update(id, { heatmapDataUrl: dataUrl });
  } catch {
    // Heatmaps are optional
  }
}

export async function pullCvBundlesForEvent(
  baseUrl: string,
  eventKey: string
): Promise<CvSyncPullResult> {
  const base = normalizeBase(baseUrl);
  const index = await fetchCvSyncIndex(base, eventKey);
  const matchKeys: string[] = [];
  let importedTeams = 0;

  for (const match of index.matches || []) {
    const matchKey = match.match_key;
    if (!matchKey) continue;

    const bundleUrl = isNetlifyCvFunctionBase(base)
      ? `${base}?action=bundle&event=${encodeURIComponent(eventKey)}&match=${encodeURIComponent(matchKey)}`
      : `${base}/api/cv/bundle/${encodeURIComponent(eventKey)}/${encodeURIComponent(matchKey)}`;

    const res = await fetch(bundleUrl);
    if (!res.ok) continue;

    const json = (await res.json()) as unknown;
    if (!isAiScoutBundle(json)) continue;

    const bundle = json as AiScoutBundle;
    const entries = adaptAiScoutBundle(bundle);
    if (entries.length === 0) continue;

    await importCvMatchTelemetryEntries(entries, 'upsert');
    importedTeams += entries.length;
    matchKeys.push(matchKey);

    await Promise.all(
      entries.map((entry) =>
        fetchAndStoreHeatmap(base, eventKey, matchKey, entry.teamNumber)
      )
    );
  }

  setStoredCvSyncBaseUrl(base);
  window.dispatchEvent(new CustomEvent('cv-telemetry-imported'));

  return {
    importedMatches: matchKeys.length,
    importedTeams,
    matchKeys,
  };
}

export const CV_API_POLL_INTERVAL_MS = DEFAULT_POLL_MS;
