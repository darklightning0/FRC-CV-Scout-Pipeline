type ApiProvider = 'tba' | 'nexus' | 'statbotics';

interface ProxyRequestOptions {
  apiKeyOverride?: string;
}

function getProxyBaseUrl(): string {
  // With the Vite local-api-proxy plugin, same-origin /.netlify/functions works in DEV.
  return '';
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

  try {
    const response = await fetch(`${getProxyBaseUrl()}/.netlify/functions/api-proxy?${query.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { 'X-Client-Api-Key': apiKey } : {}),
      },
    });

    const text = await response.text();
    let payload: unknown = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // Vite SPA fallback returns HTML when the Netlify function isn't available
      if (typeof text === 'string' && text.trimStart().startsWith('<!')) {
        throw new Error('API proxy unavailable (got HTML). Restart the Vite dev server.');
      }
      payload = text;
    }

    if (!response.ok) {
      const message =
        (typeof payload === 'object' && payload !== null && 'error' in payload && typeof (payload as { error?: unknown }).error === 'string')
          ? (payload as { error: string }).error
          : `Proxy request failed (${response.status})`;
      throw new Error(message);
    }

    return payload as T;
  } catch (error) {
    // Fallback to direct API calls if proxy is down
    if (provider === 'tba') {
      const directUrl = `https://www.thebluealliance.com/api/v3${endpoint}`;
      try {
        const directRes = await fetch(directUrl, {
          headers: {
            'X-TBA-Auth-Key': apiKey,
          },
        });
        if (directRes.ok) return await directRes.json() as T;
        const errText = await directRes.text();
        throw new Error(`TBA direct request failed (${directRes.status}): ${errText.slice(0, 120)}`);
      } catch (directError) {
        throw directError instanceof Error ? directError : error;
      }
    } else if (provider === 'nexus') {
      const directUrl = `https://frc.nexus/api/v1${endpoint}`;
      try {
        const directRes = await fetch(directUrl, {
          headers: {
            'Nexus-Api-Key': apiKey,
            Accept: 'application/json',
          },
        });
        if (directRes.ok) return await directRes.json() as T;
      } catch {}
    } else if (provider === 'statbotics') {
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
          /* try next base */
        }
      }
    }

    throw error;
  }
}