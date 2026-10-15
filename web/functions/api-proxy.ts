/**
 * Cloudflare Pages Function — API proxy for TBA / Nexus / Statbotics.
 * Route: /api-proxy?provider=tba&endpoint=/events/2026
 *
 * Set in Cloudflare Pages → Settings → Environment variables (Production):
 *   TBA_API_KEY or TBA_AUTH_KEY or VITE_TBA_API_KEY
 *   NEXUS_API_KEY or NEXUS_AUTH_KEY or VITE_NEXUS_API_KEY
 */

type Provider = 'tba' | 'nexus' | 'statbotics' | 'first';

const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3';
const NEXUS_BASE_URL = 'https://frc.nexus/api/v1';
const STATBOTICS_BASE_URL = 'https://api-statbotics.iterativerefinement.com/v3';
const STATBOTICS_FALLBACK_BASE_URL = 'https://api.statbotics.io/v3';
const FIRST_BASE_URL = 'https://frc-api.firstinspires.org/v3.0';

const tbaAllowed = [
  /^\/events\/\d+(?:\/simple)?$/,
  /^\/event\/[a-z0-9]+\/matches(?:\/simple)?$/i,
  /^\/event\/[a-z0-9]+\/coprs$/i,
  /^\/event\/[a-z0-9]+\/teams(?:\/keys|\/simple)?$/i,
  /^\/match\/[a-z0-9_]+$/i,
  /^\/team\/frc\d+(?:\/simple)?$/i,
  /^\/team\/frc\d+\/years$/i,
  /^\/team\/frc\d+\/awards$/i,
  /^\/team\/frc\d+\/events(?:\/\d+)?(?:\/simple)?$/i,
  /^\/teams\/\d+(?:\/simple)?$/i,
  /^\/teams\/\d+\/\d+(?:\/simple)?$/i,
];

const nexusAllowed = [
  /^\/events$/,
  /^\/event\/[a-z0-9]+$/i,
  /^\/event\/[a-z0-9]+\/pits$/i,
  /^\/event\/[a-z0-9]+\/map$/i,
];

const statboticsAllowed = [
  /^\/team_event\/\d+\/[a-z0-9]+$/i,
  /^\/team_events$/i,
  /^\/team\/\d+$/i,
  /^\/team_year\/\d+\/\d+$/i,
  /^\/teams$/i,
  /^\/team_years$/i,
];

const firstAllowed = [
  /^\/\d{4}\/(?:teams|events|matches|scores|rankings|awards|districts)(?:\/.*)?$/i,
];

function endpointPath(endpoint: string): string {
  const queryIndex = endpoint.indexOf('?');
  return queryIndex === -1 ? endpoint : endpoint.slice(0, queryIndex);
}

function isAllowedEndpoint(provider: Provider, endpoint: string): boolean {
  const path = endpointPath(endpoint);
  const rules =
    provider === 'tba'
      ? tbaAllowed
      : provider === 'nexus'
        ? nexusAllowed
        : provider === 'statbotics'
          ? statboticsAllowed
          : firstAllowed;
  return rules.some((rule) => rule.test(path));
}

const DEFAULT_FIRST_AUTH = 'ZGFya2xpZ2h0bmluZzoyMDQ0ZmE1YS04MDE5LTQ5MTktOTM3Yy0wNjY0MWJiMGMyYWQ=';

function getServerApiKey(env: Record<string, string | undefined>, provider: Provider): string {
  if (provider === 'tba') {
    return env.TBA_API_KEY || env.TBA_AUTH_KEY || env.VITE_TBA_API_KEY || '';
  }
  if (provider === 'nexus') {
    return env.NEXUS_API_KEY || env.NEXUS_AUTH_KEY || env.VITE_NEXUS_API_KEY || '';
  }
  if (provider === 'first') {
    if (env.FIRST_API_KEY || env.VITE_FIRST_API_KEY) {
      return env.FIRST_API_KEY || env.VITE_FIRST_API_KEY || '';
    }
    const username = env.FIRST_API_USERNAME || env.VITE_FIRST_API_USERNAME || '';
    const token = env.FIRST_API_TOKEN || env.VITE_FIRST_API_TOKEN || '';
    if (username && token) {
      try {
        return btoa(`${username}:${token}`);
      } catch {
        return DEFAULT_FIRST_AUTH;
      }
    }
    return DEFAULT_FIRST_AUTH;
  }
  return env.STATBOTICS_API_KEY || env.VITE_STATBOTICS_API_KEY || '';
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Client-Api-Key',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
      ...extraHeaders,
    },
  });
}

export async function onRequest(context: {
  request: Request;
  env: Record<string, string | undefined>;
}): Promise<Response> {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json(200, {});
  }
  if (request.method !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const url = new URL(request.url);
    const provider = (url.searchParams.get('provider') || '').toLowerCase() as Provider;
    const endpoint = url.searchParams.get('endpoint') || '';

    if (provider !== 'tba' && provider !== 'nexus' && provider !== 'statbotics' && provider !== 'first') {
      return json(400, { error: 'Invalid provider' });
    }
    if (!endpoint.startsWith('/') || !isAllowedEndpoint(provider, endpoint)) {
      return json(400, { error: 'Endpoint not allowed' });
    }

    const overrideKey = request.headers.get('X-Client-Api-Key') || '';
    const apiKey = overrideKey || getServerApiKey(env, provider);

    if (provider !== 'statbotics' && !apiKey) {
      return json(500, {
        error:
          `${provider.toUpperCase()} API key not configured. Set TBA_API_KEY / NEXUS_API_KEY in Cloudflare Pages → Settings → Environment variables (Production + Preview).`,
      });
    }

    const baseUrl =
      provider === 'tba'
        ? TBA_BASE_URL
        : provider === 'nexus'
          ? NEXUS_BASE_URL
          : provider === 'first'
            ? FIRST_BASE_URL
            : STATBOTICS_BASE_URL;

    const upstreamHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(provider === 'tba'
        ? { 'X-TBA-Auth-Key': apiKey }
        : provider === 'nexus'
          ? { 'Nexus-Api-Key': apiKey }
          : provider === 'first'
            ? { Authorization: `Basic ${apiKey}` }
            : apiKey
              ? { Authorization: `Bearer ${apiKey}` }
              : {}),
    };

    const fetchUpstream = async (base: string) => {
      const res = await fetch(`${base}${endpoint}`, { method: 'GET', headers: upstreamHeaders });
      const text = await res.text();
      return { res, text };
    };

    let { res, text } = await fetchUpstream(baseUrl);

    if (
      provider === 'statbotics' &&
      (res.status >= 500 || text.trim() === '{}' || text.trim() === '[]')
    ) {
      try {
        const fallback = await fetchUpstream(STATBOTICS_FALLBACK_BASE_URL);
        if (fallback.res.ok && fallback.text.trim() !== '{}') {
          res = fallback.res;
          text = fallback.text;
        }
      } catch {
        /* keep original */
      }
    }

    return new Response(text || '{}', {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': res.headers.get('cache-control') || 'public, max-age=30',
      },
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Proxy error',
    });
  }
};
