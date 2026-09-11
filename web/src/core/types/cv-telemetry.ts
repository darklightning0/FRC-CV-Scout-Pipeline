/**
 * Computer-vision match telemetry (RobotDetector → Hunter Eyes)
 *
 * Stored separately from human scout entries. Never overwrites
 * scoutingData.autoPath / teleopPath.
 */

export type CvAlliance = 'red' | 'blue' | 'unknown';

/** Field point in blue-alliance perspective, normalized 0–1 */
export type CvFieldPoint = {
  x: number;
  y: number;
  timeSec: number;
};

export type CvZoneOccupancyPct = {
  alliance: number;
  neutral: number;
  opponent: number;
};

/** One team’s CV summary for a single match (Dexie row) */
export type CvMatchTelemetryEntry = {
  id: string; // `${matchKey}_${teamNumber}`
  matchKey: string;
  eventKey: string;
  teamNumber: number;
  alliance: CvAlliance;
  maxSpeedMps: number;
  avgSpeedMps: number;
  totalDistanceM: number;
  zoneOccupancyPct: CvZoneOccupancyPct;
  trenchCrossings: number;
  bumpCrossings: number;
  /** Auto path in normalized 0–1 blue perspective */
  autoPath: CvFieldPoint[];
  /** Teleop segment (≈18s–130s) */
  teleopPath?: CvFieldPoint[];
  /** Endgame segment (≈130s+) */
  endgamePath?: CvFieldPoint[];
  /** Full-match sampled trail */
  matchPath?: CvFieldPoint[];
  /** Optional data-URL or remote URL for team heatmap PNG */
  heatmapDataUrl?: string;
  sampleCount: number;
  schemaVersion: number;
  importedAt: number;
  processedAt?: string;
};

/** Raw JSON from export_ai_telemetry.py / ai_scout_bundle_*.json */
export type AiScoutBundleWaypoint = {
  x?: number;
  y?: number;
  x_m?: number;
  y_m?: number;
  timeSec?: number;
};

export type AiScoutTeamTelemetry = {
  team_id?: string;
  alliance?: string;
  max_speed_mps?: number;
  avg_speed_mps?: number;
  total_distance_m?: number;
  zone_occupancy_pct?: Partial<CvZoneOccupancyPct>;
  trench_crossings?: number;
  bump_crossings?: number;
  auto_path_waypoints?: AiScoutBundleWaypoint[];
  teleop_path_waypoints?: AiScoutBundleWaypoint[];
  endgame_path_waypoints?: AiScoutBundleWaypoint[];
  match_path_waypoints?: AiScoutBundleWaypoint[];
  sample_count?: number;
};

export type AiScoutBundle = {
  schema_version?: number;
  match_key: string;
  event_key?: string;
  processed_at?: string;
  field_dimensions_m?: { length?: number; width?: number };
  red_teams?: string[];
  blue_teams?: string[];
  teams_telemetry: Record<string, AiScoutTeamTelemetry>;
};
