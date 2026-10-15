import type { Handler } from '@netlify/functions';

type Provider = 'tba' | 'nexus' | 'statbotics' | 'first';

const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3';
const NEXUS_BASE_URL = 'https://frc.nexus/api/v1';
const FIRST_BASE_URL = 'https://frc-api.firstinspires.org/v3.0';
/** Official Statbotics API is often 500 right now; mirror holds the same v3 data. */
const STATBOTICS_BASE_URL =
  (process.env.STATBOTICS_API_BASE || 'https://api.statbotics.io/v3').replace(/\/$/, '');
const STATBOTICS_FALLBACK_BASE_URL = (
  process.env.STATBOTICS_API_FALLBACK_BASE ||
  'https://api-statbotics.iterativerefinement.com/v3'
).replace(/\/$/, '');

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
  return rules.some(rule => rule.test(path));
}

function getServerApiKey(provider: Provider): string | undefined {
  if (provider === 'tba') {
    return process.env.TBA_API_KEY || process.env.TBA_AUTH_KEY || process.env.VITE_TBA_API_KEY;
  }
  if (provider === 'nexus') {
    return process.env.NEXUS_API_KEY || process.env.NEXUS_AUTH_KEY || process.env.VITE_NEXUS_API_KEY;
  }
  if (provider === 'first') {
    if (process.env.FIRST_API_KEY || process.env.VITE_FIRST_API_KEY) {
      return process.env.FIRST_API_KEY || process.env.VITE_FIRST_API_KEY;
    }
    const username = process.env.FIRST_API_USERNAME || process.env.VITE_FIRST_API_USERNAME || '';
    const token = process.env.FIRST_API_TOKEN || process.env.VITE_FIRST_API_TOKEN || '';
    if (username && token) {
      return Buffer.from(`${username}:${token}`).toString('base64');
    }
    return undefined;
  }

  return process.env.STATBOTICS_API_KEY || process.env.VITE_STATBOTICS_API_KEY;
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Client-Api-Key',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
    Vary: 'X-Client-Api-Key',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const provider = (event.queryStringParameters?.provider || '').toLowerCase() as Provider;
    const endpoint = event.queryStringParameters?.endpoint || '';

    if (provider !== 'tba' && provider !== 'nexus' && provider !== 'statbotics' && provider !== 'first') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid provider' }) };
    }

    if (!endpoint.startsWith('/') || !isAllowedEndpoint(provider, endpoint)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Endpoint not allowed' }) };
    }

    const overrideKey = event.headers['x-client-api-key'] || event.headers['X-Client-Api-Key'];
    const apiKey = overrideKey || getServerApiKey(provider);

    const providerNeedsApiKey = provider !== 'statbotics';
    if (providerNeedsApiKey && !apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `${provider.toUpperCase()} API key not configured on server. Set ${
            provider === 'tba'
              ? 'TBA_API_KEY (preferred) or TBA_AUTH_KEY (or VITE_TBA_API_KEY for local dev)'
              : provider === 'nexus'
                ? 'NEXUS_API_KEY (preferred) or NEXUS_AUTH_KEY (or VITE_NEXUS_API_KEY for local dev)'
                : provider === 'first'
                  ? 'FIRST_API_USERNAME and FIRST_API_TOKEN (or FIRST_API_KEY)'
                  : 'STATBOTICS_API_KEY (optional for restricted deployments)'
          }`,
        }),
      };
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
      const upstreamResponse = await fetch(`${base}${endpoint}`, {
        method: 'GET',
        headers: upstreamHeaders,
      });
      const text = await upstreamResponse.text();
      return { upstreamResponse, text };
    };

    let { upstreamResponse, text } = await fetchUpstream(baseUrl);

    // Official Statbotics frequently returns 500/`{}` while the website still works.
    if (
      provider === 'statbotics' &&
      STATBOTICS_FALLBACK_BASE_URL &&
      STATBOTICS_FALLBACK_BASE_URL !== baseUrl &&
      (upstreamResponse.status >= 500 || text.trim() === '{}' || text.trim() === '[]')
    ) {
      try {
        const fallback = await fetchUpstream(STATBOTICS_FALLBACK_BASE_URL);
        if (fallback.upstreamResponse.ok && fallback.text.trim() !== '{}') {
          upstreamResponse = fallback.upstreamResponse;
          text = fallback.text;
        }
      } catch (fallbackError) {
        console.warn('[api-proxy] Statbotics fallback failed', fallbackError);
      }
    }

    const upstreamCacheControl = upstreamResponse.headers.get('cache-control');

    return {
      statusCode: upstreamResponse.status,
      headers: {
        ...headers,
        ...(upstreamCacheControl ? { 'Cache-Control': upstreamCacheControl } : {}),
      },
      body: text || JSON.stringify({}),
    };
  } catch (error) {
    console.error('api-proxy error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Proxy error' }),
    };
  }
};