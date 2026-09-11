export interface MatchScheduleTransferEntry {
  matchNum: number;
  redAlliance: string[];
  blueAlliance: string[];
}

export interface MatchScheduleTransferPayload {
  type: 'match-schedule';
  version: '1.0';
  eventKey: string;
  exportedAt: string;
  matches: MatchScheduleTransferEntry[];
}

const normalizeTeam = (team: unknown): string | null => {
  if (typeof team === 'number' && Number.isFinite(team)) {
    return String(team);
  }

  if (typeof team === 'string') {
    const trimmed = team.trim();
    if (!trimmed) return null;
    return trimmed.replace(/^frc/i, '');
  }

  return null;
};

const normalizeAlliance = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeTeam)
    .filter((team): team is string => typeof team === 'string' && team.length > 0);
};

const parseMatchNum = (raw: unknown): number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

export const normalizeStoredMatchSchedule = (rawMatches: unknown): MatchScheduleTransferEntry[] => {
  if (!Array.isArray(rawMatches)) return [];

  const normalized = rawMatches
    .map((match): MatchScheduleTransferEntry | null => {
      if (!match || typeof match !== 'object') return null;
      const record = match as Record<string, unknown>;

      const matchNum = parseMatchNum(record.matchNum);
      if (!matchNum) return null;

      const redAlliance = normalizeAlliance(record.redAlliance);
      const blueAlliance = normalizeAlliance(record.blueAlliance);

      if (redAlliance.length === 0 || blueAlliance.length === 0) return null;

      return { matchNum, redAlliance, blueAlliance };
    })
    .filter((entry): entry is MatchScheduleTransferEntry => entry !== null)
    .sort((a, b) => a.matchNum - b.matchNum);

  return normalized;
};

export const createMatchSchedulePayload = (rawMatches: unknown, eventKey: string): MatchScheduleTransferPayload | null => {
  const trimmedEventKey = eventKey.trim();
  if (!trimmedEventKey) return null;

  const matches = normalizeStoredMatchSchedule(rawMatches);
  if (matches.length === 0) return null;

  return {
    type: 'match-schedule',
    version: '1.0',
    eventKey: trimmedEventKey,
    exportedAt: new Date().toISOString(),
    matches,
  };
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
};

export const isMatchSchedulePayload = (jsonData: unknown): jsonData is MatchScheduleTransferPayload => {
  if (!jsonData || typeof jsonData !== 'object') return false;

  const data = jsonData as Record<string, unknown>;

  if (data.type !== 'match-schedule') return false;
  if (data.version !== '1.0') return false;
  if (typeof data.eventKey !== 'string' || !data.eventKey.trim()) return false;
  if (typeof data.exportedAt !== 'string') return false;
  if (!Array.isArray(data.matches)) return false;

  return data.matches.every(match => {
    if (!match || typeof match !== 'object') return false;
    const record = match as Record<string, unknown>;

    return (
      typeof record.matchNum === 'number' &&
      record.matchNum > 0 &&
      isStringArray(record.redAlliance) &&
      isStringArray(record.blueAlliance)
    );
  });
};