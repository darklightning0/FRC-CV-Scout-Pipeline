import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { StatCard } from "@/core/components/team-stats/StatCard";
import type { TeamStats } from "@/core/types/team-stats";
import type { StartPositionConfig } from "@/types/team-stats-display";
import type { MatchResult } from "@/game-template/analysis";
import { AutoStartPositionMap } from "./AutoStartPositionMap";
import { AutoPathsByPosition } from "./AutoPathsByPosition";

interface AutoAnalysisProps {
    teamStats: TeamStats;
    compareStats: TeamStats | null;
    startPositionConfig: StartPositionConfig;
    showStartPositionMap?: boolean;
}

function normalizeStartPositions(
    topLevelStartPositions: Record<string, number> | undefined,
    autoStartPositions: Array<{ position: string; percentage: number }> | undefined,
    positionLabels: string[] | undefined,
): Record<string, number> {
    if (topLevelStartPositions && Object.keys(topLevelStartPositions).length > 0) {
        return topLevelStartPositions;
    }

    const labelToIndex = new Map<string, number>();
    (positionLabels ?? []).forEach((label, index) => {
        labelToIndex.set(label.toLowerCase(), index);
    });

    return (autoStartPositions ?? []).reduce<Record<string, number>>((acc, pos) => {
        const label = String(pos.position);
        const numericMatch = label.match(/\d+/);

        if (numericMatch) {
            acc[`position${numericMatch[0]}`] = pos.percentage;
            return acc;
        }

        const indexFromLabel = labelToIndex.get(label.toLowerCase());
        if (indexFromLabel !== undefined) {
            acc[`position${indexFromLabel}`] = pos.percentage;
        }

        return acc;
    }, {});
}

export function AutoAnalysis({
    teamStats,
    compareStats,
    startPositionConfig,
    showStartPositionMap = true,
}: AutoAnalysisProps) {
    if (teamStats.matchesPlayed === 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                    <p className="text-muted-foreground">No autonomous data available</p>
                </CardContent>
            </Card>
        );
    }

    // Extract start positions and match results from teamStats
    const topLevelStartPositions = (teamStats as TeamStats & { startPositions?: Record<string, number> })?.startPositions;
    const autoStartPositions = teamStats.auto?.startPositions;
    const startPositions = normalizeStartPositions(
        topLevelStartPositions,
        autoStartPositions,
        startPositionConfig.positionLabels,
    );
    const matchResults = (teamStats as TeamStats & { matchResults?: MatchResult[] })?.matchResults ?? [];
    const compareTopLevelStartPositions = (compareStats as TeamStats & { startPositions?: Record<string, number> } | null)?.startPositions;
    const compareAutoStartPositions = compareStats?.auto?.startPositions;
    const compareStartPositions = normalizeStartPositions(
        compareTopLevelStartPositions,
        compareAutoStartPositions,
        startPositionConfig.positionLabels,
    );

    const renderStartPositions = () => {
        if (!startPositions || Object.keys(startPositions).length === 0) {
            return <p className="text-muted-foreground text-center py-4">No position data available</p>;
        }

        return (
            <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: startPositionConfig.positionCount }).map((_, index) => {
                    const label = startPositionConfig.positionLabels?.[index] || `Position ${index}`;
                    const color = startPositionConfig.positionColors?.[index] || 'blue';
                    const value = startPositions[`position${index}`] || 0;
                    const compareValue = compareStartPositions[`position${index}`];
                    const positionMatches = matchResults.filter((match) => match.startPosition === index);
                    const avgAutoPoints = positionMatches.length > 0
                        ? Math.round((positionMatches.reduce((sum, match) => sum + match.autoPoints, 0) / positionMatches.length) * 10) / 10
                        : 0;

                    return (
                        <div key={index} className="space-y-2">
                            <StatCard
                                title={label}
                                value={value}
                                subtitle="% of matches"
                                color={color as 'default' | 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'yellow'}
                                compareValue={compareValue}
                            />
                            <div className="px-1 text-xs text-muted-foreground flex items-center justify-between">
                                <span>{positionMatches.length} matches</span>
                                <span>{avgAutoPoints} avg auto pts</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-6">
            <div className={`grid grid-cols-1 ${showStartPositionMap ? 'lg:grid-cols-2' : ''} gap-6`}>
                {showStartPositionMap ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Starting Position Analysis</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <AutoStartPositionMap
                                startPositions={startPositions}
                                matchResults={matchResults}
                                config={startPositionConfig}
                            />
                        </CardContent>
                    </Card>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>Position Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {renderStartPositions()}
                    </CardContent>
                </Card>
            </div>

            {/* Auto Paths by Starting Position */}
            <Card>
                <CardHeader>
                    <CardTitle>Auto Paths by Starting Position</CardTitle>
                </CardHeader>
                <CardContent>
                    <AutoPathsByPosition
                        matchResults={matchResults}
                        alliance="blue"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
