/**
 * Convert RobotDetector AI scout bundle coordinates → Maneuver field space.
 *
 * Canonical storage: blue-alliance perspective, normalized 0–1
 * (X: blue wall → red wall, Y: near → far). FieldCanvas mirrors for red.
 */

import type {
  AiScoutBundle,
  AiScoutBundleWaypoint,
  AiScoutTeamTelemetry,
  CvAlliance,
  CvFieldPoint,
  CvMatchTelemetryEntry,
} from '@/core/types/cv-telemetry';
import type { PathWaypoint } from '@/game-template/components/field-map';

export const DEFAULT_FIELD_LENGTH_M = 16.54;
export const DEFAULT_FIELD_WIDTH_M = 8.21;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Accepts either meters (x_m/y_m or legacy x/y > 1) or already-normalized 0–1.
 */
export function waypointToNormalized(
  point: AiScoutBundleWaypoint,
  fieldLengthM = DEFAULT_FIELD_LENGTH_M,
  fieldWidthM = DEFAULT_FIELD_WIDTH_M
): CvFieldPoint | null {
  const timeSec = typeof point.timeSec === 'number' ? point.timeSec : 0;

  let xM: number | undefined;
  let yM: number | undefined;

  if (typeof point.x_m === 'number' && typeof point.y_m === 'number') {
    xM = point.x_m;
    yM = point.y_m;
  } else if (typeof point.x === 'number' && typeof point.y === 'number') {
    // Legacy sample bundle used meters in x/y; new exporter may put 0–1 in x/y
    if (point.x > 1.05 || point.y > 1.05) {
      xM = point.x;
      yM = point.y;
    } else {
      return {
        x: clamp01(point.x),
        y: clamp01(point.y),
        timeSec,
      };
    }
  }

  if (xM === undefined || yM === undefined || xM <= 0 || yM <= 0) {
    return null;
  }

  return {
    x: clamp01(xM / fieldLengthM),
    y: clamp01(yM / fieldWidthM),
    timeSec,
  };
}

export function normalizeAlliance(value: string | undefined): CvAlliance {
  if (value === 'red' || value === 'blue') return value;
  return 'unknown';
}

export function makeCvTelemetryId(matchKey: string, teamNumber: number): string {
  return `${matchKey}_${teamNumber}`;
}

export function teamTelemetryToEntry(
  teamId: string,
  team: AiScoutTeamTelemetry,
  bundle: AiScoutBundle
): CvMatchTelemetryEntry | null {
  const teamNumber = Number.parseInt(String(team.team_id ?? teamId), 10);
  if (!Number.isFinite(teamNumber) || teamNumber <= 0) return null;

  const matchKey = String(bundle.match_key || 'unknown');
  const eventKey =
    (typeof bundle.event_key === 'string' && bundle.event_key) ||
    (matchKey.includes('_') ? matchKey.split('_')[0]! : matchKey);

  const length = bundle.field_dimensions_m?.length ?? DEFAULT_FIELD_LENGTH_M;
  const width = bundle.field_dimensions_m?.width ?? DEFAULT_FIELD_WIDTH_M;

  const mapWaypoints = (list: AiScoutBundleWaypoint[] | undefined): CvFieldPoint[] =>
    (list ?? [])
      .map((wp) => waypointToNormalized(wp, length, width))
      .filter((p): p is CvFieldPoint => p !== null);

  const autoPath = mapWaypoints(team.auto_path_waypoints);
  const teleopPath = mapWaypoints(team.teleop_path_waypoints);
  const endgamePath = mapWaypoints(team.endgame_path_waypoints);
  const matchPath = mapWaypoints(team.match_path_waypoints);

  let alliance = normalizeAlliance(team.alliance);
  if (alliance === 'unknown') {
    const red = new Set((bundle.red_teams ?? []).map(String));
    const blue = new Set((bundle.blue_teams ?? []).map(String));
    if (red.has(String(teamNumber))) alliance = 'red';
    else if (blue.has(String(teamNumber))) alliance = 'blue';
  }

  const zones = team.zone_occupancy_pct ?? {};

  return {
    id: makeCvTelemetryId(matchKey, teamNumber),
    matchKey,
    eventKey,
    teamNumber,
    alliance,
    maxSpeedMps: team.max_speed_mps ?? 0,
    avgSpeedMps: team.avg_speed_mps ?? 0,
    totalDistanceM: team.total_distance_m ?? 0,
    zoneOccupancyPct: {
      alliance: zones.alliance ?? 0,
      neutral: zones.neutral ?? 0,
      opponent: zones.opponent ?? 0,
    },
    trenchCrossings: team.trench_crossings ?? 0,
    bumpCrossings: team.bump_crossings ?? 0,
    autoPath,
    teleopPath,
    endgamePath,
    matchPath: matchPath.length > 0 ? matchPath : undefined,
    sampleCount: team.sample_count ?? autoPath.length,
    schemaVersion: bundle.schema_version ?? 1,
    importedAt: Date.now(),
    processedAt: bundle.processed_at,
  };
}

export function adaptAiScoutBundle(bundle: AiScoutBundle): CvMatchTelemetryEntry[] {
  const teams = bundle.teams_telemetry ?? {};
  const entries: CvMatchTelemetryEntry[] = [];
  for (const [teamId, team] of Object.entries(teams)) {
    const entry = teamTelemetryToEntry(teamId, team, bundle);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function isAiScoutBundle(data: unknown): data is AiScoutBundle {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  return typeof record.teams_telemetry === 'object' && record.teams_telemetry !== null;
}

/**
 * Convert normalized CV field points → FieldCanvas PathWaypoint list.
 * First point = start; remaining points form a single connected traversal path.
 */
export function cvFieldPointsToPathWaypoints(
  points: CvFieldPoint[],
  options?: { idPrefix?: string; timestampBase?: number }
): PathWaypoint[] {
  if (points.length === 0) return [];

  const prefix = options?.idPrefix ?? 'cv';
  const base = options?.timestampBase ?? Date.now();
  const first = points[0]!;

  const waypoints: PathWaypoint[] = [
    {
      id: `${prefix}-start`,
      type: 'start',
      action: 'CV Start',
      position: { x: first.x, y: first.y },
      timestamp: base + Math.round(first.timeSec * 1000),
    },
  ];

  if (points.length === 1) return waypoints;

  const pathPoints = points.map((p) => ({ x: p.x, y: p.y }));
  const last = points[points.length - 1]!;

  waypoints.push({
    id: `${prefix}-path`,
    type: 'traversal',
    action: 'CV Auto Path',
    position: { x: last.x, y: last.y },
    pathPoints,
    timestamp: base + Math.round(last.timeSec * 1000),
  });

  return waypoints;
}

