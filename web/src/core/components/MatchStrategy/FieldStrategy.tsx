/**
 * Field Strategy Component
 *
 * Wrapper for FieldCanvas with phase tabs (Autonomous, Teleop, Endgame).
 * Needs fieldImagePath prop to be passed through to FieldCanvas.
 */

import { Card, CardContent } from "@/core/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/animate-ui/radix/tabs";
import FieldCanvas from "./FieldCanvas";
import type { StrategyAutoRoutine, StrategyStageId, TeamStageSpots } from "@/core/hooks/useMatchStrategy";
import type { CvOverlayTrail } from "@/core/lib/canvasUtils";

interface TeamSlotSpotVisibility {
    showShooting: boolean;
    showPassing: boolean;
}

interface FieldStrategyProps {
    fieldImagePath: string;
    activeTab: string;
    selectedTeams?: (number | null)[];
    teamSlotSpotVisibility?: TeamSlotSpotVisibility[];
    getTeamSpots?: (teamNumber: number | null, stageId: StrategyStageId) => TeamStageSpots;
    selectedAutoRoutinesBySlot?: (StrategyAutoRoutine | null)[];
    cvTrailLayers?: CvOverlayTrail[];
    showCvTrails?: boolean;
    onShowCvTrailsChange?: (show: boolean) => void;
    onTabChange: (value: string) => void;
}

export const FieldStrategy = ({
    fieldImagePath,
    activeTab,
    selectedTeams = [],
    teamSlotSpotVisibility = [],
    getTeamSpots,
    selectedAutoRoutinesBySlot = [],
    cvTrailLayers = [],
    showCvTrails = false,
    onShowCvTrailsChange,
    onTabChange
}: FieldStrategyProps) => {
    return (
        <Card className="w-full py-0">
            <CardContent className="p-4 h-125">
                <Tabs value={activeTab} onValueChange={onTabChange} className="w-full h-full flex flex-col" enableSwipe={true}>
                    <TabsList className="grid w-full grid-cols-3 mb-4 shrink-0">
                        <TabsTrigger value="autonomous">Autonomous</TabsTrigger>
                        <TabsTrigger value="teleop">Teleop</TabsTrigger>
                        <TabsTrigger value="endgame">Endgame</TabsTrigger>
                    </TabsList>

                    <div className="flex-1 flex flex-col shrink-0" data-stage={activeTab}>
                        <TabsContent value="autonomous" className="h-full mt-0" data-stage="autonomous">
                            <FieldCanvas
                                key="autonomous"
                                fieldImagePath={fieldImagePath}
                                stageId="autonomous"
                                selectedTeams={selectedTeams}
                                teamSlotSpotVisibility={teamSlotSpotVisibility}
                                getTeamSpots={getTeamSpots}
                                selectedAutoRoutinesBySlot={selectedAutoRoutinesBySlot}
                                cvTrailLayers={cvTrailLayers}
                                showCvTrails={showCvTrails}
                                onShowCvTrailsChange={onShowCvTrailsChange}
                                onStageChange={onTabChange}
                            />
                        </TabsContent>

                        <TabsContent value="teleop" className="h-full mt-0" data-stage="teleop">
                            <FieldCanvas
                                key="teleop"
                                fieldImagePath={fieldImagePath}
                                stageId="teleop"
                                selectedTeams={selectedTeams}
                                teamSlotSpotVisibility={teamSlotSpotVisibility}
                                getTeamSpots={getTeamSpots}
                                selectedAutoRoutinesBySlot={selectedAutoRoutinesBySlot}
                                cvTrailLayers={cvTrailLayers}
                                showCvTrails={showCvTrails}
                                onShowCvTrailsChange={onShowCvTrailsChange}
                                onStageChange={onTabChange}
                            />
                        </TabsContent>

                        <TabsContent value="endgame" className="h-full mt-0" data-stage="endgame">
                            <FieldCanvas
                                key="endgame"
                                fieldImagePath={fieldImagePath}
                                stageId="endgame"
                                selectedTeams={selectedTeams}
                                teamSlotSpotVisibility={teamSlotSpotVisibility}
                                getTeamSpots={getTeamSpots}
                                selectedAutoRoutinesBySlot={selectedAutoRoutinesBySlot}
                                cvTrailLayers={cvTrailLayers}
                                showCvTrails={showCvTrails}
                                onShowCvTrailsChange={onShowCvTrailsChange}
                                onStageChange={onTabChange}
                            />
                        </TabsContent>
                    </div>
                </Tabs>
            </CardContent>
        </Card>
    );
};
