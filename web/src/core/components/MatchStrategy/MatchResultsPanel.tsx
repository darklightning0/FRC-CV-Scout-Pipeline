import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { getCachedTBAEventMatches } from '@/core/lib/tbaCache';
import {
  findTbaMatchByNumber,
  summarizeTbaMatchResults,
  type TbaAllianceSideSummary,
  type TbaMatchResultsSummary,
} from '@/core/lib/tbaMatchResults';

interface MatchResultsPanelProps {
  eventKey: string;
  matchNumber: string;
  className?: string;
}

function teamKeysToNumbers(keys: string[] | undefined): number[] {
  return (keys ?? [])
    .map((k) => Number.parseInt(k.replace(/^frc/i, ''), 10))
    .filter((n) => Number.isFinite(n));
}

function AllianceResultColumn({
  side,
  label,
  teams,
  isWinner,
}: {
  side: TbaAllianceSideSummary;
  label: string;
  teams: number[];
  isWinner: boolean;
}) {
  const isRed = label === 'Red';
  const border = isRed
    ? 'border-red-300 dark:border-red-800'
    : 'border-blue-300 dark:border-blue-800';
  const bg = isRed
    ? 'bg-red-50 dark:bg-red-950/30'
    : 'bg-blue-50 dark:bg-blue-950/30';
  const title = isRed
    ? 'text-red-700 dark:text-red-300'
    : 'text-blue-700 dark:text-blue-300';

  return (
    <div className={`rounded-lg border-2 p-4 ${border} ${bg} ${isWinner ? 'ring-2 ring-amber-400/70' : ''}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${title}`}>{label}</span>
        {isWinner && <Badge className="bg-amber-500 text-white border-transparent">Winner</Badge>}
      </div>
      <div className={`mb-2 text-3xl font-bold ${title}`}>{side.score}</div>
      <div className="mb-3 text-xs text-muted-foreground space-y-0.5">
        {teams.length > 0 ? teams.map((t) => <div key={t}>{t}</div>) : <div>—</div>}
      </div>

      <div className="space-y-1 border-t border-border/60 pt-3 text-xs">
        {side.autoPoints !== undefined && (
          <div className="flex justify-between gap-2">
            <span>Auto</span>
            <span className="font-medium">{side.autoPoints}</span>
          </div>
        )}
        {side.teleopPoints !== undefined && (
          <div className="flex justify-between gap-2">
            <span>Teleop</span>
            <span className="font-medium">{side.teleopPoints}</span>
          </div>
        )}
        {side.endgamePoints !== undefined && (
          <div className="flex justify-between gap-2">
            <span>Endgame</span>
            <span className="font-medium">{side.endgamePoints}</span>
          </div>
        )}
        {side.hubAutoCount !== undefined && (
          <div className="flex justify-between gap-2">
            <span>Hub auto</span>
            <span className="font-medium">{side.hubAutoCount}</span>
          </div>
        )}
        {side.hubTeleopCount !== undefined && (
          <div className="flex justify-between gap-2">
            <span>Hub teleop</span>
            <span className="font-medium">{side.hubTeleopCount}</span>
          </div>
        )}
        {side.foulPoints !== undefined && (
          <div className="flex justify-between gap-2">
            <span>Foul pts</span>
            <span className="font-medium">{side.foulPoints}</span>
          </div>
        )}
        {(side.foulCount !== undefined || side.techFoulCount !== undefined) && (
          <div className="flex justify-between gap-2">
            <span>Fouls</span>
            <span className="font-medium">
              {side.foulCount ?? 0}
              {side.techFoulCount !== undefined ? ` (+${side.techFoulCount} tech)` : ''}
            </span>
          </div>
        )}
        {side.rp !== undefined && (
          <div className="flex justify-between gap-2">
            <span>RP</span>
            <span className="font-medium">{side.rp}</span>
          </div>
        )}
      </div>

      {side.climbs.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
          <div className="font-medium text-muted-foreground">Climbs</div>
          {side.climbs.map((c) => (
            <div key={`${c.teamNumber}-${c.station}`} className="flex justify-between gap-2">
              <span>{c.teamNumber}</span>
              <span className="font-medium">{c.level}</span>
            </div>
          ))}
        </div>
      )}

      {(side.cards.length > 0 || side.dqTeamNumbers.length > 0) && (
        <div className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
          <div className="font-medium text-muted-foreground">Cards / DQ</div>
          {side.cards.map((c, i) => (
            <div key={`${c.label}-${c.teamNumber ?? i}`}>
              {c.teamNumber ? `${c.teamNumber}: ` : ''}
              {c.label}
            </div>
          ))}
          {side.dqTeamNumbers.map((n) => (
            <div key={`dq-${n}`} className="text-destructive">
              {n}: DQ
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchResultsPanel({ eventKey, matchNumber, className }: MatchResultsPanelProps) {
  const [summary, setSummary] = useState<TbaMatchResultsSummary | null>(null);
  const [teamKeys, setTeamKeys] = useState<{ red: number[]; blue: number[] }>({
    red: [],
    blue: [],
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'missing' | 'ready'>('idle');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!eventKey || !matchNumber.trim()) {
        setSummary(null);
        setStatus('idle');
        return;
      }

      setStatus('loading');
      try {
        const matches = await getCachedTBAEventMatches(eventKey, true);
        const match = findTbaMatchByNumber(matches, matchNumber);
        if (cancelled) return;

        if (!match) {
          setSummary(null);
          setTeamKeys({ red: [], blue: [] });
          setStatus('missing');
          return;
        }

        setTeamKeys({
          red: teamKeysToNumbers(match.alliances?.red?.team_keys),
          blue: teamKeysToNumbers(match.alliances?.blue?.team_keys),
        });
        setSummary(summarizeTbaMatchResults(match));
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setSummary(null);
          setStatus('missing');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventKey, matchNumber]);

  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <Card className={className}>
        <CardContent className="py-4 text-sm text-muted-foreground">Loading TBA match results…</CardContent>
      </Card>
    );
  }

  if (status === 'missing' || !summary) {
    return (
      <Card className={className}>
        <CardContent className="py-4 text-sm text-muted-foreground">
          No TBA match found for #{matchNumber} at {eventKey}. Load TBA match data for this event first.
        </CardContent>
      </Card>
    );
  }

  if (!summary.complete) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">TBA · {summary.displayName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>This match is on the TBA schedule but results are not posted yet.</p>
          <div className="grid grid-cols-2 gap-3 text-foreground">
            <div>
              <div className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">Red</div>
              <div className="text-xs">{teamKeys.red.join(', ') || '—'}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-blue-600 dark:text-blue-400">Blue</div>
              <div className="text-xs">{teamKeys.blue.join(', ') || '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const winnerLabel =
    summary.winner === 'red'
      ? 'Red wins'
      : summary.winner === 'blue'
        ? 'Blue wins'
        : summary.winner === 'tie'
          ? 'Tie'
          : 'Result unknown';

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">TBA · {summary.displayName}</CardTitle>
          <Badge variant="outline">{winnerLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AllianceResultColumn
            side={summary.red}
            label="Red"
            teams={teamKeys.red}
            isWinner={summary.winner === 'red'}
          />
          <AllianceResultColumn
            side={summary.blue}
            label="Blue"
            teams={teamKeys.blue}
            isWinner={summary.winner === 'blue'}
          />
        </div>
      </CardContent>
    </Card>
  );
}
