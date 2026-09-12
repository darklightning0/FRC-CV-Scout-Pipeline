type ApiProvider = 'tba' | 'nexus' | 'statbotics';

interface ProxyRequestOptions {
  apiKeyOverride?: string;
}

function getProxyPaths(): string[] {
  // Cloudflare Pages Function first, then Netlify (legacy), then empty base relative.
  return ['/api-proxy', '/.netlify/functions/api-proxy'];
}

export async function proxyGetJson<T>(
  provider: ApiProvider,
  endpoint: string,
  options: ProxyRequestOptions = {}
): Promise<T> {
  const query = new URLSearchParams({
    provider,
    endpoint,
  });

  const envFallbackKey =
    provider === 'tba'
      ? (import.meta.env.VITE_TBA_API_KEY as string | undefined)
      : provider === 'nexus'
        ? (import.meta.env.VITE_NEXUS_API_KEY as string | undefined)
        : undefined;

  const apiKey = options.apiKeyOverride || envFallbackKey || '';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(apiKey ? { 'X-Client-Api-Key': apiKey } : {}),
  };

  let lastError: unknown = null;

  for (const path of getProxyPaths()) {
    try {
      const response = await fetch(`${path}?${query.toString()}`, {
        method: 'GET',
        headers,
      });

      const text = await response.text();
      // SPA fallback HTML means this host has no function at that path
      if (typeof text === 'string' && text.trimStart().startsWith('<!')) {
        lastError = new Error(`API proxy unavailable at ${path}`);
        continue;
      }

      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }

      if (!response.ok) {
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'error' in payload &&
          typeof (payload as { error?: unknown }).error === 'string'
            ? (payload as { error: string }).error
            : `Proxy request failed (${response.status})`;
        // Missing function / misconfig — try next path; auth errors should surface
        if (response.status === 404 || response.status === 405) {
          lastError = new Error(message);
          continue;
        }
        throw new Error(message);
      }

      return payload as T;
    } catch (error) {
      lastError = error;
    }
  }

  // Fallback to direct API calls if proxies are down (needs VITE_* key in the client build)
  if (provider === 'tba') {
    const directUrl = `https://www.thebluealliance.com/api/v3${endpoint}`;
    const directRes = await fetch(directUrl, {
      headers: {
        'X-TBA-Auth-Key': apiKey,
      },
    });
    if (directRes.ok) return (await directRes.json()) as T;
    const errText = await directRes.text();
    throw new Error(`TBA direct request failed (${directRes.status}): ${errText.slice(0, 120)}`);
  }

  if (provider === 'nexus') {
    const directRes = await fetch(`https://frc.nexus/api/v1${endpoint}`, {
      headers: {
        'Nexus-Api-Key': apiKey,
        Accept: 'application/json',
      },
    });
    if (directRes.ok) return (await directRes.json()) as T;
  }

  if (provider === 'statbotics') {
    const bases = [
      'https://api.statbotics.io/v3',
      'https://api-statbotics.iterativerefinement.com/v3',
    ];
    for (const base of bases) {
      try {
        const directRes = await fetch(`${base}${endpoint}`);
        if (!directRes.ok) continue;
        const text = await directRes.text();
        if (text.trim() === '{}' || text.trim() === '[]') continue;
        return JSON.parse(text) as T;
      } catch {
        /* try next */
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('API proxy unavailable');
}
