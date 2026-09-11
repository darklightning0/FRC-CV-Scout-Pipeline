import { isMatchSchedulePayload } from "@/core/lib/matchScheduleTransfer";

const isPitLikeEntry = (entry: Record<string, unknown>): boolean => {
  if (typeof entry.id === 'string' && entry.id.startsWith('pit-')) {
    return true;
  }

  if ('robotPhoto' in entry) {
    return true;
  }

  if (
    entry.drivetrain !== undefined ||
    entry.weight !== undefined ||
    entry.reportedAutoScoring !== undefined ||
    entry.reportedTeleopScoring !== undefined
  ) {
    return true;
  }

  const gameData = entry.gameData;
  if (gameData && typeof gameData === 'object' && !Array.isArray(gameData)) {
    const gameDataRecord = gameData as Record<string, unknown>;
    if (gameDataRecord.reportedAutosByStart !== undefined) {
      return true;
    }
  }

  return false;
};

export const detectDataType = (jsonData: unknown): 'scouting' | 'scoutProfiles' | 'pitScouting' | 'pitScoutingImagesOnly' | 'matchSchedule' | 'aiScoutBundle' | null => {
  if (!jsonData || typeof jsonData !== 'object') return null;

  const data = jsonData as Record<string, unknown>;

  // Check for AI Computer Vision Scouting Bundle format
  if ('teams_telemetry' in data || ('match_key' in data && 'teams_telemetry' in data)) {
    return 'aiScoutBundle';
  }

  // Check for scout profiles format
  if ('scouts' in data && 'predictions' in data) {
    return 'scoutProfiles';
  }

  // Check for pit scouting images-only format
  if ('type' in data && data.type === 'pit-scouting-images-only' && 'entries' in data && Array.isArray(data.entries)) {
    return 'pitScoutingImagesOnly';
  }

  if (isMatchSchedulePayload(jsonData)) {
    return 'matchSchedule';
  }

  // Check for pit scouting format
  if ('entries' in data && Array.isArray(data.entries)) {
    const entries = data.entries as unknown[];
    if (entries.length > 0 && typeof entries[0] === 'object' && entries[0] !== null) {
      const entry = entries[0] as Record<string, unknown>;
      if (entry.teamNumber && entry.scoutName && isPitLikeEntry(entry)) {
        return 'pitScouting';
      }
    }
  }

  // Check for modern scouting data format (with entries and IDs)
  if ('entries' in data && Array.isArray(data.entries)) {
    const entries = data.entries as unknown[];
    if (entries.length > 0 && typeof entries[0] === 'object' && entries[0] !== null) {
      const entry = entries[0] as Record<string, unknown>;
      // ScoutingEntryBase format with gameData at root level
      if ('id' in entry && 'gameData' in entry && typeof entry.gameData === 'object') {
        return 'scouting';
      }
    }
  }

  // Check for legacy scouting data format
  if ('data' in data && Array.isArray(data.data)) {
    return 'scouting';
  }

  // Check for array format (could be scouting data)
  if (Array.isArray(jsonData)) {
    return 'scouting';
  }

  return null;
};
