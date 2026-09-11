import type { PitAssignment } from '@/core/lib/pitAssignmentTypes';

const PIT_ASSIGNMENTS_KEY_PREFIX = 'pit_assignments_';
const PIT_ASSIGNMENTS_META_KEY_PREFIX = 'pit_assignments_meta_';
const PIT_ASSIGNMENTS_MINE_KEY_PREFIX = 'pit_assignments_mine_';

export interface PitAssignmentTransferPayload {
  eventKey: string;
  sourceScoutName: string;
  generatedAt: number;
  assignments: PitAssignment[];
}

export type PitAssignmentImportStrategy = 'replace' | 'merge' | 'cancel';

const isPitAssignmentImportStrategy = (value: unknown): value is PitAssignmentImportStrategy =>
  value === 'replace' || value === 'merge' || value === 'cancel';

export interface PitAssignmentImportResult {
  strategy: PitAssignmentImportStrategy;
  importedCount: number;
  mergedCount: number;
  skippedCount: number;
}

interface PitAssignmentMeta {
  lastSyncedAt: number;
  sourceScoutName: string;
  strategy: Exclude<PitAssignmentImportStrategy, 'cancel'>;
}

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const normalizeScoutName = (name: string): string => {
  return name
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

export const getPitAssignmentsStorageKey = (eventKey: string): string => `${PIT_ASSIGNMENTS_KEY_PREFIX}${eventKey}`;

const getPitAssignmentsMetaKey = (eventKey: string): string => `${PIT_ASSIGNMENTS_META_KEY_PREFIX}${eventKey}`;

const getPitAssignmentsMineKey = (eventKey: string, normalizedScoutName: string): string =>
  `${PIT_ASSIGNMENTS_MINE_KEY_PREFIX}${eventKey}_${normalizedScoutName}`;

const buildAssignmentIdentity = (assignment: PitAssignment): string =>
  assignment.id || `${assignment.eventKey}:${assignment.teamNumber}:${normalizeScoutName(assignment.scoutName)}`;

const mergeAssignments = (existing: PitAssignment[], incoming: PitAssignment[]): PitAssignment[] => {
  const byIdentity = new Map<string, PitAssignment>();

  existing.forEach((assignment) => {
    byIdentity.set(buildAssignmentIdentity(assignment), assignment);
  });

  incoming.forEach((assignment) => {
    byIdentity.set(buildAssignmentIdentity(assignment), assignment);
  });

  return Array.from(byIdentity.values()).sort((a, b) => a.teamNumber - b.teamNumber);
};

export const loadPitAssignmentsForEvent = (eventKey: string): PitAssignment[] => {
  return parseJson<PitAssignment[]>(localStorage.getItem(getPitAssignmentsStorageKey(eventKey)), []);
};

export const loadMyPitAssignments = (eventKey: string, scoutName: string): PitAssignment[] => {
  const normalizedScoutName = normalizeScoutName(scoutName);
  if (!normalizedScoutName) return [];

  const mineKey = getPitAssignmentsMineKey(eventKey, normalizedScoutName);
  const storedMine = parseJson<PitAssignment[]>(localStorage.getItem(mineKey), []);

  if (storedMine.length > 0) {
    return storedMine;
  }

  const matchedAssignments = loadPitAssignmentsForEvent(eventKey).filter(
    (assignment) => normalizeScoutName(assignment.scoutName) === normalizedScoutName
  );

  if (matchedAssignments.length > 0) {
    return matchedAssignments;
  }

  return loadPitAssignmentsForEvent(eventKey);
};

const storePitAssignmentMeta = (eventKey: string, meta: PitAssignmentMeta) => {
  localStorage.setItem(getPitAssignmentsMetaKey(eventKey), JSON.stringify(meta));
};

const storeMineAssignments = (eventKey: string, scoutName: string, assignments: PitAssignment[]) => {
  const normalizedScoutName = normalizeScoutName(scoutName);
  if (!normalizedScoutName) return;

  const mineKey = getPitAssignmentsMineKey(eventKey, normalizedScoutName);
  localStorage.setItem(mineKey, JSON.stringify(assignments));
};

export const buildPitAssignmentsTransferPayload = (
  eventKey: string,
  sourceScoutName: string,
): PitAssignmentTransferPayload => ({
  eventKey,
  sourceScoutName,
  generatedAt: Date.now(),
  assignments: loadPitAssignmentsForEvent(eventKey),
});

export const hasPitAssignmentImportConflict = (payload: PitAssignmentTransferPayload): boolean => {
  const existingAssignments = loadPitAssignmentsForEvent(payload.eventKey);
  return existingAssignments.length > 0 && payload.assignments.length > 0;
};

export const importPitAssignmentsPayload = (
  payload: PitAssignmentTransferPayload,
  currentScoutName: string,
  strategyOverride?: PitAssignmentImportStrategy,
): PitAssignmentImportResult => {
  const existingAssignments = loadPitAssignmentsForEvent(payload.eventKey);

  let strategy: PitAssignmentImportStrategy = isPitAssignmentImportStrategy(strategyOverride)
    ? strategyOverride
    : 'replace';
  if (existingAssignments.length > 0 && payload.assignments.length > 0 && !strategyOverride) {
    strategy = 'merge';
  }

  if (strategy === 'cancel') {
    return {
      strategy,
      importedCount: 0,
      mergedCount: 0,
      skippedCount: payload.assignments.length,
    };
  }

  const nextAssignments = strategy === 'replace'
    ? [...payload.assignments]
    : mergeAssignments(existingAssignments, payload.assignments);

  // Sync active event context on the receiving scout
  if (payload.eventKey?.trim()) {
    localStorage.setItem('eventKey', payload.eventKey);
    localStorage.setItem('eventName', payload.eventKey);
  }

  localStorage.setItem(getPitAssignmentsStorageKey(payload.eventKey), JSON.stringify(nextAssignments));

  const myAssignments = nextAssignments.filter(
    (assignment) => normalizeScoutName(assignment.scoutName) === normalizeScoutName(currentScoutName)
  );
  const scopedAssignments = myAssignments.length > 0 ? myAssignments : nextAssignments;
  storeMineAssignments(
    payload.eventKey,
    currentScoutName,
    scopedAssignments,
  );

  storePitAssignmentMeta(payload.eventKey, {
    lastSyncedAt: Date.now(),
    sourceScoutName: payload.sourceScoutName,
    strategy,
  });

  return {
    strategy,
    importedCount: scopedAssignments.length,
    mergedCount: strategy === 'merge' ? nextAssignments.length : 0,
    skippedCount: strategy === 'replace' ? 0 : Math.max(0, existingAssignments.length - payload.assignments.length),
  };
};

export const markPitAssignmentCompleted = (
  eventKey: string,
  scoutName: string,
  teamNumber: number,
): boolean => {
  const normalizedScoutName = normalizeScoutName(scoutName);
  if (!normalizedScoutName) return false;

  const allAssignments = loadPitAssignmentsForEvent(eventKey);
  let updated = false;

  const nextAssignments = allAssignments.map((assignment) => {
    const isTarget = assignment.teamNumber === teamNumber
      && normalizeScoutName(assignment.scoutName) === normalizedScoutName;

    if (!isTarget || assignment.completed) {
      return assignment;
    }

    updated = true;
    return {
      ...assignment,
      completed: true,
    };
  });

  if (!updated) {
    return false;
  }

  localStorage.setItem(getPitAssignmentsStorageKey(eventKey), JSON.stringify(nextAssignments));

  const myAssignments = nextAssignments.filter(
    (assignment) => normalizeScoutName(assignment.scoutName) === normalizedScoutName
  );
  storeMineAssignments(eventKey, scoutName, myAssignments);

  return true;
};

export const getPitAssignmentMeta = (eventKey: string): { lastSyncedAt: number; sourceScoutName: string } | null => {
  const raw = parseJson<PitAssignmentMeta | null>(localStorage.getItem(getPitAssignmentsMetaKey(eventKey)), null);
  if (!raw) return null;
  return {
    lastSyncedAt: raw.lastSyncedAt,
    sourceScoutName: raw.sourceScoutName,
  };
};
