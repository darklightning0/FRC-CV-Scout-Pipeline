/**
 * Match Strategy Page - Year-Agnostic
 * 
 * Main page for match strategy planning with:
 * - Field drawing on 3 phases (Autonomous, Teleop, Endgame)
 * - Team selection (6 teams: 3 red, 3 blue)
 * - Team stats display (config-driven via match-strategy-config.ts)
 * - Match number lookup
 * - Alliance selection
 * 
 * Year-agnostic design using:
 * - Centralized calculations (useAllTeamStats)
 * - Configurable field image (via props)
 * - Config-driven stats display (via props)
 */

import { useEffect, useMemo, useState } from "react";
import { MatchHeader } from "@/core/components/MatchStrategy/MatchHeader";
import { FieldStrategy } from "@/core/components/MatchStrategy/FieldStrategy";
import { TeamAnalysis } from "@/core/components/MatchStrategy/TeamAnalysis";
import { clearAllStrategies, saveAllStrategyCanvases } from "@/core/lib/strategyCanvasUtils";
import { useMatchStrategy } from "@/core/hooks/useMatchStrategy";
import { useMatchCvTelemetry } from "@/core/hooks/useMatchCvTelemetry";
import { matchStrategyDisplayModes, type MatchStrategyDisplayMode } from "@/game-template/match-strategy-config";
import { MatchStrategyCvPanel } from "@/core/components/cv-telemetry/MatchStrategyCvPanel";
import type { CvOverlayTrail } from "@/core/lib/canvasUtils";
import defaultFieldImage from "@/game-template/assets/2026-field.png";

// ============================================================================
// PROPS & CONFIGURATION
// ============================================================================

interface MatchStrategyPageProps {
    /**
     * Optional: Field image to use for strategy drawing
     * Defaults to 2026-field.png
     */
    fieldImage?: string;
}

interface TeamSlotSpotVisibility {
    showShooting: boolean;
    showPassing: boolean;
}

const MATCH_STRATEGY_DISPLAY_MODE_STORAGE_KEY = 'matchStrategyDisplayMode';

function getInitialDisplayMode(): MatchStrategyDisplayMode {
    const storedMode = localStorage.getItem(MATCH_STRATEGY_DISPLAY_MODE_STORAGE_KEY);

    if (storedMode && matchStrategyDisplayModes.some((mode) => mode.id === storedMode)) {
        return storedMode as MatchStrategyDisplayMode;
    }

    return 'scouted';
}

// ============================================================================
// COMPONENT
// ============================================================================

