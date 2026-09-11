/**
 * Match Strategy CV panel — alliance trails, stacked heatmaps, defense hot zones.
 */

import { useMemo } from 'react';
import {
  CvTrailCanvas,
  type CvTrailLayer,
} from '@/core/components/cv-telemetry/CvTrailCanvas';
import {
  CvStackedHeatmapCanvas,
  type StackedHeatLayer,
} from '@/core/components/cv-telemetry/CvStackedHeatmapCanvas';
import { CvDefenseHotZones } from '@/core/components/cv-telemetry/CvDefenseHotZones';
import { useMatchCvTelemetry } from '@/core/hooks/useMatchCvTelemetry';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { cn } from '@/core/lib/utils';

const BLUE_COLORS = ['#38bdf8', '#22d3ee', '#67e8f9'];
const RED_COLORS = ['#f87171', '#fb7185', '#f43f5e'];
const STACK_COLORS = ['#38bdf8', '#a78bfa', '#34d399'];

type MatchStrategyCvPanelProps = {
  eventKey: string;
  matchNumber: string;
  selectedTeams: (number | null)[];
  className?: string;
};

export function MatchStrategyCvPanel({
  eventKey,
  matchNumber,
  selectedTeams,
  className,
}: MatchStrategyCvPanelProps) {
  const { entries, teamSet, resolvedMatchKey } = useMatchCvTelemetry(
    eventKey,
    matchNumber,
    selectedTeams
  );

  const layers = useMemo((): CvTrailLayer[] => {
    let bi = 0;
    let ri = 0;
    return entries.map((e) => {
      const isBlue = e.alliance === 'blue' || selectedTeams.slice(0, 3).includes(e.teamNumber);
      const color = isBlue
        ? BLUE_COLORS[bi++ % BLUE_COLORS.length]!
        : RED_COLORS[ri++ % RED_COLORS.length]!;
      return {
        id: `${e.teamNumber}`,
        label: String(e.teamNumber),
        color,
        points: e.autoPath.length > 0 ? e.autoPath : e.matchPath ?? [],
        emphasis: true,
      };
    });
  }, [entries, selectedTeams]);

  const blueStack = useMemo((): StackedHeatLayer[] => {
    return entries
      .filter((e) => e.alliance === 'blue')
      .slice(0, 3)
      .map((e, i) => ({
        id: `blue-${e.teamNumber}`,
        label: String(e.teamNumber),
        color: STACK_COLORS[i % STACK_COLORS.length]!,
        points: e.matchPath && e.matchPath.length > 0 ? e.matchPath : e.autoPath,
      }));
  }, [entries]);

  const redStack = useMemo((): StackedHeatLayer[] => {
    return entries
      .filter((e) => e.alliance === 'red')
      .slice(0, 3)
      .map((e, i) => ({
        id: `red-${e.teamNumber}`,
        label: String(e.teamNumber),
        color: STACK_COLORS[i % STACK_COLORS.length]!,
        points: e.matchPath && e.matchPath.length > 0 ? e.matchPath : e.autoPath,
      }));
  }, [entries]);

  const heatmaps = entries.filter((e) => e.heatmapDataUrl);
  const selectedTeamNumbers = [...teamSet];

  if (teamSet.size === 0) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Select alliance teams (or look up a match) to see CV auto paths and heatmaps here.
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">CV overlay</CardTitle>
          <CardDescription>
            No CV telemetry in Dexie for these teams yet — sync from HunterEyes / the watcher first.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">CV alliance overlay</CardTitle>
          <Badge variant="outline" className="text-xs">
            {resolvedMatchKey || eventKey}
          </Badge>
        </div>
        <CardDescription>
          Auto paths on Field Strategy when CV trails are enabled. Stacked heatmaps and defense
          overlays use the same match telemetry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <CvTrailCanvas layers={layers} enableReplay title="Alliance auto paths" />

        {blueStack.length > 0 && (
          <CvStackedHeatmapCanvas layers={blueStack} title="Blue stacked heatmap (3 colors)" />
        )}
        {redStack.length > 0 && (
          <CvStackedHeatmapCanvas layers={redStack} title="Red stacked heatmap (3 colors)" />
        )}

        <CvDefenseHotZones
          eventKey={eventKey}
          selectedTeams={selectedTeamNumbers}
          cvEntries={entries}
        />

        {heatmaps.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Per-team heatmaps</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {heatmaps.map((e) => (
                <div key={e.id} className="overflow-hidden rounded-lg border">
                  <div className="aspect-2/1 bg-muted/30">
                    <img
                      src={e.heatmapDataUrl}
                      alt={`Heatmap ${e.teamNumber}`}
                      className="h-full w-full object-fill"
                    />
                  </div>
                  <div className="px-2 py-1 text-xs font-medium">
                    {e.teamNumber} · {e.alliance}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MatchStrategyCvPanel;
