/**
 * Cloudflare Pages Function — API proxy for TBA / Nexus / Statbotics.
 * Route: /api-proxy?provider=tba&endpoint=/events/2026
 *
 * Set in Cloudflare Pages → Settings → Environment variables (Production):
 *   TBA_API_KEY or TBA_AUTH_KEY or VITE_TBA_API_KEY
 *   NEXUS_API_KEY or NEXUS_AUTH_KEY or VITE_NEXUS_API_KEY
 */

type Provider = 'tba' | 'nexus' | 'statbotics';

const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3';
const NEXUS_BASE_URL = 'https://frc.nexus/api/v1';
const STATBOTICS_BASE_URL = 'https://api.statbotics.io/v3';
const STATBOTICS_FALLBACK_BASE_URL = 'https://api-statbotics.iterativerefinement.com/v3';

const tbaAllowed = [
  /^\/events\/\d+(?:\/simple)?$/,
  /^\/event\/[a-z0-9]+\/matches(?:\/simple)?$/i,
  /^\/event\/[a-z0-9]+\/coprs$/i,
  /^\/event\/[a-z0-9]+\/teams\/keys$/i,
  /^\/match\/[a-z0-9_]+$/i,
];

const nexusAllowed = [
  /^\/events$/,
  /^\/event\/[a-z0-9]+$/i,
  /^\/event\/[a-z0-9]+\/pits$/i,
  /^\/event\/[a-z0-9]+\/map$/i,
];

const statboticsAllowed = [/^\/team_event\/\d+\/[a-z0-9]+$/i];

function isAllowedEndpoint(provider: Provider, endpoint: string): boolean {
  const rules =
    provider === 'tba' ? tbaAllowed : provider === 'nexus' ? nexusAllowed : statboticsAllowed;
  return rules.some((rule) => rule.test(endpoint));
}

function getServerApiKey(env: Record<string, string | undefined>, provider: Provider): string {
  if (provider === 'tba') {
    return env.TBA_API_KEY || env.TBA_AUTH_KEY || env.VITE_TBA_API_KEY || '';
  }
  if (provider === 'nexus') {
    return env.NEXUS_API_KEY || env.NEXUS_AUTH_KEY || env.VITE_NEXUS_API_KEY || '';
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

    if (provider !== 'tba' && provider !== 'nexus' && provider !== 'statbotics') {
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
      provider === 'tba' ? TBA_BASE_URL : provider === 'nexus' ? NEXUS_BASE_URL : STATBOTICS_BASE_URL;

    const upstreamHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(provider === 'tba'
        ? { 'X-TBA-Auth-Key': apiKey }
        : provider === 'nexus'
          ? { 'Nexus-Api-Key': apiKey }
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
