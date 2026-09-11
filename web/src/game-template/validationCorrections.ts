import type { TBAMatchData } from '@/core/lib/tbaMatchData';
import { getEntriesByEvent } from '@/core/db/scoutingDatabase';
import { updateScoutingEntryWithCorrection } from '@/db';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';

interface ParsedClimbOutcome {
  level: 1 | 2 | 3 | null;
  failed: boolean;
}

type ClimbPhase = 'auto' | 'endgame';

interface CombinedClimbState {
  auto: ParsedClimbOutcome;
  endgame: ParsedClimbOutcome;
}

interface InternalClimbCorrectionCandidate {
  entry: ScoutingEntryBase<Record<string, unknown>>;
  updatedGameData: Record<string, unknown>;
  matchKey: string;
  matchNumber: number;
  alliance: 'red' | 'blue';
  teamNumber: number;
  phase: ClimbPhase;
  current: ParsedClimbOutcome;
  expected: ParsedClimbOutcome;
}

export interface ClimbCorrectionSummary {
  processedTeams: number;
  correctedEntries: number;
  skippedMissingEntries: number;
  skippedNoTBAClimbData: number;
}

export interface ClimbCorrectionCandidate {
  phase: ClimbPhase;
  matchKey: string;
  matchNumber: number;
  alliance: 'red' | 'blue';
  teamNumber: number;
  currentLevel: 1 | 2 | 3 | null;
  currentFailed: boolean;
  tbaLevel: 1 | 2 | 3 | null;
  tbaFailed: boolean;
}

export interface ClimbCorrectionPreview {
  summary: ClimbCorrectionSummary;
  candidates: ClimbCorrectionCandidate[];
}

const ENDGAME_ROBOT_FIELDS = ['endGameTowerRobot1', 'endGameTowerRobot2', 'endGameTowerRobot3'] as const;
const AUTO_ROBOT_FIELDS = ['autoTowerRobot1', 'autoTowerRobot2', 'autoTowerRobot3'] as const;

function parseTBAClimbOutcome(rawStatus: unknown): ParsedClimbOutcome | null {
  if (typeof rawStatus !== 'string') {
    return null;
  }

  const normalized = rawStatus.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('level3') || normalized.includes('l3')) {
    return { level: 3, failed: false };
  }

  if (normalized.includes('level2') || normalized.includes('l2')) {
    return { level: 2, failed: false };
  }

  if (normalized.includes('level1') || normalized.includes('l1')) {
    return { level: 1, failed: false };
  }

  if (normalized.includes('fail')) {
    return { level: null, failed: true };
  }

  if (
    normalized.includes('none') ||
    normalized.includes('no attempt') ||
    normalized.includes('did not climb') ||
    normalized.includes('park')
  ) {
    return { level: null, failed: false };
  }

  return null;
}

function extractCurrentPhaseClimbOutcome(
  gameData: Record<string, unknown>,
  phase: ClimbPhase
): ParsedClimbOutcome {
  const phaseData = (gameData[phase] ?? {}) as Record<string, unknown>;

  if (phase === 'auto') {
    const level = phaseData.autoClimbL3 === true
      ? 3
      : phaseData.autoClimbL2 === true
        ? 2
        : phaseData.autoClimbL1 === true
          ? 1
          : null;

    return { level, failed: false };
  }

  const endgame = (gameData.endgame ?? {}) as Record<string, unknown>;

  const level = endgame.climbL3 === true
    ? 3
    : endgame.climbL2 === true
      ? 2
      : endgame.climbL1 === true
        ? 1
        : null;

  const failed = endgame.climbFailed === true;

  return { level, failed };
}

function extractCurrentCombinedClimbState(gameData: Record<string, unknown>): CombinedClimbState {
  return {
    auto: extractCurrentPhaseClimbOutcome(gameData, 'auto'),
    endgame: extractCurrentPhaseClimbOutcome(gameData, 'endgame'),
  };
}

function applyCombinedClimbStateToGameData(
  gameData: Record<string, unknown>,
  expected: CombinedClimbState
): Record<string, unknown> {
  const auto = (gameData.auto ?? {}) as Record<string, unknown>;
  const endgame = (gameData.endgame ?? {}) as Record<string, unknown>;

  const updatedAuto: Record<string, unknown> = {
    ...auto,
    autoClimbL1: expected.auto.level === 1,
    autoClimbL2: expected.auto.level === 2,
    autoClimbL3: expected.auto.level === 3,
  };

  const updatedEndgame: Record<string, unknown> = {
    ...endgame,
    climbL1: expected.endgame.level === 1,
    climbL2: expected.endgame.level === 2,
    climbL3: expected.endgame.level === 3,
    climbFailed: expected.endgame.failed,
  };

  return {
    ...gameData,
    auto: updatedAuto,
    endgame: updatedEndgame,
  };
}

