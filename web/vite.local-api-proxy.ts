import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

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

const statboticsAllowed = [
  /^\/team_event\/\d+\/[a-z0-9]+$/i,
];

function isAllowedEndpoint(provider: Provider, endpoint: string): boolean {
  const rules =
    provider === 'tba' ? tbaAllowed : provider === 'nexus' ? nexusAllowed : statboticsAllowed;
  return rules.some((rule) => rule.test(endpoint));
}

/**
 * Local Vite middleware that mirrors netlify/functions/api-proxy.ts
 * so `npm run dev` (plain Vite) can fetch TBA/Nexus/Statbotics.
 */
export function localApiProxyPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    name: 'local-api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        if (!rawUrl.startsWith('/.netlify/functions/api-proxy')) {
          next();
          return;
        }

        try {
          const url = new URL(rawUrl, 'http://localhost');
          const provider = (url.searchParams.get('provider') || '').toLowerCase() as Provider;
          const endpoint = url.searchParams.get('endpoint') || '';

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Api-Key');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Content-Type', 'application/json');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end('');
            return;
          }

          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          if (provider !== 'tba' && provider !== 'nexus' && provider !== 'statbotics') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid provider' }));
            return;
          }

          if (!endpoint.startsWith('/') || !isAllowedEndpoint(provider, endpoint)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Endpoint not allowed' }));
            return;
          }

          const headerKey =
            (req.headers['x-client-api-key'] as string | undefined) ||
            (req.headers['X-Client-Api-Key'] as string | undefined);

          const envKey =
            provider === 'tba'
              ? env.TBA_API_KEY || env.TBA_AUTH_KEY || env.VITE_TBA_API_KEY
              : provider === 'nexus'
                ? env.NEXUS_API_KEY || env.NEXUS_AUTH_KEY || env.VITE_NEXUS_API_KEY
                : env.STATBOTICS_API_KEY || env.VITE_STATBOTICS_API_KEY;

          const apiKey = headerKey || envKey;

          if (provider !== 'statbotics' && !apiKey) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: `${provider.toUpperCase()} API key not configured. Set VITE_${provider.toUpperCase()}_API_KEY in web/.env`,
              })
            );
            return;
          }

          const baseUrl =
            provider === 'tba'
              ? TBA_BASE_URL
              : provider === 'nexus'
                ? NEXUS_BASE_URL
                : env.STATBOTICS_API_BASE || STATBOTICS_BASE_URL;
          const fallbackBase =
            env.STATBOTICS_API_FALLBACK_BASE || STATBOTICS_FALLBACK_BASE_URL;

          const upstreamHeaders: Record<string, string> = {
            Accept: 'application/json',
            ...(provider === 'tba'
              ? { 'X-TBA-Auth-Key': apiKey! }
              : provider === 'nexus'
                ? { 'Nexus-Api-Key': apiKey! }
                : apiKey
                  ? { Authorization: `Bearer ${apiKey}` }
                  : {}),
          };

          const fetchUpstream = async (base: string) => {
            const upstream = await fetch(`${base}${endpoint}`, {
              method: 'GET',
              headers: upstreamHeaders,
            });
            const text = await upstream.text();
            return { upstream, text };
          };

          let { upstream, text } = await fetchUpstream(baseUrl);
          if (
            provider === 'statbotics' &&
            fallbackBase &&
            fallbackBase !== baseUrl &&
            (upstream.status >= 500 || text.trim() === '{}' || text.trim() === '[]')
          ) {
            try {
              const fallback = await fetchUpstream(fallbackBase);
              if (fallback.upstream.ok && fallback.text.trim() !== '{}') {
                upstream = fallback.upstream;
                text = fallback.text;
              }
            } catch (fallbackError) {
              console.warn('[local-api-proxy] Statbotics fallback failed', fallbackError);
            }
          }

          res.statusCode = upstream.status;
          res.end(text || JSON.stringify({}));
        } catch (error) {
          console.error('[local-api-proxy]', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Proxy error',
            })
          );
        }
      });
    },
  };
}
