import { useEffect, useState, useMemo, type JSX } from "react";
import SelectTeamButton from "./GameStartSelectTeamButton";
import { Input } from "../ui/input";
import { loadScoutingEntriesByMatch } from "@/core/db/database";
/**
 * A component that renders a team selection interface.
 *
 * @param {string} defaultSelectTeam - The default selected team.
 * @param {function} setSelectTeam - Function to set the selected team.
 * @param {number} selectedMatch - The currently selected match number.
 * @param {string} selectedAlliance - The currently selected alliance.
 * @param {number} preferredTeamPosition - The preferred team position (1, 2, or 3) based on player station.
 * @return {JSX.Element} The rendered component.
 */
interface InitialSelectTeamProps {
  defaultSelectTeam: string;
  setSelectTeam: (team: string | null) => void;
  selectedMatch: string;
  selectedAlliance: string;
  selectedEventKey?: string;
  preferredTeamPosition?: number;
}

const InitialSelectTeam = ({
  defaultSelectTeam,
  setSelectTeam,
  selectedMatch,
  selectedAlliance,
  selectedEventKey,
  preferredTeamPosition = 0,
}: InitialSelectTeamProps): JSX.Element => {
  const baseTeams = useMemo(() => {
    try {
      const matchDataStr = localStorage.getItem("matchData");
      const matchData = matchDataStr ? JSON.parse(matchDataStr) : [];

      // Check if matchData is valid
      if (!Array.isArray(matchData) || matchData.length === 0) {
        return ["0001", "0002", "0003"];
      }

      // Get the correct match data
      let matchIndex = parseInt(selectedMatch) - 1;
      if (isNaN(matchIndex) || matchIndex < 0 || matchIndex >= matchData.length) {
        matchIndex = 0; // Default to first match if index is invalid
      }

      const currentMatch = matchData[matchIndex];

      // Convert alliance value to correct property name and get teams
      if (currentMatch && typeof currentMatch === 'object') {
        const allianceKey = selectedAlliance === "red" ? "redAlliance" :
          selectedAlliance === "blue" ? "blueAlliance" : "redAlliance";
        const teams = currentMatch[allianceKey];
        if (Array.isArray(teams) && teams.length > 0) {
          return teams;
        }
      }

      return ["0001", "0002", "0003"];
    } catch {
      return ["0001", "0002", "0003"];
    }
  }, [selectedMatch, selectedAlliance]);

  const [scoutedTeams, setScoutedTeams] = useState<string[]>([]);
  const hasPreferredRolePosition = preferredTeamPosition >= 1 && preferredTeamPosition <= 3;

  useEffect(() => {
    const loadScoutedTeamsForMatch = async () => {
      const matchNumber = parseInt(selectedMatch);
      if (!Number.isFinite(matchNumber) || matchNumber <= 0 || !selectedAlliance) {
        setScoutedTeams([]);
        return;
      }

      try {
        const activeEventKey = (selectedEventKey || localStorage.getItem("eventKey") || "").toLowerCase();
        const entries = await loadScoutingEntriesByMatch(matchNumber);

        const filteredEntries = entries.filter((entry) => {
          const entryAlliance = entry.allianceColor?.toLowerCase();
          const entryEvent = entry.eventKey?.toLowerCase();

          if (entryAlliance !== selectedAlliance.toLowerCase()) {
            return false;
          }

          if (!activeEventKey) {
            return true;
          }

          return entryEvent === activeEventKey;
        });

        const seen = new Set<string>();
        const teams: string[] = [];

        filteredEntries
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          .forEach((entry) => {
            const team = String(entry.teamNumber || "").trim();
            if (!team || seen.has(team)) {
              return;
            }
            seen.add(team);
            teams.push(team);
          });

        setScoutedTeams(teams.slice(0, 3));
      } catch {
        setScoutedTeams([]);
      }
    };

    void loadScoutedTeamsForMatch();
  }, [selectedMatch, selectedAlliance, selectedEventKey]);

  const effectiveTeams = useMemo(() => {
    if (!hasPreferredRolePosition) {
      return baseTeams;
    }

    if (scoutedTeams.length === 0) {
      return baseTeams;
    }

    const base = [...baseTeams];
    const extras = scoutedTeams.filter((team) => !base.includes(team));

    if (extras.length === 0) {
      return base;
    }

    const replacementOrder: number[] = [];
    if (preferredTeamPosition >= 1 && preferredTeamPosition <= 3) {
      replacementOrder.push(preferredTeamPosition - 1);
    }

    for (let i = 0; i < base.length; i++) {
      if (!replacementOrder.includes(i)) {
        replacementOrder.push(i);
      }
    }

    let extraIndex = 0;
    for (const replaceIndex of replacementOrder) {
      if (extraIndex >= extras.length) {
        break;
      }
      const currentTeam = base[replaceIndex];
      if (!scoutedTeams.includes(currentTeam)) {
        base[replaceIndex] = extras[extraIndex]!;
        extraIndex++;
      }
    }

    return base;
  }, [baseTeams, scoutedTeams, preferredTeamPosition, hasPreferredRolePosition]);

  const recentCustomTeam = useMemo(() => {
    return scoutedTeams.find((team) => !baseTeams.includes(team)) || "";
  }, [scoutedTeams, baseTeams]);

  // Helper function to determine if a team should be auto-selected based on position
  const getInitialTeamSelection = () => {
    // If there's already a defaultSelectTeam, use that
    if (defaultSelectTeam) {
      return {
        team1: defaultSelectTeam === baseTeams[0],
        team2: defaultSelectTeam === baseTeams[1],
        team3: defaultSelectTeam === baseTeams[2],
        custom: defaultSelectTeam !== baseTeams[0] &&
          defaultSelectTeam !== baseTeams[1] &&
          defaultSelectTeam !== baseTeams[2]
      };
    }

    // If there's a preferred team position, auto-select that team
    if (preferredTeamPosition >= 1 && preferredTeamPosition <= 3) {
      return {
        team1: preferredTeamPosition === 1,
        team2: preferredTeamPosition === 2,
        team3: preferredTeamPosition === 3,
        custom: false
      };
    }

    // Default - no selection
    return {
      team1: false,
      team2: false,
      team3: false,
      custom: false
    };
  };

  const initialSelection = getInitialTeamSelection();

  // States for the team selection
  const [team1Status, setTeam1Status] = useState(initialSelection.team1);
  const [team2Status, setTeam2Status] = useState(initialSelection.team2);
  const [team3Status, setTeam3Status] = useState(initialSelection.team3);
  const [customTeamStatus, setCustomTeamStatus] = useState(initialSelection.custom);

  // State for the custom team value
  const [customTeamValue, setCustomTeamValue] = useState(
    initialSelection.custom && defaultSelectTeam ? defaultSelectTeam : ""
  );

  // Sync customTeamValue with defaultSelectTeam prop changes (important for batch re-scout)
  useEffect(() => {
    if (defaultSelectTeam &&
      defaultSelectTeam !== effectiveTeams[0] &&
      defaultSelectTeam !== effectiveTeams[1] &&
      defaultSelectTeam !== effectiveTeams[2]) {
      setCustomTeamValue(defaultSelectTeam);
      setCustomTeamStatus(true);
      setTeam1Status(false);
      setTeam2Status(false);
      setTeam3Status(false);
    }
  }, [defaultSelectTeam, effectiveTeams]);

  useEffect(() => {
    if (hasPreferredRolePosition) return;
    if (defaultSelectTeam) return;
    if (!recentCustomTeam) return;
    if (customTeamValue) return;

    setCustomTeamValue(recentCustomTeam);
  }, [hasPreferredRolePosition, defaultSelectTeam, recentCustomTeam, customTeamValue]);

  // Function to handle team selection
  const clickTeam = (currentTeamType: string, currentTeamStatus: boolean) => {
    if (currentTeamType === "1") {
      setTeam1Status(!currentTeamStatus);

      setTeam2Status(false);
      setTeam3Status(false);
      setCustomTeamStatus(false);
    } else if (currentTeamType === "2") {
      setTeam2Status(!currentTeamStatus);

      setTeam1Status(false);
      setTeam3Status(false);
      setCustomTeamStatus(false);
    } else if (currentTeamType === "3") {
      setTeam3Status(!currentTeamStatus);

      setTeam1Status(false);
      setTeam2Status(false);
      setCustomTeamStatus(false);
    } else if (currentTeamType === "custom") {
      setCustomTeamStatus(true);

      setTeam1Status(false);
      setTeam2Status(false);
      setTeam3Status(false);
    }
  };

  // Effect to set the selected team
  useEffect(() => {
    if (team1Status) {
      setSelectTeam(effectiveTeams[0]);
    } else if (team2Status) {
      setSelectTeam(effectiveTeams[1]);
    } else if (team3Status) {
      setSelectTeam(effectiveTeams[2]);
    } else if (customTeamStatus && customTeamValue != "") {
      setSelectTeam(customTeamValue);
    } else {
      setSelectTeam(null);
    }
  }, [team1Status, team2Status, team3Status, customTeamStatus, customTeamValue, setSelectTeam, effectiveTeams]);

  // Effect to update team selection when baseTeams or preferredTeamPosition changes
  useEffect(() => {
    // Only auto-select if no current selection and we have a preferred position
    if (!team1Status && !team2Status && !team3Status && !customTeamStatus &&
      preferredTeamPosition >= 1 && preferredTeamPosition <= 3) {

      if (preferredTeamPosition === 1) {
        setTeam1Status(true);
      } else if (preferredTeamPosition === 2) {
        setTeam2Status(true);
      } else if (preferredTeamPosition === 3) {
        setTeam3Status(true);
      }
    }
  }, [effectiveTeams, preferredTeamPosition, team1Status, team2Status, team3Status, customTeamStatus]);

  const [textSelected, setTextSelected] = useState(false);

  return (
    <>
      {/* Container */}
      <div className="w-full h-full">
        {/* when the text is selected on mobile, when clicking off of typing user doesn't accidentally click on something else */}
        {textSelected &&
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
          ) && (
            <div className="absolute left-0 top-0 w-full h-full z-1"></div>
          )}
        {preferredTeamPosition > 0 && (
          <p className="text-sm text-muted-foreground pb-2">
            Your role suggests position {preferredTeamPosition}
          </p>
        )}
        {scoutedTeams.length > 0 && hasPreferredRolePosition && (
          <p className="text-sm text-amber-700 dark:text-amber-300 pb-2">
            Showing teams from existing scouting for this match/alliance.
          </p>
        )}
        {/* Selectors */}
        <div className="flex flex-col w-full h-full gap-4">
          <div className="grow">
            <SelectTeamButton
              currentTeamType={"1"}
              currentTeamStatus={team1Status}
              clickTeam={clickTeam}
              teamName={effectiveTeams[0]}
              isPreferred={preferredTeamPosition === 1}
            />
          </div>
          <div className="grow">
            <SelectTeamButton
              currentTeamType={"2"}
              currentTeamStatus={team2Status}
              clickTeam={clickTeam}
              teamName={effectiveTeams[1]}
              isPreferred={preferredTeamPosition === 2}
            />
          </div>
          <div className="grow">
            <SelectTeamButton
              currentTeamType={"3"}
              currentTeamStatus={team3Status}
              clickTeam={clickTeam}
              teamName={effectiveTeams[2]}
              isPreferred={preferredTeamPosition === 3}
            />
          </div>
          {/* Custom Team Selector */}
          <div className="flex justify-center z-2 items-center">
            <h2 className="text-2xl font-semibold grow mr-2 pb-2">
              Custom:
            </h2>
            <Input
              className="w-full h-12 text-xl rounded-lg"
              type="number"
              inputMode="numeric"
              placeholder="Team #"
              value={customTeamValue}
              onChange={(e) => setCustomTeamValue(e.target.value)}
              onFocus={() => {
                clickTeam("custom", customTeamStatus);
                setTextSelected(true);
              }}
              onBlur={() => setTextSelected(false)}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default InitialSelectTeam;
