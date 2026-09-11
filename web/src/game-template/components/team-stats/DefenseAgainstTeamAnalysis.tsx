import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/core/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/animate-ui/radix/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/core/components/ui/table";
import { loadAllScoutingEntries } from "@/core/db/database";
import type { ScoutingEntryBase } from "@/core/types/scouting-entry";

type DefenseEffectiveness = "very" | "somewhat" | "not";

interface DefenseAgainstTeamAnalysisProps {
    teamNumber: string;
    selectedEvent?: string;
}

interface DefenseSummaryRow {
    team: number;
    attempts: number;
    matchCount: number;
    very: number;
    somewhat: number;
    not: number;
    unknown: number;
    effectivenessScore: number;
}

interface AggregatedDefenseStats {
    attempts: number;
    matches: Set<string>;
    very: number;
    somewhat: number;
    not: number;
    unknown: number;
}

function mapAndSortRows(source: Map<number, AggregatedDefenseStats>): DefenseSummaryRow[] {
    return Array.from(source.entries())
        .map(([team, summary]) => {
            const weighted = (summary.very * 2) + summary.somewhat;
            const effectivenessScore = summary.attempts > 0
                ? Math.round((weighted / (summary.attempts * 2)) * 100)
                : 0;

            return {
                team,
                attempts: summary.attempts,
                matchCount: summary.matches.size,
                very: summary.very,
                somewhat: summary.somewhat,
                not: summary.not,
                unknown: summary.unknown,
                effectivenessScore,
            };
        })
        .sort((a, b) => {
            if (b.effectivenessScore !== a.effectivenessScore) {
                return b.effectivenessScore - a.effectivenessScore;
            }
            if (b.attempts !== a.attempts) {
                return b.attempts - a.attempts;
            }
            return a.team - b.team;
        });
}

