import { toast } from 'sonner';
import type { UploadMode } from './scoutingDataUploadHandler';
import {
  adaptAiScoutBundle,
  isAiScoutBundle,
} from '@/core/lib/cvTelemetryAdapter';
import {
  clearCvMatchTelemetry,
  importCvMatchTelemetryEntries,
} from '@/core/db/database';

/**
 * Import RobotDetector AI scout bundle into Dexie (cvMatchTelemetry).
 * Does NOT touch human scouting paths.
 */
export const handleAiScoutBundleUpload = async (
  jsonData: unknown,
  mode: UploadMode
): Promise<void> => {
  if (!isAiScoutBundle(jsonData)) {
    toast.error('Invalid AI scout bundle — expected teams_telemetry.');
    return;
  }

  const entries = adaptAiScoutBundle(jsonData);
  if (entries.length === 0) {
    toast.error('AI scout bundle contained no team telemetry.');
    return;
  }

  if (mode === 'overwrite') {
    await clearCvMatchTelemetry();
  }

  const result = await importCvMatchTelemetryEntries(entries, mode === 'overwrite' ? 'overwrite' : 'upsert');

  toast.success(
    `🤖 CV telemetry imported: ${result.importedCount} team(s)` +
      (result.updatedCount ? ` (${result.updatedCount} updated)` : '') +
      ` — match ${entries[0]?.matchKey ?? ''}`
  );
  window.dispatchEvent(new CustomEvent('cv-telemetry-imported'));
};
