import { proxyGetJson } from '@/core/lib/apiProxy';

export interface COPRMetrics {
  hubAutoPoints: number;
  hubTeleopPoints: number;
  hubTotalPoints: number;
  autoTowerPoints: number;
  endgameTowerPoints: number;
  totalPoints: number;
  totalTeleopPoints: number;
  totalAutoPoints: number;
  totalTowerPoints: number;
}

interface CachedCOPRPayload {
  eventKey: string;
  fetchedAt: number;
  metricsByTeam: Record<string, COPRMetrics>;
}

type RawCOPRResponse = Record<string, Record<string, number>>;

const COPR_STORAGE_PREFIX = 'tba_event_coprs_';

const parseTeamNumber = (teamKey: string): number | null => {
  const normalized = String(teamKey).trim().toLowerCase();
  const raw = normalized.startsWith('frc') ? normalized.slice(3) : normalized;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickMetricMap = (
  response: RawCOPRResponse,
  keys: string[]
): Record<string, number> => {
  for (const key of keys) {
    const metricMap = response[key];
    if (metricMap && typeof metricMap === 'object') {
      return metricMap;
    }
  }
  return {};
};

const parseCOPRResponse = (response: RawCOPRResponse): Map<number, COPRMetrics> => {
  const hubAuto = pickMetricMap(response, ['Hub Auto Points', 'hubAutoPoints']);
  const hubTeleop = pickMetricMap(response, ['Hub Teleop Points', 'hubTeleopPoints']);
  const hubTotal = pickMetricMap(response, ['Hub Total Points', 'hubTotalPoints']);
  const autoTower = pickMetricMap(response, ['Auto Tower Points', 'autoTowerPoints']);
  const endgameTower = pickMetricMap(response, ['Endgame Tower Points', 'endGameTowerPoints']);
  const totalPoints = pickMetricMap(response, ['totalPoints', 'Total Points']);
  const totalTeleopPoints = pickMetricMap(response, ['totalTeleopPoints', 'Total Teleop Points']);
  const totalAutoPoints = pickMetricMap(response, ['totalAutoPoints', 'Total Auto Points']);
  const totalTowerPoints = pickMetricMap(response, ['totalTowerPoints', 'Total Tower Points']);

  const allTeamKeys = new Set<string>([
    ...Object.keys(hubAuto),
    ...Object.keys(hubTeleop),
    ...Object.keys(hubTotal),
    ...Object.keys(autoTower),
    ...Object.keys(endgameTower),
    ...Object.keys(totalPoints),
    ...Object.keys(totalTeleopPoints),
    ...Object.keys(totalAutoPoints),
    ...Object.keys(totalTowerPoints),
  ]);

  const metricsByTeam = new Map<number, COPRMetrics>();

  for (const teamKey of allTeamKeys) {
    const teamNumber = parseTeamNumber(teamKey);
    if (!teamNumber) continue;

    metricsByTeam.set(teamNumber, {
      hubAutoPoints: Number(hubAuto[teamKey] ?? 0),
      hubTeleopPoints: Number(hubTeleop[teamKey] ?? 0),
      hubTotalPoints: Number(hubTotal[teamKey] ?? 0),
      autoTowerPoints: Number(autoTower[teamKey] ?? 0),
      endgameTowerPoints: Number(endgameTower[teamKey] ?? 0),
      totalPoints: Number(totalPoints[teamKey] ?? 0),
      totalTeleopPoints: Number(totalTeleopPoints[teamKey] ?? 0),
      totalAutoPoints: Number(totalAutoPoints[teamKey] ?? 0),
      totalTowerPoints: Number(totalTowerPoints[teamKey] ?? 0),
    });
  }

  return metricsByTeam;
};

const getStorageKey = (eventKey: string): string => `${COPR_STORAGE_PREFIX}${eventKey}`;

export const getCachedCOPREventKeys = (): string[] => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(COPR_STORAGE_PREFIX)) {
        const eventKey = key.replace(COPR_STORAGE_PREFIX, '');
        if (eventKey) keys.push(eventKey);
      }
    }

    return [...new Set(keys)].sort();
  } catch {
    return [];
  }
};

export const getCachedEventCOPRs = (eventKey: string): Map<number, COPRMetrics> => {
  try {
    const raw = localStorage.getItem(getStorageKey(eventKey));
    if (!raw) return new Map();

    const parsed = JSON.parse(raw) as CachedCOPRPayload;
    if (!parsed || !parsed.metricsByTeam || typeof parsed.metricsByTeam !== 'object') {
      return new Map();
    }

    return new Map(
      Object.entries(parsed.metricsByTeam)
        .map(([team, metrics]) => {
          const teamNumber = Number.parseInt(team, 10);
          return Number.isFinite(teamNumber) ? [teamNumber, metrics] as const : null;
        })
        .filter((entry): entry is readonly [number, COPRMetrics] => entry !== null)
    );
  } catch (error) {
    console.warn('Failed to parse cached COPR data:', error);
    return new Map();
  }
};

export const fetchAndCacheEventCOPRs = async (
  eventKey: string,
  apiKey: string
): Promise<Map<number, COPRMetrics>> => {
  const response = await proxyGetJson<RawCOPRResponse>(
    'tba',
    `/event/${eventKey}/coprs`,
    { apiKeyOverride: apiKey || undefined }
  );

  const metricsMap = parseCOPRResponse(response);

  const payload: CachedCOPRPayload = {
    eventKey,
    fetchedAt: Date.now(),
    metricsByTeam: Object.fromEntries(metricsMap.entries()),
  };

  localStorage.setItem(getStorageKey(eventKey), JSON.stringify(payload));
  return metricsMap;
};
