import type { ScoutOptionsState } from "@/types";

export const SCOUT_OPTIONS_STORAGE_KEY = "scoutOptions";

export const GAME_SCOUT_OPTION_KEYS = {
  disableHubFuelScoringPopup: "disableHubFuelScoringPopup",
  disablePassingPopup: "disablePassingPopup",
  disableDefensePopup: "disableDefensePopup",
  disableAutoPathDrawingTapOnly: "disableAutoPathDrawingTapOnly",
  disableTeleopPathDrawingTapOnly: "disableTeleopPathDrawingTapOnly",
} as const;

const LEGACY_SCOUT_OPTION_KEYS = {
  disablePathDrawingTapOnly: "disablePathDrawingTapOnly",
} as const;

export const GAME_SCOUT_OPTION_DEFAULTS: ScoutOptionsState = {
  [GAME_SCOUT_OPTION_KEYS.disableHubFuelScoringPopup]: false,
  [GAME_SCOUT_OPTION_KEYS.disablePassingPopup]: false,
  [GAME_SCOUT_OPTION_KEYS.disableDefensePopup]: false,
  [GAME_SCOUT_OPTION_KEYS.disableAutoPathDrawingTapOnly]: false,
  [GAME_SCOUT_OPTION_KEYS.disableTeleopPathDrawingTapOnly]: false,
};

function coerceScoutOptions(value: unknown): ScoutOptionsState {
  if (!value || typeof value !== "object") return {};

  const result: ScoutOptionsState = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "boolean") {
      result[key] = raw;
    }
  }

  return result;
}

export function readStoredScoutOptions(): ScoutOptionsState {
  const stored = localStorage.getItem(SCOUT_OPTIONS_STORAGE_KEY);
  if (!stored) return {};

  try {
    return coerceScoutOptions(JSON.parse(stored));
  } catch {
    return {};
  }
}

export function getEffectiveScoutOptions(inputOptions?: unknown): ScoutOptionsState {
  const coercedInput = coerceScoutOptions(inputOptions);
  const stored = readStoredScoutOptions();

  const legacyDisablePaths =
    stored[LEGACY_SCOUT_OPTION_KEYS.disablePathDrawingTapOnly] === true ||
    coercedInput[LEGACY_SCOUT_OPTION_KEYS.disablePathDrawingTapOnly] === true;

  return {
    ...GAME_SCOUT_OPTION_DEFAULTS,
    ...(legacyDisablePaths
      ? {
          [GAME_SCOUT_OPTION_KEYS.disableAutoPathDrawingTapOnly]: true,
          [GAME_SCOUT_OPTION_KEYS.disableTeleopPathDrawingTapOnly]: true,
        }
      : {}),
    ...stored,
    ...coercedInput,
  };
}

export function isScoutOptionEnabled(options: ScoutOptionsState, key: string): boolean {
  return options[key] !== false;
}