function arePhaseOutcomesEquivalent(
  current: ParsedClimbOutcome,
  expected: ParsedClimbOutcome
): boolean {
  const currentNoSuccessfulClimb = current.level === null;
  const expectedNoSuccessfulClimb = expected.level === null;

  if (currentNoSuccessfulClimb && expectedNoSuccessfulClimb) {
    return true;
  }

  return current.level === expected.level && current.failed === expected.failed;
}

function areCombinedClimbStatesEquivalent(
  current: CombinedClimbState,
  expected: CombinedClimbState
): boolean {
  return (
    arePhaseOutcomesEquivalent(current.auto, expected.auto)
    && arePhaseOutcomesEquivalent(current.endgame, expected.endgame)
  );
}

function findScoutingEntry(
  entriesByKey: Map<string, Array<ScoutingEntryBase<Record<string, unknown>>>>,
  matchKey: string,
  matchNumber: number,
  teamNumber: number,
  alliance: 'red' | 'blue'
): ScoutingEntryBase<Record<string, unknown>> | null {
  const exactKey = `${matchKey}::${teamNumber}::${alliance}`;
  const exactMatches = entriesByKey.get(exactKey) ?? [];

  if (exactMatches.length > 0) {
    return exactMatches.sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
  }

  const fallbackPrefix = `qm${matchNumber}`;
  for (const [entryKey, groupedEntries] of entriesByKey.entries()) {
    if (!entryKey.endsWith(`::${teamNumber}::${alliance}`)) {
      continue;
    }

    const candidate = groupedEntries
      .filter(entry => entry.matchKey === fallbackPrefix || entry.matchNumber === matchNumber)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export async function correctClimbDataWithValidation(
  eventKey: string,
  matches: TBAMatchData[],
  correctedBy = 'match-validation-correction'
): Promise<ClimbCorrectionSummary> {
  const allEntries = await getEntriesByEvent(eventKey);
  const entriesByKey = new Map<string, Array<ScoutingEntryBase<Record<string, unknown>>>>();

  for (const entry of allEntries) {
    const key = `${entry.matchKey}::${entry.teamNumber}::${entry.allianceColor}`;
    const grouped = entriesByKey.get(key) ?? [];
    grouped.push(entry);
    entriesByKey.set(key, grouped);
  }

  const analysis = analyzeClimbCorrectionsFromEntries(matches, entriesByKey);
  const summary: ClimbCorrectionSummary = {
    ...analysis.summary,
    correctedEntries: 0,
  };

  const latestByEntryId = new Map<string, InternalClimbCorrectionCandidate>();
  for (const candidate of analysis.internalCandidates) {
    latestByEntryId.set(candidate.entry.id, candidate);
  }

  for (const candidate of latestByEntryId.values()) {
    const updatedEntry: ScoutingEntryBase<Record<string, unknown>> = {
      ...candidate.entry,
      gameData: candidate.updatedGameData,
      originalScoutName: candidate.entry.originalScoutName ?? candidate.entry.scoutName,
    };

    await updateScoutingEntryWithCorrection(
      candidate.entry.id,
      updatedEntry,
      `Auto-corrected climb outcome from TBA validation (${candidate.matchKey}, team ${candidate.teamNumber})`,
      correctedBy
    );

    summary.correctedEntries += 1;
  }

  return summary;
}

export async function previewClimbCorrectionsWithValidation(
  eventKey: string,
  matches: TBAMatchData[]
): Promise<ClimbCorrectionPreview> {
  const allEntries = await getEntriesByEvent(eventKey);
  const entriesByKey = new Map<string, Array<ScoutingEntryBase<Record<string, unknown>>>>();

  for (const entry of allEntries) {
    const key = `${entry.matchKey}::${entry.teamNumber}::${entry.allianceColor}`;
    const grouped = entriesByKey.get(key) ?? [];
    grouped.push(entry);
    entriesByKey.set(key, grouped);
  }

  const analysis = analyzeClimbCorrectionsFromEntries(matches, entriesByKey);
  return {
    summary: analysis.summary,
    candidates: analysis.candidates,
  };
}

function analyzeClimbCorrectionsFromEntries(
  matches: TBAMatchData[],
  entriesByKey: Map<string, Array<ScoutingEntryBase<Record<string, unknown>>>>
): {
  summary: ClimbCorrectionSummary;
  candidates: ClimbCorrectionCandidate[];
  internalCandidates: InternalClimbCorrectionCandidate[];
} {
  const summary: ClimbCorrectionSummary = {
    processedTeams: 0,
    correctedEntries: 0,
    skippedMissingEntries: 0,
    skippedNoTBAClimbData: 0,
  };
  const internalCandidates: InternalClimbCorrectionCandidate[] = [];
  const candidates: ClimbCorrectionCandidate[] = [];

  for (const match of matches) {
    if (!match.score_breakdown || typeof match.score_breakdown !== 'object') {
      continue;
    }

    for (const alliance of ['red', 'blue'] as const) {
      const allianceBreakdown = (match.score_breakdown as Record<string, unknown>)[alliance] as Record<string, unknown> | undefined;
      const allianceTeams = match.alliances[alliance].team_keys;

      if (!allianceBreakdown || allianceTeams.length === 0) {
        continue;
      }

      for (let stationIndex = 0; stationIndex < allianceTeams.length && stationIndex < ENDGAME_ROBOT_FIELDS.length; stationIndex += 1) {
        const teamKey = allianceTeams[stationIndex];
        if (!teamKey) {
          continue;
        }

        const teamNumber = Number.parseInt(teamKey.replace('frc', ''), 10);
        if (!Number.isFinite(teamNumber)) {
          continue;
        }

        summary.processedTeams += 1;

        const tbaField = ENDGAME_ROBOT_FIELDS[stationIndex];
        const autoTbaField = AUTO_ROBOT_FIELDS[stationIndex];
        if (!tbaField || !autoTbaField) {
          continue;
        }

        const parsedEndgameOutcome = parseTBAClimbOutcome(allianceBreakdown[tbaField]);
        const parsedAutoOutcome = parseTBAClimbOutcome(allianceBreakdown[autoTbaField]);

        if (!parsedEndgameOutcome && !parsedAutoOutcome) {
          summary.skippedNoTBAClimbData += 1;
          continue;
        }

        const entry = findScoutingEntry(entriesByKey, match.key, match.match_number, teamNumber, alliance);
        if (!entry) {
          summary.skippedMissingEntries += 1;
          continue;
        }

        const gameData = (entry.gameData ?? {}) as Record<string, unknown>;
        const currentCombined = extractCurrentCombinedClimbState(gameData);
        const expectedCombined: CombinedClimbState = {
          auto: parsedAutoOutcome ?? currentCombined.auto,
          endgame: parsedEndgameOutcome ?? currentCombined.endgame,
        };

        if (areCombinedClimbStatesEquivalent(currentCombined, expectedCombined)) {
          continue;
        }

        const updatedGameData = applyCombinedClimbStateToGameData(gameData, expectedCombined);

        if (parsedAutoOutcome && !arePhaseOutcomesEquivalent(currentCombined.auto, expectedCombined.auto)) {
          internalCandidates.push({
            entry,
            updatedGameData,
            matchKey: match.key,
            matchNumber: match.match_number,
            alliance,
            teamNumber,
            phase: 'auto',
            current: currentCombined.auto,
            expected: expectedCombined.auto,
          });

          candidates.push({
            phase: 'auto',
            matchKey: match.key,
            matchNumber: match.match_number,
            alliance,
            teamNumber,
            currentLevel: currentCombined.auto.level,
            currentFailed: currentCombined.auto.failed,
            tbaLevel: expectedCombined.auto.level,
            tbaFailed: expectedCombined.auto.failed,
          });
        }

        if (parsedEndgameOutcome && !arePhaseOutcomesEquivalent(currentCombined.endgame, expectedCombined.endgame)) {
          internalCandidates.push({
            entry,
            updatedGameData,
            matchKey: match.key,
            matchNumber: match.match_number,
            alliance,
            teamNumber,
            phase: 'endgame',
            current: currentCombined.endgame,
            expected: expectedCombined.endgame,
          });

          candidates.push({
            phase: 'endgame',
            matchKey: match.key,
            matchNumber: match.match_number,
            alliance,
            teamNumber,
            currentLevel: currentCombined.endgame.level,
            currentFailed: currentCombined.endgame.failed,
            tbaLevel: expectedCombined.endgame.level,
            tbaFailed: expectedCombined.endgame.failed,
          });
        }
      }
    }
  }

  summary.correctedEntries = candidates.length;

  return {
    summary,
    candidates,
    internalCandidates,
  };
}
