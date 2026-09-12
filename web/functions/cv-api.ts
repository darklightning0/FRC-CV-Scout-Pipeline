/**
 * Cloudflare Pages Function — CV telemetry sync API.
 * Route: /cv-api?action=health|index|bundle|heatmap|publish|publish-heatmap
 *
 * Storage: bind a KV namespace as `CV_TELEMETRY`
 *   Cloudflare Pages → Settings → Functions → KV namespace bindings
 *   Variable name: CV_TELEMETRY
 *
 * Auth for publish:
 *   Set CV_SYNC_API_KEY in Pages env (Production + Preview).
 *   Laptop watcher sends header X-CV-Sync-Key with the same value.
 *
 * Watcher:
 *   export CV_SYNC_API_URL='https://YOUR-PAGES-DOMAIN/cv-api'
 *   export CV_SYNC_API_KEY='same-as-pages-env'
 */

type KvGetType = 'text' | 'json' | 'arrayBuffer' | 'stream';

type KvNamespaceLike = {
  get(key: string, type?: KvGetType): Promise<unknown>;
  put(
    key: string,
    value: string | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<void>;
};

type IndexMatch = {
  match_key: string;
  teams: string[];
  processed_at?: string;
};

type IndexDoc = {
  event_key: string;
  updated_at: string;
  matches: IndexMatch[];
};

type CvEnv = {
  CV_TELEMETRY?: KvNamespaceLike;
  CV_SYNC_API_KEY?: string;
};

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-CV-Sync-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...extra,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
  });
}

function getPublishKey(env: CvEnv): string {
  return (env.CV_SYNC_API_KEY || '').trim();
}

function requireStore(env: CvEnv): KvNamespaceLike | Response {
  if (!env.CV_TELEMETRY) {
    return json(503, {
      error:
        'CV_TELEMETRY KV binding missing. In Cloudflare Pages → Settings → Functions, bind a KV namespace named CV_TELEMETRY.',
    });
  }
  return env.CV_TELEMETRY;
}

function authorizePublish(request: Request, env: CvEnv): Response | null {
  const expected = getPublishKey(env);
  if (!expected) return null;
  const provided = request.headers.get('X-CV-Sync-Key') || '';
  if (provided !== expected) {
    return json(401, { error: 'Invalid or missing X-CV-Sync-Key' });
  }
  return null;
}

export async function onRequest(context: {
  request: Request;
  env: CvEnv;
}): Promise<Response> {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const action = (url.searchParams.get('action') || '').toLowerCase();
  const eventKey = (url.searchParams.get('event') || '').trim().toLowerCase();
  const matchKey = (url.searchParams.get('match') || '').trim();

  if (request.method === 'GET' && (action === 'health' || !action)) {
    return json(200, {
      ok: true,
      service: 'robotdetector-cv-api-cloudflare',
      write_auth_required: Boolean(getPublishKey(env)),
      kv_bound: Boolean(env.CV_TELEMETRY),
    });
  }

  try {
    const storeOrErr = requireStore(env);
    if (storeOrErr instanceof Response) return storeOrErr;
    const store = storeOrErr;

    if (request.method === 'GET' && action === 'index') {
      if (!eventKey) return json(400, { error: 'Missing event' });
      const index = (await store.get(`index:${eventKey}`, 'json')) as IndexDoc | null;
      if (!index) {
        return json(404, {
          error: `No CV data for ${eventKey}`,
          event_key: eventKey,
          matches: [],
        });
      }
      return json(200, index);
    }

    if (request.method === 'GET' && action === 'bundle') {
      if (!eventKey || !matchKey) return json(400, { error: 'Missing event or match' });
      const bundle = await store.get(`bundle:${eventKey}:${matchKey}`, 'json');
      if (!bundle) return json(404, { error: 'Bundle not found' });
      return json(200, bundle);
    }

    if (request.method === 'GET' && action === 'heatmap') {
      const team = (url.searchParams.get('team') || '').trim();
      if (!eventKey || !matchKey || !team) {
        return json(400, { error: 'Missing event, match, or team' });
      }
      const key = `heatmap:${eventKey}:${matchKey}:${team}`;
      const png = await store.get(key, 'arrayBuffer');
      if (!png) return json(404, { error: 'Heatmap not found' });
      return new Response(png as ArrayBuffer, {
        status: 200,
        headers: corsHeaders({
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=300',
        }),
      });
    }

    if (request.method === 'POST' && action === 'publish') {
      const authErr = authorizePublish(request, env);
      if (authErr) return authErr;
      if (!eventKey || !matchKey) return json(400, { error: 'Missing event or match' });

      let bundle: Record<string, unknown>;
      try {
        bundle = (await request.json()) as Record<string, unknown>;
      } catch {
        return json(400, { error: 'Body must be JSON' });
      }

      if (!bundle.teams_telemetry || typeof bundle.teams_telemetry !== 'object') {
        return json(400, { error: 'Invalid AI scout bundle' });
      }

      await store.put(`bundle:${eventKey}:${matchKey}`, JSON.stringify(bundle), {
        httpMetadata: { contentType: 'application/json' },
      });

      const teams = new Set<string>();
      for (const t of (bundle.red_teams as string[] | undefined) || []) teams.add(String(t));
      for (const t of (bundle.blue_teams as string[] | undefined) || []) teams.add(String(t));
      for (const t of Object.keys((bundle.teams_telemetry as object) || {})) teams.add(String(t));

      const processedAt =
        typeof bundle.processed_at === 'string'
          ? bundle.processed_at
          : new Date().toISOString();

      const existing =
        ((await store.get(`index:${eventKey}`, 'json')) as IndexDoc | null) || {
          event_key: eventKey,
          updated_at: processedAt,
          matches: [],
        };

      const matches = (existing.matches || []).filter((m) => m.match_key !== matchKey);
      matches.push({
        match_key: matchKey,
        teams: [...teams].sort(),
        processed_at: processedAt,
      });
      matches.sort((a, b) => a.match_key.localeCompare(b.match_key));

      const index: IndexDoc = {
        event_key: eventKey,
        updated_at: new Date().toISOString(),
        matches,
      };
      await store.put(`index:${eventKey}`, JSON.stringify(index), {
        httpMetadata: { contentType: 'application/json' },
      });

      return json(200, { ok: true, event_key: eventKey, match_key: matchKey });
    }

    if (request.method === 'POST' && action === 'publish-heatmap') {
      const authErr = authorizePublish(request, env);
      if (authErr) return authErr;
      const team = (url.searchParams.get('team') || '').trim();
      if (!eventKey || !matchKey || !team) {
        return json(400, { error: 'Missing event, match, or team' });
      }

      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return json(400, { error: 'Empty body' });

      await store.put(`heatmap:${eventKey}:${matchKey}:${team}`, bytes, {
        httpMetadata: { contentType: 'image/png' },
      });
      return json(200, { ok: true, event_key: eventKey, match_key: matchKey, team });
    }

    return json(400, {
      error: 'Unknown action',
      hint: 'Use action=index|bundle|heatmap|publish|publish-heatmap|health',
    });
  } catch (error) {
    console.error('[cv-api]', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'CV API failure',
    });
  }
}
