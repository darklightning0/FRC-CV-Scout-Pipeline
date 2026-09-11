/**
 * Cloud CV API for Hunter Eyes (Netlify Function + Blobs).
 *
 * Scouts only need Wi‑Fi + the deployed Hunter Eyes site — they poll this like TBA.
 * Your laptop POSTs finished bundles here (one watcher process; no second terminal for scouts).
 *
 * GET  /.netlify/functions/cv-api?action=index&event=2026tuis2
 * GET  /.netlify/functions/cv-api?action=bundle&event=2026tuis2&match=2026tuis2_qm1
 * POST /.netlify/functions/cv-api?action=publish&event=...&match=...
 *      Header: X-CV-Sync-Key: <CV_SYNC_API_KEY env on Netlify>
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { connectLambda, getStore } from '@netlify/blobs';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-CV-Sync-Key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

function getPublishKey(): string {
  return (process.env.CV_SYNC_API_KEY || '').trim();
}

/** Classic Functions (export handler) need connectLambda before getStore. */
function getCvStore(event: HandlerEvent) {
  connectLambda(event);

  const siteID =
    process.env.SITE_ID ||
    process.env.NETLIFY_SITE_ID ||
    '';
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    '';

  if (siteID && token) {
    return getStore({ name: 'cv-telemetry', siteID, token });
  }

  return getStore('cv-telemetry');
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const action = (event.queryStringParameters?.action || '').toLowerCase();
  const eventKey = (event.queryStringParameters?.event || '').trim().toLowerCase();
  const matchKey = (event.queryStringParameters?.match || '').trim();

  // Health must not depend on Blobs
  if (event.httpMethod === 'GET' && (action === 'health' || !action)) {
    return json(200, {
      ok: true,
      service: 'robotdetector-cv-api-netlify',
      write_auth_required: Boolean(getPublishKey()),
    });
  }

  try {
    const store = getCvStore(event);

    if (event.httpMethod === 'GET' && action === 'index') {
      if (!eventKey) return json(400, { error: 'Missing event' });
      const index = (await store.get(`index:${eventKey}`, { type: 'json' })) as IndexDoc | null;
      if (!index) {
        return json(404, { error: `No CV data for ${eventKey}`, event_key: eventKey, matches: [] });
      }
      return json(200, index);
    }

    if (event.httpMethod === 'GET' && action === 'bundle') {
      if (!eventKey || !matchKey) return json(400, { error: 'Missing event or match' });
      const bundle = await store.get(`bundle:${eventKey}:${matchKey}`, { type: 'json' });
      if (!bundle) return json(404, { error: 'Bundle not found' });
      return json(200, bundle);
    }

    if (event.httpMethod === 'GET' && action === 'heatmap') {
      const team = (event.queryStringParameters?.team || '').trim();
      if (!eventKey || !matchKey || !team) {
        return json(400, { error: 'Missing event, match, or team' });
      }
      const key = `heatmap:${eventKey}:${matchKey}:${team}`;
      const png = await store.get(key, { type: 'arrayBuffer' });
      if (!png) return json(404, { error: 'Heatmap not found' });
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=300',
        },
        body: Buffer.from(png).toString('base64'),
        isBase64Encoded: true,
      };
    }

    if (event.httpMethod === 'POST' && action === 'publish') {
      const expected = getPublishKey();
      if (expected) {
        const provided =
          event.headers['x-cv-sync-key'] || event.headers['X-CV-Sync-Key'] || '';
        if (provided !== expected) {
          return json(401, { error: 'Invalid or missing X-CV-Sync-Key' });
        }
      }
      if (!eventKey || !matchKey) return json(400, { error: 'Missing event or match' });
      if (!event.body) return json(400, { error: 'Empty body' });

      let bundle: Record<string, unknown>;
      try {
        const raw = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body;
        bundle = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return json(400, { error: 'Body must be JSON' });
      }

      if (!bundle.teams_telemetry || typeof bundle.teams_telemetry !== 'object') {
        return json(400, { error: 'Invalid AI scout bundle' });
      }

      await store.setJSON(`bundle:${eventKey}:${matchKey}`, bundle);

      const teams = new Set<string>();
      for (const t of (bundle.red_teams as string[] | undefined) || []) teams.add(String(t));
      for (const t of (bundle.blue_teams as string[] | undefined) || []) teams.add(String(t));
      for (const t of Object.keys((bundle.teams_telemetry as object) || {})) teams.add(String(t));

      const processedAt =
        typeof bundle.processed_at === 'string'
          ? bundle.processed_at
          : new Date().toISOString();

      const existing = ((await store.get(`index:${eventKey}`, { type: 'json' })) as IndexDoc | null) || {
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
      await store.setJSON(`index:${eventKey}`, index);

      return json(200, { ok: true, event_key: eventKey, match_key: matchKey });
    }

    if (event.httpMethod === 'POST' && action === 'publish-heatmap') {
      const expected = getPublishKey();
      if (expected) {
        const provided =
          event.headers['x-cv-sync-key'] || event.headers['X-CV-Sync-Key'] || '';
        if (provided !== expected) {
          return json(401, { error: 'Invalid or missing X-CV-Sync-Key' });
        }
      }
      const team = (event.queryStringParameters?.team || '').trim();
      if (!eventKey || !matchKey || !team) {
        return json(400, { error: 'Missing event, match, or team' });
      }
      if (!event.body) return json(400, { error: 'Empty body' });

      const bytes = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : Buffer.from(event.body, 'binary');

      await store.set(`heatmap:${eventKey}:${matchKey}:${team}`, bytes, {
        contentType: 'image/png',
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
};
