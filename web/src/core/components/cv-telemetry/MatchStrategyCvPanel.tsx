/**
 * Match Strategy CV panel — alliance trails, stacked heatmaps, defense proximity.
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
import { BLUE_ALLIANCE_HUES, RED_ALLIANCE_HUES } from '@/core/lib/cvFieldCoords';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { cn } from '@/core/lib/utils';

type MatchStrategyCvPanelProps = {
  eventKey: string;
  matchNumber: string;
  selectedTeams: (number | null)[];
  className?: string;
};

function resolveAlliance(
  entryAlliance: string,
  teamNumber: number,
  selectedTeams: (number | null)[]
): 'red' | 'blue' {
  if (entryAlliance === 'red' || entryAlliance === 'blue') return entryAlliance;
  // Match Strategy slots: 0–2 red, 3–5 blue
  const slot = selectedTeams.indexOf(teamNumber);
  if (slot >= 0 && slot < 3) return 'red';
  if (slot >= 3) return 'blue';
  return 'blue';
}

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
      const alliance = resolveAlliance(e.alliance, e.teamNumber, selectedTeams);
      const color =
        alliance === 'blue'
          ? BLUE_ALLIANCE_HUES[bi++ % BLUE_ALLIANCE_HUES.length]!
          : RED_ALLIANCE_HUES[ri++ % RED_ALLIANCE_HUES.length]!;
      return {
        id: `${e.teamNumber}`,
        label: `${e.teamNumber} (${alliance})`,
        color,
        points: e.autoPath.length > 0 ? e.autoPath : [],
        emphasis: true,
        playbackRate: 1,
      };
    });
  }, [entries, selectedTeams]);

  const blueStack = useMemo((): StackedHeatLayer[] => {
    return entries
      .filter((e) => resolveAlliance(e.alliance, e.teamNumber, selectedTeams) === 'blue')
      .slice(0, 3)
      .map((e, i) => ({
        id: `blue-${e.teamNumber}`,
        label: String(e.teamNumber),
        color: BLUE_ALLIANCE_HUES[i % BLUE_ALLIANCE_HUES.length]!,
        points: e.matchPath && e.matchPath.length > 0 ? e.matchPath : e.autoPath,
      }));
  }, [entries, selectedTeams]);

  const redStack = useMemo((): StackedHeatLayer[] => {
    return entries
      .filter((e) => resolveAlliance(e.alliance, e.teamNumber, selectedTeams) === 'red')
      .slice(0, 3)
      .map((e, i) => ({
        id: `red-${e.teamNumber}`,
        label: String(e.teamNumber),
        color: RED_ALLIANCE_HUES[i % RED_ALLIANCE_HUES.length]!,
        points: e.matchPath && e.matchPath.length > 0 ? e.matchPath : e.autoPath,
      }));
  }, [entries, selectedTeams]);

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
            No CV telemetry in Dexie for these teams yet — sync from Hunter Eyes / the watcher first.
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
          Auto paths use distinct blue/red hues per robot. Enable CV trails on Field Strategy to draw
          them on the main canvas too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <CvTrailCanvas
          layers={layers}
          enableReplay
          defaultPlaybackRate={1}
          title="Alliance auto paths (realtime)"
        />

        {blueStack.length > 0 && (
          <CvStackedHeatmapCanvas
            layers={blueStack}
            title="Blue stacked heatmap (density only)"
          />
        )}
        {redStack.length > 0 && (
          <CvStackedHeatmapCanvas
            layers={redStack}
            title="Red stacked heatmap (density only)"
          />
        )}

        <CvDefenseHotZones
          eventKey={eventKey}
          selectedTeams={selectedTeamNumbers}
          cvEntries={entries}
        />

        {heatmaps.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Per-team heatmaps (pipeline PNG)</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {heatmaps.map((e) => (
                <div key={e.id} className="overflow-hidden rounded-lg border">
                  <div className="aspect-2/1 bg-muted/30">
                    <img
                      src={e.heatmapDataUrl}
                      alt={`Heatmap ${e.teamNumber}`}
                      className="h-full w-full object-contain"
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
