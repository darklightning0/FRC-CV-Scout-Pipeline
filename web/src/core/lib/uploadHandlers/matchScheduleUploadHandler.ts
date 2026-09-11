import { toast } from "sonner";
import type { UploadMode } from "./scoutingDataUploadHandler";
import { isMatchSchedulePayload } from "@/core/lib/matchScheduleTransfer";
import { setCurrentEvent } from "@/core/lib/tba/eventDataUtils";

const addEventToList = (storageKey: string, eventKey: string) => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];

    if (!list.includes(eventKey)) {
      list.push(eventKey);
      list.sort();
      localStorage.setItem(storageKey, JSON.stringify(list));
    }
  } catch {
    localStorage.setItem(storageKey, JSON.stringify([eventKey]));
  }
};

const getStationInfo = (): { alliance: 'red' | 'blue' | ''; position: 1 | 2 | 3 | 0 } => {
  const playerStation = localStorage.getItem('playerStation');
  if (!playerStation || playerStation === 'lead') {
    return { alliance: '', position: 0 };
  }

  const parts = playerStation.split('-');
  if (parts.length !== 2) {
    return { alliance: '', position: 0 };
  }

  const alliance = parts[0] === 'red' || parts[0] === 'blue' ? parts[0] : '';
  const parsedPosition = Number.parseInt(parts[1] || '', 10);
  const position = parsedPosition >= 1 && parsedPosition <= 3 ? (parsedPosition as 1 | 2 | 3) : 0;

  return { alliance, position };
};

export const handleMatchScheduleUpload = async (jsonData: unknown, mode: UploadMode): Promise<void> => {
  void mode;

  if (!isMatchSchedulePayload(jsonData)) {
    toast.error("Invalid match schedule file. Please upload a file downloaded from Match Schedule JSON export.");
    return;
  }

  try {
    const sortedMatches = [...jsonData.matches].sort((a, b) => a.matchNum - b.matchNum);
    localStorage.setItem('matchData', JSON.stringify(sortedMatches));

    localStorage.setItem('eventKey', jsonData.eventKey);
    setCurrentEvent(jsonData.eventKey);

    addEventToList('eventsList', jsonData.eventKey);

    const firstMatch = sortedMatches[0];
    if (firstMatch) {
      localStorage.setItem('currentMatchNumber', String(firstMatch.matchNum));

      const station = getStationInfo();
      if (station.alliance) {
        localStorage.setItem('alliance', station.alliance);

        const allianceTeams = station.alliance === 'red' ? firstMatch.redAlliance : firstMatch.blueAlliance;
        const stationTeam = station.position > 0 ? allianceTeams[station.position - 1] : undefined;
        if (typeof stationTeam === 'string' && stationTeam.length > 0) {
          localStorage.setItem('selectTeam', stationTeam);
        }
      }
    }

    toast.success(`Match schedule replaced with ${sortedMatches.length} matches`);
  } catch (error) {
    console.error('Error importing match schedule:', error);
    toast.error("Failed to import match schedule");
  }
};