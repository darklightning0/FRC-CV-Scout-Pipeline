/**
 * Team Card Stats Component
 * 
 * Displays inline statistics below the team name in the pick list.
 * Dynamically renders action averages from team stats.
 */

import type { TeamStats } from '@/core/types/team-stats';
import type { CvTeamPickMetrics } from '@/core/lib/cvPickListMetrics';

interface TeamCardStatsProps {
    team: TeamStats;
    cvMetrics?: CvTeamPickMetrics;
}

/**
 * Inline stats display for team cards.
 * Dynamically renders action averages from team stats.
 */
export const TeamCardStats = ({ team, cvMetrics }: TeamCardStatsProps) => {
    const auto = team.auto as Record<string, unknown> | undefined;
    const teleop = team.teleop as Record<string, unknown> | undefined;
    const endgame = team.endgame;

    const getNumber = (source: Record<string, unknown> | undefined, key: string): number => {
        const value = source?.[key];
        return typeof value === 'number' ? value : 0;
    };

    const autoFuel = getNumber(auto, 'avgFuelScored') || getNumber(auto, 'avgGamePiece1');
    const autoPass = getNumber(auto, 'avgFuelPassed') || getNumber(auto, 'avgGamePiece2');

    const teleopFuel = getNumber(teleop, 'avgFuelScored') || getNumber(teleop, 'avgGamePiece1');
    const teleopPass = getNumber(teleop, 'avgFuelPassed') || getNumber(teleop, 'avgGamePiece2');

    return (
        <>
            <div className="text-xs text-muted-foreground">
                Auto: Fuel {autoFuel.toFixed(1)}, Pass {autoPass.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground">
                Teleop: Fuel {teleopFuel.toFixed(1)}, Pass {teleopPass.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground">
                {endgame?.climbRate || 0}% climb • {team.matchCount || 0} matches
            </div>
            {cvMetrics && cvMetrics.matchCount > 0 && (
                <div className="text-xs text-muted-foreground">
                    CV: opp {cvMetrics.avgOpponentZonePct.toFixed(0)}% · xings{' '}
                    {cvMetrics.avgTotalCrossings.toFixed(1)} · rank {cvMetrics.cvRankScore.toFixed(0)}
                </div>
            )}
        </>
    );
};
