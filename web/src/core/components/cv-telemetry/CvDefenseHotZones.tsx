/**
 * Proximity hot zones: where focus-alliance robots and opposing CV paths got close
 * at the same time. Amber density = closeness; colored lines = opponent paths only.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CvFieldPoint, CvMatchTelemetryEntry } from '@/core/types/cv-telemetry';
import {
  BLUE_ALLIANCE_HUES,
  RED_ALLIANCE_HUES,
  cvNormToCanvas,
  smoothCvPoints,
} from '@/core/lib/cvFieldCoords';
import { getFieldBackgroundImage } from '@/core/lib/cvFieldImage';
import { cn } from '@/core/lib/utils';
import { Button } from '@/core/components/ui/button';

type CvDefenseHotZonesProps = {
  eventKey: string;
  selectedTeams: number[];
  cvEntries: CvMatchTelemetryEntry[];
  className?: string;
};

const PROXIMITY_NORM = 0.06; // ~1m on 16.5m field

export function CvDefenseHotZones({
  selectedTeams,
  cvEntries,
  className,
}: CvDefenseHotZonesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusAlliance, setFocusAlliance] = useState<'blue' | 'red'>(() => {
    const focusSet = new Set(selectedTeams);
    const focus = cvEntries.filter((e) => focusSet.has(e.teamNumber));
    const blues = focus.filter((e) => e.alliance === 'blue').length;
    const reds = focus.filter((e) => e.alliance === 'red').length;
    return blues >= reds ? 'blue' : 'red';
  });

  const oppAlliance = focusAlliance === 'blue' ? 'red' : 'blue';

  const { focusEntries, opponentEntries } = useMemo(() => {
    return {
      focusEntries: cvEntries.filter((e) => e.alliance === focusAlliance),
      opponentEntries: cvEntries.filter((e) => e.alliance === oppAlliance),
    };
  }, [cvEntries, focusAlliance, oppAlliance]);

  const proximityPoints = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [];
    const focusPts: CvFieldPoint[] = [];
    for (const e of focusEntries) {
      const path = e.matchPath && e.matchPath.length > 0 ? e.matchPath : e.teleopPath ?? e.autoPath;
      focusPts.push(...path);
    }
    const oppPts: CvFieldPoint[] = [];
    for (const e of opponentEntries) {
      const path = e.matchPath && e.matchPath.length > 0 ? e.matchPath : e.teleopPath ?? e.autoPath;
      oppPts.push(...path);
    }
    const TIME_WINDOW = 0.5;
    const stepF = Math.max(1, Math.floor(focusPts.length / 500));
    for (let i = 0; i < focusPts.length; i += stepF) {
      const a = focusPts[i]!;
      let best: CvFieldPoint | null = null;
      let bestD = PROXIMITY_NORM;
      for (const b of oppPts) {
        if (Math.abs(a.timeSec - b.timeSec) > TIME_WINDOW) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        pts.push({ x: (a.x + best.x) / 2, y: (a.y + best.y) / 2 });
      }
    }
    return pts;
  }, [focusEntries, opponentEntries]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth || 640;
    const height = Math.round(width / 2);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let cancelled = false;
    void getFieldBackgroundImage().then((img) => {
      if (cancelled) return;
      // Paint full frame in one shot (no intermediate black clear flash)
      ctx.drawImage(img, 0, 0, width, height);

      if (proximityPoints.length > 0) {
        const cols = 72;
        const rows = 36;
        const grid = new Float32Array(cols * rows);
        const cellW = width / cols;
        const cellH = height / rows;
        for (const p of proximityPoints) {
          const px = cvNormToCanvas(p.x, p.y, width, height);
          const cx = Math.min(cols - 1, Math.max(0, Math.floor(px.x / cellW)));
          const cy = Math.min(rows - 1, Math.max(0, Math.floor(px.y / cellH)));
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const x = cx + dx;
              const y = cy + dy;
              if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
              grid[y * cols + x]! += 1 / (1 + Math.hypot(dx, dy));
            }
          }
        }
        let max = 0;
        for (let i = 0; i < grid.length; i++) max = Math.max(max, grid[i]!);
        if (max > 0) {
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const v = grid[y * cols + x]! / max;
              if (v < 0.15) continue;
              ctx.fillStyle = `rgba(245, 158, 11, ${0.15 + v * 0.55})`;
              ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
            }
          }
        }
      }

      opponentEntries.forEach((e, i) => {
        const raw = e.matchPath && e.matchPath.length > 0 ? e.matchPath : e.autoPath;
        const path = smoothCvPoints(raw, 5);
        if (path.length < 2) return;
        const hues = e.alliance === 'red' ? RED_ALLIANCE_HUES : BLUE_ALLIANCE_HUES;
        const color = hues[i % hues.length]!;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.75;
        path.forEach((pt, idx) => {
          const p = cvNormToCanvas(pt.x, pt.y, width, height);
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [proximityPoints, opponentEntries]);

  if (opponentEntries.length === 0 && focusEntries.length === 0) {
    return (
      <div className={cn('rounded-lg border border-dashed p-4 text-sm text-muted-foreground', className)}>
        Need CV paths for both alliances to show proximity hot zones.
      </div>
    );
  }

  const focusLabels = focusEntries.map((e) => e.teamNumber).join(', ') || '—';
  const oppHues = oppAlliance === 'red' ? RED_ALLIANCE_HUES : BLUE_ALLIANCE_HUES;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Proximity hot zones</div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={focusAlliance === 'blue' ? 'default' : 'outline'}
            className="h-7 px-2 text-xs"
            onClick={() => setFocusAlliance('blue')}
          >
            Focus blue
          </Button>
          <Button
            type="button"
            size="sm"
            variant={focusAlliance === 'red' ? 'default' : 'outline'}
            className="h-7 px-2 text-xs"
            onClick={() => setFocusAlliance('red')}
          >
            Focus red
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Amber = where {focusAlliance} ({focusLabels}) got within ~1&nbsp;m of {oppAlliance} at the same
        time. Lines = opponent CV paths only.
      </p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg border bg-muted/20">
        <canvas ref={canvasRef} className="block w-full" />
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {opponentEntries.map((e, i) => (
          <span key={e.id} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: oppHues[i % oppHues.length] }}
            />
            Opponent {e.teamNumber}
          </span>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        {proximityPoints.length} proximity samples · focus {focusAlliance}: {focusLabels}
      </div>
    </div>
  );
}