const MatchStrategyPage = (props: MatchStrategyPageProps) => {
    const fieldImage = props.fieldImage ?? defaultFieldImage;
    
    const [activeTab, setActiveTab] = useState("autonomous");
    const [activeStatsTab, setActiveStatsTab] = useState("overall");
    const [preferredDisplayMode, setPreferredDisplayMode] = useState<MatchStrategyDisplayMode>(getInitialDisplayMode);
    const [displayMode, setDisplayMode] = useState<MatchStrategyDisplayMode>(preferredDisplayMode);
    const [teamSlotSpotVisibility, setTeamSlotSpotVisibility] = useState<TeamSlotSpotVisibility[]>(
        Array.from({ length: 6 }, () => ({ showShooting: true, showPassing: true }))
    );

    const {
        selectedTeams,
        availableTeams,
        availableEvents,
        selectedEvent,
        selectedAutoPathEvents,
        matchNumber,
        isLookingUpMatch,
        confirmedAlliances,
        selectedBlueAlliance,
        selectedRedAlliance,
        availableDisplayModes,
        isDisplayModeLoading,
        getTeamStats,
        getTeamSpots,
        getTeamAutoRoutines,
        getSelectedAutoRoutineForSlot,
        getSelectedAutoRoutineSelectionForSlot,
        setSelectedAutoRoutineForSlot,
        addReportedAutoForTeam,
        updateReportedAutoForTeam,
        deleteReportedAutoForTeam,
        handleTeamChange,
        applyAllianceToRed,
        applyAllianceToBlue,
        setSelectedEvent,
        setSelectedAutoPathEvents,
        setMatchNumber
    } = useMatchStrategy();

    useEffect(() => {
        if (isDisplayModeLoading) {
            return;
        }

        if (availableDisplayModes.length === 0) {
            return;
        }

        if (availableDisplayModes.includes(preferredDisplayMode)) {
            if (displayMode !== preferredDisplayMode) {
                setDisplayMode(preferredDisplayMode);
            }
            return;
        }

        if (!availableDisplayModes.includes(displayMode)) {
            const nextMode = availableDisplayModes[0];
            if (nextMode) {
                setDisplayMode(nextMode);
            }
        }
    }, [availableDisplayModes, displayMode, preferredDisplayMode, isDisplayModeLoading]);

    useEffect(() => {
        localStorage.setItem(MATCH_STRATEGY_DISPLAY_MODE_STORAGE_KEY, preferredDisplayMode);
    }, [preferredDisplayMode]);

    const handleDisplayModeChange = (value: MatchStrategyDisplayMode) => {
        setPreferredDisplayMode(value);
        setDisplayMode(value);
    };

    const selectedAutoRoutinesBySlot = useMemo(
        () => Array.from({ length: 6 }, (_, slotIndex) => getSelectedAutoRoutineForSlot(slotIndex)),
        [getSelectedAutoRoutineForSlot]
    );

    const [showCvTrails, setShowCvTrails] = useState(true);
    const { entries: cvEntries } = useMatchCvTelemetry(selectedEvent, matchNumber, selectedTeams);
    const cvTrailLayers = useMemo((): CvOverlayTrail[] => {
        const blueColors = ['#38bdf8', '#22d3ee', '#67e8f9'];
        const redColors = ['#f87171', '#fb7185', '#f43f5e'];
        let bi = 0;
        let ri = 0;
        return cvEntries.map((e) => {
            const isBlue = e.alliance === 'blue';
            const color = isBlue
                ? blueColors[bi++ % blueColors.length]!
                : redColors[ri++ % redColors.length]!;
            const stagePoints =
                activeTab === 'teleop'
                    ? e.teleopPath && e.teleopPath.length > 0
                        ? e.teleopPath
                        : e.matchPath ?? e.autoPath
                    : activeTab === 'endgame'
                      ? e.endgamePath && e.endgamePath.length > 0
                          ? e.endgamePath
                          : e.matchPath ?? e.autoPath
                      : e.autoPath.length > 0
                        ? e.autoPath
                        : e.matchPath ?? [];
            return {
                id: `cv-${e.teamNumber}`,
                color,
                points: stagePoints,
                lineWidth: 2.4,
                alpha: 0.8,
            };
        });
    }, [cvEntries, activeTab]);

    const handleTeamChangeWithSpotDefaults = (index: number, teamNumber: number | null) => {
        handleTeamChange(index, teamNumber);
        setTeamSlotSpotVisibility((prev) => {
            const next = [...prev];
            next[index] = { showShooting: true, showPassing: true };
            return next;
        });
    };

    const handleTeamSlotSpotToggle = (index: number, type: 'shooting' | 'passing') => {
        setTeamSlotSpotVisibility((prev) => {
            const next = [...prev];
            const current = next[index] ?? { showShooting: true, showPassing: true };

            next[index] = {
                ...current,
                showShooting: type === 'shooting' ? !current.showShooting : current.showShooting,
                showPassing: type === 'passing' ? !current.showPassing : current.showPassing,
            };

            return next;
        });
    };

    const handleSetAllSpotVisibility = (type: 'shooting' | 'passing', enabled: boolean) => {
        setTeamSlotSpotVisibility((prev) => {
            const next = [...prev];

            selectedTeams.forEach((teamNumber, index) => {
                if (!teamNumber) return;

                const current = next[index] ?? { showShooting: true, showPassing: true };
                next[index] = {
                    ...current,
                    showShooting: type === 'shooting' ? enabled : current.showShooting,
                    showPassing: type === 'passing' ? enabled : current.showPassing,
                };
            });

            return next;
        });
    };

    const handleClearAll = () => clearAllStrategies(setActiveTab, activeTab);
    const handleSaveAll = () => saveAllStrategyCanvases(matchNumber, selectedTeams, fieldImage, {
        teamSlotSpotVisibility,
        getTeamSpots,
        selectedAutoRoutinesBySlot,
    });

    return (
        <div className="min-h-screen w-full flex flex-col items-center px-4 pt-12 pb-24">
            <div className="w-full max-w-7xl">
                <h1 className="text-2xl font-bold">Match Strategy</h1>
            </div>
            <div className="flex flex-col items-center gap-4 max-w-7xl w-full">
                <MatchHeader
                    selectedEvent={selectedEvent}
                    selectedAutoPathEvents={selectedAutoPathEvents}
                    availableEvents={availableEvents}
                    matchNumber={matchNumber}
                    isLookingUpMatch={isLookingUpMatch}
                    displayMode={displayMode}
                    availableDisplayModes={availableDisplayModes}
                    onEventChange={setSelectedEvent}
                    onAutoPathEventsChange={setSelectedAutoPathEvents}
                    onMatchNumberChange={setMatchNumber}
                    onDisplayModeChange={handleDisplayModeChange}
                    onClearAll={handleClearAll}
                    onSaveAll={handleSaveAll}
                />

                <div className="flex flex-col gap-8 w-full pb-6">
                    <FieldStrategy
                        fieldImagePath={fieldImage}
                        activeTab={activeTab}
                        selectedTeams={selectedTeams}
                        teamSlotSpotVisibility={teamSlotSpotVisibility}
                        getTeamSpots={getTeamSpots}
                        selectedAutoRoutinesBySlot={selectedAutoRoutinesBySlot}
                        cvTrailLayers={cvTrailLayers}
                        showCvTrails={showCvTrails}
                        onShowCvTrailsChange={setShowCvTrails}
                        onTabChange={setActiveTab}
                    />

                    <MatchStrategyCvPanel
                        eventKey={selectedEvent}
                        matchNumber={matchNumber}
                        selectedTeams={selectedTeams}
                        className="w-full"
                    />

                    <TeamAnalysis
                        selectedTeams={selectedTeams}
                        availableTeams={availableTeams}
                        activeStatsTab={activeStatsTab}
                        displayMode={displayMode}
                        confirmedAlliances={confirmedAlliances}
                        selectedBlueAlliance={selectedBlueAlliance}
                        selectedRedAlliance={selectedRedAlliance}
                        getTeamStats={getTeamStats}
                        teamSlotSpotVisibility={teamSlotSpotVisibility}
                        onTeamSlotSpotToggle={handleTeamSlotSpotToggle}
                        onSetAllSpotVisibility={handleSetAllSpotVisibility}
                        onTeamChange={handleTeamChangeWithSpotDefaults}
                        getTeamAutoRoutines={getTeamAutoRoutines}
                        getSelectedAutoRoutineForSlot={getSelectedAutoRoutineForSlot}
                        getSelectedAutoRoutineSelectionForSlot={getSelectedAutoRoutineSelectionForSlot}
                        onSelectAutoRoutineForSlot={setSelectedAutoRoutineForSlot}
                        onAddReportedAutoForTeam={addReportedAutoForTeam}
                        onUpdateReportedAutoForTeam={updateReportedAutoForTeam}
                        onDeleteReportedAutoForTeam={deleteReportedAutoForTeam}
                        onStatsTabChange={setActiveStatsTab}
                        onBlueAllianceChange={applyAllianceToBlue}
                        onRedAllianceChange={applyAllianceToRed}
                    />
                </div>
            </div>
        </div>
    );
};

export default MatchStrategyPage;
