/**
 * Team Stats → CV tab: RobotDetector telemetry from Dexie (read-only vs scout paths).
 *
 * Competition flow (scouts never run YOLO):
 * 1. Analysis laptop watches TBA for the event key → runs CV when YouTube appears
 * 2. Laptop serves bundles on LAN (cv_sync_server)
 * 3. Tablets pull into Dexie → Team Stats CV shows per team / match
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  db,
  loadCvMatchTelemetryByTeamAndEvent,
} from '@/core/db/database';
import {
  CV_API_POLL_INTERVAL_MS,
  clearStoredCvSyncBaseUrl,
  getBuiltinCvApiBaseUrl,
  getStoredCvSyncBaseUrl,
  isNetlifyCvFunctionBase,
  pullCvBundlesForEvent,
  setStoredCvSyncBaseUrl,
} from '@/core/lib/cvSyncClient';
import { getCurrentEvent } from '@/core/lib/tba';
import type { CvMatchTelemetryEntry } from '@/core/types/cv-telemetry';
import type { PathWaypoint } from '@/game-template/components/field-map';
import type { ScoutingEntryBase } from '@/types/scouting-entry';
import { CvPathOverlay } from '@/core/components/cv-telemetry/CvPathOverlay';
import {
  CvTrailCanvas,
  phaseLayersFromPaths,
  type CvTrailLayer,
} from '@/core/components/cv-telemetry/CvTrailCanvas';
import { BLUE_ALLIANCE_HUES, RED_ALLIANCE_HUES } from '@/core/lib/cvFieldCoords';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Input } from '@/core/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/core/components/ui/select';
import { toast } from 'sonner';
import {
  Gauge,
  Layers,
  Milestone,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingUp,
  Wifi,
} from 'lucide-react';
import { cn } from '@/core/lib/utils';

type CvTeamStatsTabProps = {
  teamNumber: string;
  selectedEvent?: string;
  className?: string;
};

export function CvTeamStatsTab({
  teamNumber,
  selectedEvent,
  className = '',
}: CvTeamStatsTabProps) {
  const numericTeam = Number(teamNumber);
  const [cvEntries, setCvEntries] = useState<CvMatchTelemetryEntry[]>([]);
  const [scoutingEntries, setScoutingEntries] = useState<ScoutingEntryBase[]>([]);
  const [selectedMatchKey, setSelectedMatchKey] = useState('');
  const [syncBaseUrl, setSyncBaseUrl] = useState(getStoredCvSyncBaseUrl);
  const [isPulling, setIsPulling] = useState(false);
  const [pathScope, setPathScope] = useState<'match' | 'event'>('match');

  const eventForSync = selectedEvent || getCurrentEvent() || '';

  const loadData = useCallback(async () => {
    if (!numericTeam || Number.isNaN(numericTeam)) return;

    try {
      let forTeam: CvMatchTelemetryEntry[];
      if (selectedEvent) {
        forTeam = await loadCvMatchTelemetryByTeamAndEvent(numericTeam, selectedEvent);
      } else {
        forTeam = await db.cvMatchTelemetry.where('teamNumber').equals(numericTeam).toArray();
      }

      setCvEntries(forTeam);

      setSelectedMatchKey((prev) => {
        if (forTeam.length === 0) return '';
        if (prev && forTeam.some((e) => e.matchKey === prev)) return prev;
        return forTeam[0]!.matchKey;
      });

      const scoutMatches = await db.scoutingData.where('teamNumber').equals(numericTeam).toArray();
      setScoutingEntries(
        selectedEvent
          ? scoutMatches.filter((s) => s.eventKey === selectedEvent)
          : scoutMatches
      );
    } catch (err) {
      console.error('Failed to load CV telemetry:', err);
    }
  }, [numericTeam, selectedEvent]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onImported = () => {
      void loadData();
    };
    window.addEventListener('cv-telemetry-imported', onImported);
    return () => window.removeEventListener('cv-telemetry-imported', onImported);
  }, [loadData]);

  // TBA-style: while this tab is open, poll the public CV API on an interval
  useEffect(() => {
    if (!eventForSync || !syncBaseUrl.trim()) return;

    let cancelled = false;
    const tick = async (silent: boolean) => {
      try {
        const result = await pullCvBundlesForEvent(syncBaseUrl, eventForSync);
        if (cancelled) return;
        if (!silent && result.importedMatches > 0) {
          toast.success(`CV API: ${result.importedMatches} match(es) synced`);
        }
        // Only refresh UI when something new arrived — avoids heatmap/canvas blink
        if (result.importedMatches > 0 || result.importedTeams > 0) {
          await loadData();
        }
      } catch {
        // Silent on background poll — network may be offline
      }
    };

    void tick(true);
    const id = window.setInterval(() => void tick(true), CV_API_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [eventForSync, syncBaseUrl, loadData]);

  const currentCvEntry = useMemo(() => {
    return cvEntries.find((e) => e.matchKey === selectedMatchKey) || cvEntries[0] || null;
  }, [cvEntries, selectedMatchKey]);

  const scoutWaypoints = useMemo((): PathWaypoint[] => {
    if (!currentCvEntry) return [];
    const scout = scoutingEntries.find((s) => s.matchKey === currentCvEntry.matchKey);
    const auto = (scout?.gameData as { auto?: { autoPath?: unknown } } | undefined)?.auto?.autoPath;
    if (!Array.isArray(auto)) return [];
    return auto.filter(
      (wp): wp is PathWaypoint =>
        !!wp && typeof wp === 'object' && 'position' in (wp as PathWaypoint)
    );
  }, [currentCvEntry, scoutingEntries]);

  const stats = useMemo(() => {
    if (!currentCvEntry) return null;
    const maxSpeedMps = currentCvEntry.maxSpeedMps;
    return {
      maxSpeedMps,
      maxSpeedMph: Math.round(maxSpeedMps * 2.23694 * 10) / 10,
      avgSpeedMps: currentCvEntry.avgSpeedMps,
      totalDistM: currentCvEntry.totalDistanceM,
      totalDistFt: Math.round(currentCvEntry.totalDistanceM * 3.28084),
      zones: currentCvEntry.zoneOccupancyPct,
      trenchCrossings: currentCvEntry.trenchCrossings,
      bumpCrossings: currentCvEntry.bumpCrossings,
      autoPointsCount: currentCvEntry.autoPath.length,
      sampleCount: currentCvEntry.sampleCount,
    };
  }, [currentCvEntry]);

  const phaseLayers = useMemo(() => {
    if (!currentCvEntry) return [];
    return phaseLayersFromPaths({
      auto: currentCvEntry.autoPath,
      teleop: currentCvEntry.teleopPath,
      endgame: currentCvEntry.endgamePath,
      alliance: currentCvEntry.alliance === 'red' ? 'red' : 'blue',
    });
  }, [currentCvEntry]);

  const eventPhaseSections = useMemo(() => {
    const build = (
      key: 'autoPath' | 'teleopPath' | 'endgamePath',
      label: string,
      playbackRate: number
    ) => {
      const layers: CvTrailLayer[] = cvEntries
        .map((entry, i) => {
          const points =
            key === 'autoPath'
              ? entry.autoPath
              : key === 'teleopPath'
                ? entry.teleopPath ?? []
                : entry.endgamePath ?? [];
          const hues = entry.alliance === 'red' ? RED_ALLIANCE_HUES : BLUE_ALLIANCE_HUES;
          return {
            id: `${key}-${entry.matchKey}`,
            label: entry.matchKey.replace(/^.*_/, ''),
            color: hues[i % hues.length]!,
            points,
            emphasis: entry.matchKey === currentCvEntry?.matchKey,
            playbackRate,
          };
        })
        .filter((l) => l.points.length > 0);
      return { label, layers, playbackRate };
    };
    return [
      build('autoPath', 'Auto (all matches)', 1),
      build('teleopPath', 'Teleop (all matches)', 2),
      build('endgamePath', 'Endgame (all matches)', 1),
    ];
  }, [cvEntries, currentCvEntry?.matchKey]);

  const handlePullFromLaptop = async () => {
    if (!eventForSync) {
      toast.error('Set the event code on WiFi Data / API Data first (same TBA event key).');
      return;
    }
    setIsPulling(true);
    try {
      setStoredCvSyncBaseUrl(syncBaseUrl);
      const result = await pullCvBundlesForEvent(syncBaseUrl, eventForSync);
      if (result.importedMatches === 0) {
        toast.warning(
          `No CV data yet for ${eventForSync}. After your laptop finishes a match it will appear here automatically.`
        );
      } else {
        toast.success(
          `Synced ${result.importedMatches} match(es), ${result.importedTeams} team rows`
        );
      }
      await loadData();
    } catch (err) {
      toast.error(
        `Could not reach CV API: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsPulling(false);
    }
  };

  const usingBuiltinApi = isNetlifyCvFunctionBase(syncBaseUrl);

  const syncPanel = (
    <Card className="border bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wifi className="h-4 w-4 text-cyan-500" />
          CV data (automatic)
        </CardTitle>
        <CardDescription>
          {usingBuiltinApi ? (
            <>
              Scouts only need Wi‑Fi and this app — same idea as TBA. Your analyst laptop publishes
              finished matches to the Hunter Eyes site; this tab auto-syncs every{' '}
              {Math.round(CV_API_POLL_INTERVAL_MS / 1000)}s. Event:{' '}
              <code className="text-xs">{eventForSync || '(set event code first)'}</code>
            </>
          ) : (
            <>
              Using a custom CV API URL. Auto-refreshes every{' '}
              {Math.round(CV_API_POLL_INTERVAL_MS / 1000)}s. Event:{' '}
              <code className="text-xs">{eventForSync || '(set event code first)'}</code>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => void handlePullFromLaptop()}
            disabled={isPulling}
            className="gap-2 shrink-0"
          >
            <RefreshCw className={cn('h-4 w-4', isPulling && 'animate-spin')} />
            {isPulling ? 'Syncing…' : 'Sync now'}
          </Button>
          {!usingBuiltinApi && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clearStoredCvSyncBaseUrl();
                setSyncBaseUrl(getBuiltinCvApiBaseUrl());
                toast.info('Reset to app default CV API (/cv-api)');
              }}
            >
              Use app default
            </Button>
          )}
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Advanced / analyst setup</summary>
          <div className="mt-2 space-y-2">
            <Input
              value={syncBaseUrl}
              onChange={(e) => setSyncBaseUrl(e.target.value)}
              placeholder={getBuiltinCvApiBaseUrl()}
              className="font-mono text-xs"
            />
            <p className="leading-relaxed">
              On Cloudflare Pages: bind KV as <code>CV_TELEMETRY</code>, set{' '}
              <code>CV_SYNC_API_KEY</code>, then on the analysis laptop:
              <br />
              <code className="select-all break-all">
                export CV_SYNC_API_URL=&apos;https://YOUR-PAGES-DOMAIN/cv-api&apos;
                <br />
                export CV_SYNC_API_KEY=&apos;same-as-pages-env&apos;
                <br />
                python src/cv_event_watcher.py --event-key{' '}
                {eventForSync || 'YOUR_EVENT'}
              </code>
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );

  if (!numericTeam || Number.isNaN(numericTeam)) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Select a team to view CV telemetry.
        </CardContent>
      </Card>
    );
  }

  if (cvEntries.length === 0) {
    return (
      <div className={cn('space-y-4', className)}>
        <Card className="bg-card/50">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <Sparkles className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">No CV data for team {teamNumber} yet</CardTitle>
            <CardDescription className="mx-auto max-w-lg">
              When the laptop finishes a match this team played, pull from the sync server — heatmaps
              and paths show up here under that team automatically. Human scout paths are never
              overwritten.
            </CardDescription>
          </CardHeader>
        </Card>
        {syncPanel}
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex flex-col gap-4 rounded-xl border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">Computer Vision Telemetry</h3>
              <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-xs text-cyan-400">
                RobotDetector
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Ground-truth from match video — separate from scouted paths
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Match:</span>
          <Select value={selectedMatchKey} onValueChange={setSelectedMatchKey}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select match" />
            </SelectTrigger>
            <SelectContent>
              {cvEntries.map((entry) => (
                <SelectItem key={entry.matchKey} value={entry.matchKey}>
                  {entry.matchKey} ({entry.alliance.toUpperCase()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {syncPanel}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="border bg-card/40 p-3">
            <div className="mb-1 flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Peak Speed</span>
              <Gauge className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-300">
                {stats.maxSpeedMps}
              </span>
              <span className="text-xs text-muted-foreground">m/s</span>
            </div>
            <span className="text-[11px] text-muted-foreground">~{stats.maxSpeedMph} mph</span>
          </Card>

          <Card className="border bg-card/40 p-3">
            <div className="mb-1 flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Avg Moving</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-300">
                {stats.avgSpeedMps}
              </span>
              <span className="text-xs text-muted-foreground">m/s</span>
            </div>
            <span className="text-[11px] text-muted-foreground">{stats.sampleCount} frames</span>
          </Card>

          <Card className="border bg-card/40 p-3">
            <div className="mb-1 flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Distance</span>
              <Milestone className="h-4 w-4 text-violet-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold text-violet-600 dark:text-violet-300">
                {stats.totalDistM}
              </span>
              <span className="text-xs text-muted-foreground">m</span>
            </div>
            <span className="text-[11px] text-muted-foreground">~{stats.totalDistFt} ft</span>
          </Card>

          <Card className="border bg-card/40 p-3">
            <div className="mb-1 flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Crossings</span>
              <Layers className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xl font-bold text-amber-600 dark:text-amber-300">
                {stats.trenchCrossings}
              </span>
              <span className="text-xs text-muted-foreground">Trench</span>
              <span className="text-muted-foreground/40">|</span>
              <span className="font-mono text-xl font-bold text-amber-600 dark:text-amber-300">
                {stats.bumpCrossings}
              </span>
              <span className="text-xs text-muted-foreground">Bump</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {stats.autoPointsCount} auto waypoints
            </span>
          </Card>
        </div>
      )}

      {stats && (
        <Card className="space-y-2 border bg-card/40 p-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-cyan-500" />
              Zone occupancy
            </span>
            <span className="font-mono text-muted-foreground">match time</span>
          </div>
          <div className="flex h-4 w-full overflow-hidden rounded-full border bg-muted">
            <div
              style={{ width: `${stats.zones.alliance}%` }}
              className="flex h-full items-center justify-center bg-blue-600 text-[10px] font-bold text-white transition-all"
              title={`Alliance: ${stats.zones.alliance}%`}
            >
              {stats.zones.alliance >= 12 ? `${stats.zones.alliance}%` : ''}
            </div>
            <div
              style={{ width: `${stats.zones.neutral}%` }}
              className="flex h-full items-center justify-center bg-amber-500 text-[10px] font-bold text-black transition-all"
              title={`Neutral: ${stats.zones.neutral}%`}
            >
              {stats.zones.neutral >= 12 ? `${stats.zones.neutral}%` : ''}
            </div>
            <div
              style={{ width: `${stats.zones.opponent}%` }}
              className="flex h-full items-center justify-center bg-red-600 text-[10px] font-bold text-white transition-all"
              title={`Opponent: ${stats.zones.opponent}%`}
            >
              {stats.zones.opponent >= 12 ? `${stats.zones.opponent}%` : ''}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
              Alliance ({stats.zones.alliance}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              Neutral ({stats.zones.neutral}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-600" />
              Opponent ({stats.zones.opponent}%)
            </span>
          </div>
        </Card>
      )}

      {currentCvEntry && (
        <Card className="border bg-card/40 p-4">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-base">Scout path vs CV auto path</CardTitle>
            <CardDescription>
              Cyan = CV · Orange = human scout (if present). Scout data is never overwritten.
            </CardDescription>
          </CardHeader>
          <CvPathOverlay
            scoutWaypoints={scoutWaypoints}
            cvAutoPath={currentCvEntry.autoPath}
            alliance={currentCvEntry.alliance}
            matchKey={currentCvEntry.matchKey}
          />
        </Card>
      )}

      {currentCvEntry && (
        <Card className="border bg-card/40 p-4 space-y-4">
          <CardHeader className="p-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">CV trails & replay</CardTitle>
                <CardDescription>
                  Auto (0–18s) · Teleop (18–130s) · Endgame (130s+). Reprocess matches after the
                  exporter update to fill teleop/endgame.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={pathScope === 'match' ? 'default' : 'outline'}
                  onClick={() => setPathScope('match')}
                >
                  This match
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pathScope === 'event' ? 'default' : 'outline'}
                  onClick={() => setPathScope('event')}
                >
                  All matches
                </Button>
              </div>
            </div>
          </CardHeader>
          {pathScope === 'match' ? (
            phaseLayers.length > 0 ? (
              <div className="space-y-6">
                {phaseLayers.map((layer) => (
                  <CvTrailCanvas
                    key={layer.id}
                    layers={[layer]}
                    enableReplay
                    defaultPlaybackRate={layer.playbackRate ?? 1}
                    title={`${layer.label} — ${currentCvEntry.matchKey}${
                      layer.playbackRate === 2 ? ' (2×)' : ' (realtime)'
                    }`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No timed path points for this match yet.</p>
            )
          ) : (
            <div className="space-y-6">
              {eventPhaseSections.map((section) =>
                section.layers.length > 0 ? (
                  <CvTrailCanvas
                    key={section.label}
                    layers={section.layers}
                    enableReplay
                    defaultPlaybackRate={section.playbackRate}
                    title={section.label}
                  />
                ) : null
              )}
              {eventPhaseSections.every((s) => s.layers.length === 0) && (
                <p className="text-sm text-muted-foreground">
                  No phase paths across matches yet — reprocess after exporter update.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {currentCvEntry?.heatmapDataUrl && (
        <Card className="border bg-card/40 p-4">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-base">Position heatmap</CardTitle>
            <CardDescription>
              Pipeline PNG for {currentCvEntry.matchKey}: magenta→yellow = time spent (hottest =
              yellow), cyan line = tracked path baked into the image — not the proximity overlay.
            </CardDescription>
          </CardHeader>
          <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-muted/30 aspect-2/1">
            <img
              src={currentCvEntry.heatmapDataUrl}
              alt={`CV heatmap for team ${teamNumber} in ${currentCvEntry.matchKey}`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        </Card>
      )}

      {cvEntries.some((e) => e.heatmapDataUrl) && (
        <Card className="border bg-card/40 p-4">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-base">All match heatmaps</CardTitle>
            <CardDescription>
              Every match key already in this device’s CV sync for team {teamNumber} (from the
              laptop/API). If you see <code className="text-xs">f1m1</code> here, that bundle was
              published — it is not invented by this gallery.
            </CardDescription>
          </CardHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cvEntries
              .filter((e) => e.heatmapDataUrl)
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={cn(
                    'overflow-hidden rounded-lg border text-left transition',
                    e.matchKey === selectedMatchKey
                      ? 'border-cyan-500 ring-1 ring-cyan-500/40'
                      : 'border-border hover:border-cyan-500/40'
                  )}
                  onClick={() => setSelectedMatchKey(e.matchKey)}
                >
                  <div className="aspect-2/1 bg-muted/30">
                    <img
                      src={e.heatmapDataUrl}
                      alt={e.matchKey}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="px-2 py-1.5 text-xs font-medium">{e.matchKey}</div>
                </button>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default CvTeamStatsTab;
