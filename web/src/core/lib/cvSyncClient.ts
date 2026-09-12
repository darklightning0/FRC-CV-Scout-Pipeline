/**
 * Pull AI scout bundles into Dexie (TBA-style poll).
 *
 * Default: same-origin /cv-api (Cloudflare Pages), then Netlify /.netlify/functions/cv-api.
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

/** Query-param CV APIs: Cloudflare `/cv-api` or Netlify `/.netlify/functions/cv-api`. */
export function isQueryParamCvApi(baseUrl: string): boolean {
  const base = normalizeBase(baseUrl);
  return /\/cv-api$/i.test(base) || /\/\.netlify\/functions\/cv-api$/i.test(base);
}

/** @deprecated Prefer isQueryParamCvApi — kept for older UI checks. */
export function isNetlifyCvFunctionBase(baseUrl: string): boolean {
  return isQueryParamCvApi(baseUrl);
}

export function getBuiltinCvApiCandidates(): string[] {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://127.0.0.1:8888';
  return [`${origin}/cv-api`, `${origin}/.netlify/functions/cv-api`];
}

export function getBuiltinCvApiBaseUrl(): string {
  return getBuiltinCvApiCandidates()[0]!;
}

function envDefaultApiUrl(): string {
  return ((import.meta.env.VITE_CV_API_URL as string | undefined) || '').trim();
}

export function getStoredCvSyncBaseUrl(): string {
  const stored = localStorage.getItem(CV_SYNC_URL_KEY)?.trim();
  if (stored) {
    // Migrate old Netlify default on Cloudflare hosts to /cv-api
    if (
      typeof window !== 'undefined' &&
      window.location?.origin &&
      stored === `${window.location.origin}/.netlify/functions/cv-api`
    ) {
      const next = `${window.location.origin}/cv-api`;
      localStorage.setItem(CV_SYNC_URL_KEY, next);
      return next;
    }
    return stored;
  }
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

async function parseJsonResponse(res: Response, label: string): Promise<unknown> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
    throw new Error(
      `${label}: got HTML instead of JSON (is /cv-api deployed? On Cloudflare, bind KV as CV_TELEMETRY and set CV_SYNC_API_KEY).`
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`${label}: invalid JSON (${trimmed.slice(0, 80)}…)`);
  }
}

export async function fetchCvSyncHealth(baseUrl: string): Promise<boolean> {
  const base = normalizeBase(baseUrl);
  const url = isQueryParamCvApi(base) ? `${base}?action=health` : `${base}/health`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return false;
  try {
    const data = (await parseJsonResponse(res, 'CV health')) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

/** Prefer a live same-origin CV API when the stored URL is dead HTML. */
export async function resolveWorkingCvSyncBaseUrl(preferred?: string): Promise<string> {
  const candidates = [
    preferred?.trim(),
    getStoredCvSyncBaseUrl(),
    ...getBuiltinCvApiCandidates(),
    envDefaultApiUrl(),
  ].filter((u): u is string => Boolean(u));

  const seen = new Set<string>();
  for (const raw of candidates) {
    const base = normalizeBase(raw);
    if (seen.has(base)) continue;
    seen.add(base);
    try {
      if (await fetchCvSyncHealth(base)) {
        setStoredCvSyncBaseUrl(base);
        return base;
      }
    } catch {
      /* try next */
    }
  }
  return normalizeBase(preferred || getStoredCvSyncBaseUrl() || getBuiltinCvApiBaseUrl());
}

export async function fetchCvSyncIndex(baseUrl: string, eventKey: string): Promise<CvSyncIndex> {
  const base = normalizeBase(baseUrl);
  const url = isQueryParamCvApi(base)
    ? `${base}?action=index&event=${encodeURIComponent(eventKey)}`
    : `${base}/api/cv/index?event=${encodeURIComponent(eventKey)}`;

  const res = await fetch(url);
  if (res.status === 404) {
    return { event_key: eventKey, matches: [] };
  }
  if (!res.ok) {
    throw new Error(`CV sync index failed (${res.status})`);
  }
  return (await parseJsonResponse(res, 'CV index')) as CvSyncIndex;
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
  const url = isQueryParamCvApi(base)
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
  const base = await resolveWorkingCvSyncBaseUrl(baseUrl);
  const healthy = await fetchCvSyncHealth(base);
  if (!healthy) {
    throw new Error(
      `Could not reach CV API at ${base}. On Cloudflare Pages: deploy /cv-api, bind KV as CV_TELEMETRY, and set CV_SYNC_API_KEY. Point the watcher at https://YOUR-DOMAIN/cv-api`
    );
  }

  const index = await fetchCvSyncIndex(base, eventKey);
  const matchKeys: string[] = [];
  let importedTeams = 0;

  for (const match of index.matches || []) {
    const matchKey = match.match_key;
    if (!matchKey) continue;

    const bundleUrl = isQueryParamCvApi(base)
      ? `${base}?action=bundle&event=${encodeURIComponent(eventKey)}&match=${encodeURIComponent(matchKey)}`
      : `${base}/api/cv/bundle/${encodeURIComponent(eventKey)}/${encodeURIComponent(matchKey)}`;

    const res = await fetch(bundleUrl);
    if (!res.ok) continue;

    let raw: unknown;
    try {
      raw = await parseJsonResponse(res, `CV bundle ${matchKey}`);
    } catch {
      continue;
    }
    if (!isAiScoutBundle(raw)) continue;

    const bundle = raw as AiScoutBundle;
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
