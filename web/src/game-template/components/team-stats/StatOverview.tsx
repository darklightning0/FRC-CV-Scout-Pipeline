import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { StatCard } from "@/core/components/team-stats/StatCard";
import type { TeamStats } from "@/core/types/team-stats";
import type { StatSectionDefinition, RateSectionDefinition } from "@/types/team-stats-display";

interface StatOverviewProps {
    teamStats: TeamStats;
    compareStats: TeamStats | null;
    statSections: StatSectionDefinition[];
    rateSections: RateSectionDefinition[];
    setActiveTab: (tab: string) => void;
}

export function StatOverview({
    teamStats,
    compareStats,
    statSections,
    rateSections: _rateSections,
    setActiveTab
}: StatOverviewProps) {
    const hasCoprData = [
        teamStats.coprHubAutoPoints,
        teamStats.coprHubTeleopPoints,
        teamStats.coprAutoTowerPoints,
        teamStats.coprEndgameTowerPoints,
    ].some(value => typeof value === 'number');

    const hasStatboticsData = [
        teamStats.statboticsTotalPoints,
        teamStats.statboticsAutoPoints,
        teamStats.statboticsTeleopPoints,
        teamStats.statboticsEndgamePoints,
        teamStats.statboticsTotalFuel,
        teamStats.statboticsTotalTower,
    ].some(value => typeof value === 'number');

    const hasExternalApiData = hasCoprData || hasStatboticsData;
    const tbaPlayed = teamStats.tbaMatchesPlayed ?? 0;

    if (teamStats.matchesPlayed === 0 && !hasExternalApiData && tbaPlayed === 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                    <div className="text-center space-y-3">
                        <h3 className="text-lg font-semibold">No Match Scouting Data</h3>
                        <p className="text-muted-foreground">
                            This team doesn't have any match scouting data.
                        </p>
                        <Button onClick={() => setActiveTab("pit")} className="mt-4 p-4">
                            View Pit Data →
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (teamStats.matchesPlayed === 0 && !hasExternalApiData && tbaPlayed > 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                    <div className="text-center space-y-3">
                        <h3 className="text-lg font-semibold">Played on TBA · not scouted</h3>
                        <p className="text-muted-foreground">
                            TBA shows {tbaPlayed} completed match{tbaPlayed === 1 ? '' : 'es'} for this team,
                            but there are no local scout entries yet. Open Match Strategy for TBA scores,
                            or scout matches for team-level breakdowns.
                        </p>
                        <Button onClick={() => setActiveTab("pit")} className="mt-4 p-4">
                            View Pit Data →
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const sections = statSections.filter(s => s.tab === 'overview');

    const getStatValue = (stats: TeamStats, key: string): string | number => {
        const value = (stats as Record<string, unknown>)[key];
        if (typeof value === 'string') return value;
        return typeof value === 'number' ? value : 0;
    };

    return (
        <div className="space-y-6 pb-6">
            {teamStats.matchesPlayed === 0 && (hasExternalApiData || tbaPlayed > 0) && (
                <Card>
                    <CardContent className="py-4 text-sm text-muted-foreground">
                        {tbaPlayed > 0
                            ? `TBA shows ${tbaPlayed} completed match${tbaPlayed === 1 ? '' : 'es'}; no local scout entries yet.`
                            : 'No local match scouting entries for this team yet.'}
                        {hasExternalApiData ? ' Showing external metrics from TBA COPR and/or Statbotics EPA.' : ''}
                    </CardContent>
                </Card>
            )}
            {sections.map(section => (
                <Card key={section.id}>
                    <CardHeader>
                        <CardTitle>{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`grid grid-cols-2 md:grid-cols-${section.columns || 2} gap-4`}>
                            {section.stats.map(stat => (
                                <StatCard
                                    key={stat.key}
                                    title={stat.label}
                                    value={getStatValue(teamStats, stat.key)}
                                    subtitle={stat.subtitle}
                                    color={stat.color}
                                    type={stat.type}
                                    compareValue={compareStats ? getStatValue(compareStats, stat.key) : undefined}
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