export function DefenseAgainstTeamAnalysis({ teamNumber, selectedEvent }: DefenseAgainstTeamAnalysisProps) {
    const [defendedByRows, setDefendedByRows] = useState<DefenseSummaryRow[]>([]);
    const [defendedTeamsRows, setDefendedTeamsRows] = useState<DefenseSummaryRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            const targetTeam = Number.parseInt(teamNumber, 10);
            if (!Number.isFinite(targetTeam) || targetTeam <= 0) {
                setDefendedByRows([]);
                setDefendedTeamsRows([]);
                return;
            }

            setIsLoading(true);
            try {
                const entries = await loadAllScoutingEntries();
                const eventFilter = selectedEvent && selectedEvent !== "all" ? selectedEvent.toLowerCase() : null;

                const byDefender = new Map<number, AggregatedDefenseStats>();
                const byDefendedTeam = new Map<number, AggregatedDefenseStats>();

                entries.forEach((entry: ScoutingEntryBase<Record<string, unknown>>) => {
                    if (eventFilter && (entry.eventKey || "").toLowerCase() !== eventFilter) {
                        return;
                    }

                    const defenderTeam = Number(entry.teamNumber);
                    if (!Number.isFinite(defenderTeam) || defenderTeam <= 0) {
                        return;
                    }

                    const teleop = (entry.gameData as Record<string, unknown> | undefined)?.teleop as Record<string, unknown> | undefined;
                    const teleopPath = teleop?.teleopPath;
                    if (!Array.isArray(teleopPath)) return;

                    teleopPath.forEach((waypoint) => {
                        if (!waypoint || typeof waypoint !== "object") return;
                        const waypointRecord = waypoint as Record<string, unknown>;
                        if (waypointRecord.type !== "defense") return;

                        const effectiveness = waypointRecord.defenseEffectiveness as DefenseEffectiveness | undefined;

                        const applyEffectiveness = (summary: AggregatedDefenseStats) => {
                            summary.attempts += 1;
                            summary.matches.add(`${entry.eventKey || ""}:${entry.matchNumber || ""}`);

                            if (effectiveness === "very") {
                                summary.very += 1;
                            } else if (effectiveness === "somewhat") {
                                summary.somewhat += 1;
                            } else if (effectiveness === "not") {
                                summary.not += 1;
                            } else {
                                summary.unknown += 1;
                            }
                        };

                        const defendedTeam = Number(waypointRecord.defendedTeamNumber);
                        if (Number.isFinite(defendedTeam) && defendedTeam === targetTeam) {
                            if (!byDefender.has(defenderTeam)) {
                                byDefender.set(defenderTeam, {
                                    attempts: 0,
                                    matches: new Set<string>(),
                                    very: 0,
                                    somewhat: 0,
                                    not: 0,
                                    unknown: 0,
                                });
                            }

                            applyEffectiveness(byDefender.get(defenderTeam)!);
                        }

                        if (defenderTeam === targetTeam && Number.isFinite(defendedTeam) && defendedTeam > 0 && defendedTeam !== targetTeam) {
                            if (!byDefendedTeam.has(defendedTeam)) {
                                byDefendedTeam.set(defendedTeam, {
                                    attempts: 0,
                                    matches: new Set<string>(),
                                    very: 0,
                                    somewhat: 0,
                                    not: 0,
                                    unknown: 0,
                                });
                            }

                            applyEffectiveness(byDefendedTeam.get(defendedTeam)!);
                        }
                    });
                });

                setDefendedByRows(mapAndSortRows(byDefender));
                setDefendedTeamsRows(mapAndSortRows(byDefendedTeam));
            } catch (error) {
                console.error("Failed to calculate defense-against-team analytics:", error);
                setDefendedByRows([]);
                setDefendedTeamsRows([]);
            } finally {
                setIsLoading(false);
            }
        };

        void load();
    }, [teamNumber, selectedEvent]);

    const bestDefender = useMemo(() => defendedByRows[0], [defendedByRows]);
    const bestTarget = useMemo(() => defendedTeamsRows[0], [defendedTeamsRows]);

    const renderTable = (rows: DefenseSummaryRow[], entityLabel: string) => (
        <div className="rounded-md border overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{entityLabel}</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Matches</TableHead>
                        <TableHead>Very</TableHead>
                        <TableHead>Somewhat</TableHead>
                        <TableHead>Not</TableHead>
                        <TableHead>Unknown</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.team}>
                            <TableCell className="font-medium">{row.team}</TableCell>
                            <TableCell>{row.effectivenessScore}%</TableCell>
                            <TableCell>{row.attempts}</TableCell>
                            <TableCell>{row.matchCount}</TableCell>
                            <TableCell>{row.very}</TableCell>
                            <TableCell>{row.somewhat}</TableCell>
                            <TableCell>{row.not}</TableCell>
                            <TableCell>{row.unknown}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2">
                    <span>Defense Matchups • Team {teamNumber}</span>
                    {bestDefender ? (
                        <Badge variant="secondary">
                            Best Defender: {bestDefender.team} ({bestDefender.effectivenessScore}%)
                        </Badge>
                    ) : null}
                    {bestTarget ? (
                        <Badge variant="outline">
                            Best Target: {bestTarget.team} ({bestTarget.effectivenessScore}%)
                        </Badge>
                    ) : null}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading defense analytics…</p>
                ) : (
                    <Tabs defaultValue="defended-by" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="defended-by">Defended By</TabsTrigger>
                            <TabsTrigger value="defended-teams">Defended Teams</TabsTrigger>
                        </TabsList>
                        <TabsContent value="defended-by" className="mt-4">
                            {defendedByRows.length === 0
                                ? <p className="text-sm text-muted-foreground">No defense events recorded against this team yet.</p>
                                : renderTable(defendedByRows, "Defender")}
                        </TabsContent>
                        <TabsContent value="defended-teams" className="mt-4">
                            {defendedTeamsRows.length === 0
                                ? <p className="text-sm text-muted-foreground">This team has no recorded defense targets yet.</p>
                                : renderTable(defendedTeamsRows, "Defended Team")}
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}

export default DefenseAgainstTeamAnalysis;
