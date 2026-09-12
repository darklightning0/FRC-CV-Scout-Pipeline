/**
 * Match Schedule — TBA schedule, scores, cards/DQ, and scout status.
 */

import { useEffect, useState } from 'react';
import { EventNameSelector } from '@/core/components/GameStartComponents/EventNameSelector';
import { GenericSelector } from '@/core/components/ui/generic-selector';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { useMatchSchedule, type MatchScheduleRow, type ScheduleTeamSlot } from '@/core/hooks/useMatchSchedule';
import { cn } from '@/core/lib/utils';
import { Ban, RefreshCw, Square } from 'lucide-react';
import { toast } from 'sonner';

function TeamPenaltyIcons({ cards }: { cards: ScheduleTeamSlot['cards'] }) {
  if (cards.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 ml-0.5 align-middle">
      {cards.includes('yellow') && (
        <span title="Yellow card">
          <Square className="h-3 w-3 fill-yellow-400 text-yellow-500" aria-label="Yellow card" />
        </span>
      )}
      {cards.includes('red') && (
        <span title="Red card">
          <Square className="h-3 w-3 fill-red-600 text-red-600" aria-label="Red card" />
        </span>
      )}
      {cards.includes('dq') && (
        <span title="Disqualified">
          <Ban className="h-3 w-3 text-destructive" aria-label="DQ" />
        </span>
      )}
    </span>
  );
}

function AllianceTeams({
  teams,
  color,
  highlightTeam,
}: {
  teams: ScheduleTeamSlot[];
  color: 'red' | 'blue';
  highlightTeam: number | null;
}) {
  const text =
    color === 'red'
      ? 'text-red-700 dark:text-red-300'
      : 'text-blue-700 dark:text-blue-300';

  return (
    <div className={cn('flex flex-wrap gap-x-2 gap-y-1 text-sm', text)}>
      {teams.map((t) => {
        const highlighted = highlightTeam === t.teamNumber;
        return (
          <span
            key={t.teamNumber}
            className={cn(
              'inline-flex items-center rounded px-1',
              highlighted && 'bg-amber-400/25 ring-1 ring-amber-400/60 font-semibold'
            )}
          >
            {t.teamNumber}
            <TeamPenaltyIcons cards={t.cards} />
          </span>
        );
      })}
    </div>
  );
}

function MatchRow({
  row,
  highlightTeam,
}: {
  row: MatchScheduleRow;
  highlightTeam: number | null;
}) {
  const involvesHighlight =
    highlightTeam != null &&
    (row.redTeams.some((t) => t.teamNumber === highlightTeam) ||
      row.blueTeams.some((t) => t.teamNumber === highlightTeam));

  const winnerBadge =
    !row.complete
      ? null
      : row.winner === 'red'
        ? { label: 'Red wins', className: 'bg-red-600 text-white border-transparent' }
        : row.winner === 'blue'
          ? { label: 'Blue wins', className: 'bg-blue-600 text-white border-transparent' }
          : row.winner === 'tie'
            ? { label: 'Tie', className: '' }
            : { label: 'Played', className: '' };

  const when =
    row.scheduledTime && row.scheduledTime > 0
      ? new Date(row.scheduledTime * 1000).toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  return (
    <div
      className={cn(
        'rounded-lg border p-3 sm:p-4 transition-colors',
        involvesHighlight && 'border-amber-400/50 bg-amber-400/5',
        !row.complete && 'opacity-95'
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-base">{row.displayName}</span>
            {when && <span className="text-xs text-muted-foreground">{when}</span>}
            {row.complete ? (
              <Badge variant="outline" className="text-[10px]">
                Final
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Scheduled
              </Badge>
            )}
            {winnerBadge && (
              <Badge className={cn('text-[10px]', winnerBadge.className)}>{winnerBadge.label}</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border border-red-200/60 dark:border-red-900/50 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-red-700 dark:text-red-300">Red</span>
                {row.redScore != null && (
                  <span
                    className={cn(
                      'text-lg font-bold tabular-nums text-red-700 dark:text-red-300',
                      row.winner === 'red' && 'underline decoration-amber-400 decoration-2'
                    )}
                  >
                    {row.redScore}
                  </span>
                )}
              </div>
              <AllianceTeams teams={row.redTeams} color="red" highlightTeam={highlightTeam} />
            </div>

            <div className="rounded-md border border-blue-200/60 dark:border-blue-900/50 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Blue</span>
                {row.blueScore != null && (
                  <span
                    className={cn(
                      'text-lg font-bold tabular-nums text-blue-700 dark:text-blue-300',
                      row.winner === 'blue' && 'underline decoration-amber-400 decoration-2'
                    )}
                  >
                    {row.blueScore}
                  </span>
                )}
              </div>
              <AllianceTeams teams={row.blueTeams} color="blue" highlightTeam={highlightTeam} />
            </div>
          </div>
        </div>

        <div className="shrink-0 lg:w-52 space-y-1.5 lg:text-right">
          {row.scout.scouted ? (
            <>
              <Badge className="bg-emerald-600 text-white border-transparent">
                Scouted {row.scout.scoutedTeamCount}/{row.scout.expectedTeamCount}
              </Badge>
              <p className="text-xs text-muted-foreground leading-snug">
                {row.scout.scoutNames.length > 0
                  ? `By ${row.scout.scoutNames.join(', ')}`
                  : 'Scout entries present'}
              </p>
            </>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not scouted
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MatchSchedulePage() {
  const [eventKey, setEventKey] = useState('');
  const {
    filteredRows,
    rows,
    availableTeams,
    filterTeam,
    setFilterTeam,
    isLoading,
    isRefreshing,
    error,
    isOnline,
    dataSource,
    cacheAgeLabel,
    refresh,
    persistEventKey,
  } = useMatchSchedule(eventKey);

  useEffect(() => {
    const stored = localStorage.getItem('eventKey') || localStorage.getItem('current_event') || '';
    setEventKey(stored);
  }, []);

  const handleEventChange = (next: string) => {
    setEventKey(next);
    persistEventKey(next);
    setFilterTeam('all');
  };

  const handleRefresh = async () => {
    try {
      await refresh();
      toast.success('Schedule refreshed from TBA');
    } catch {
      toast.error('Could not refresh schedule');
    }
  };

  const highlightTeam =
    filterTeam && filterTeam !== 'all' ? Number.parseInt(filterTeam, 10) : null;
  const highlightNum = Number.isFinite(highlightTeam) ? highlightTeam : null;

  const played = rows.filter((r) => r.complete).length;
  const scouted = rows.filter((r) => r.scout.scouted).length;

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 pt-12 pb-24">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Match Schedule</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Offline-first TBA schedule: uses downloaded cache, refreshes when online.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => void handleRefresh()}
            disabled={!eventKey || isRefreshing || isLoading || !isOnline}
          >
            <RefreshCw className={cn('h-4 w-4', (isRefreshing || isLoading) && 'animate-spin')} />
            {isRefreshing ? 'Refreshing…' : 'Refresh TBA'}
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2 min-w-0">
            <label className="font-medium shrink-0">Event:</label>
            <EventNameSelector currentEventKey={eventKey} onEventKeyChange={handleEventChange} />
          </div>

          {availableTeams.length > 0 && (
            <div className="flex items-center gap-2 min-w-0">
              <label className="font-medium shrink-0">Team:</label>
              <div className="w-[min(14rem,calc(100vw-6rem))]">
                <GenericSelector
                  label="Filter team"
                  value={filterTeam}
                  availableOptions={['all', ...availableTeams]}
                  onValueChange={setFilterTeam}
                  placeholder="All teams"
                  displayFormat={(v) => (v === 'all' ? 'All teams' : v)}
                  className="bg-background"
                />
              </div>
            </div>
          )}
        </div>

        {!eventKey && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg font-medium">No event selected</p>
              <p className="text-sm mt-2">Pick a regional to load its match schedule.</p>
            </CardContent>
          </Card>
        )}

        {eventKey && error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {eventKey && !error && (
          <>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{rows.length} matches</Badge>
              <Badge variant="outline">{played} played</Badge>
              <Badge variant="outline">{scouted} with scouting</Badge>
              {!isOnline && (
                <Badge variant="outline" className="border-orange-500/40 text-orange-300">
                  Offline
                </Badge>
              )}
              {dataSource === 'cache' && (
                <Badge variant="outline" className="border-sky-500/40 text-sky-300">
                  Cached{cacheAgeLabel ? ` · ${cacheAgeLabel}` : ''}
                </Badge>
              )}
              {dataSource === 'tba' && isOnline && (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                  Live TBA{cacheAgeLabel ? ` · ${cacheAgeLabel}` : ''}
                </Badge>
              )}
              {highlightNum != null && (
                <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/40">
                  Showing team {highlightNum}
                </Badge>
              )}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {filterTeam === 'all'
                    ? 'All matches'
                    : `Matches for team ${filterTeam}`}
                </CardTitle>
                <CardDescription>
                  Yellow / red squares = cards; ban icon = DQ. Data is stored locally after download
                  (same TBA cache as API Data). Scout names come from local scouting entries.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading && filteredRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Loading schedule…</p>
                ) : filteredRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {rows.length === 0
                      ? 'No schedule cached yet. Connect to the internet and tap Refresh TBA (or download the event from API Data → Match Schedules / Regional download).'
                      : 'No matches for that team filter.'}
                  </p>
                ) : (
                  filteredRows.map((row) => (
                    <MatchRow key={row.matchKey} row={row} highlightTeam={highlightNum} />
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
