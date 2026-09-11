/**
 * Scout defense hot-zones overlaid with CV opponent paths.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import fieldImage from '@/game-template/assets/2026-field.png';
import { loadAllScoutingEntries } from '@/core/db/database';
import type { CvFieldPoint, CvMatchTelemetryEntry } from '@/core/types/cv-telemetry';
import { cn } from '@/core/lib/utils';

type DefensePoint = { x: number; y: number; effectiveness?: string };

type CvDefenseHotZonesProps = {
  eventKey: string;
  selectedTeams: number[];
  /** CV rows for the looked-up match (used for opponent trails) */
  cvEntries: CvMatchTelemetryEntry[];
  className?: string;
};

function collectDefensePoints(
  entries: Awaited<ReturnType<typeof loadAllScoutingEntries>>,
  eventKey: string,
  defenderTeams: Set<number>
): DefensePoint[] {
  const eventFilter = eventKey.trim().toLowerCase();
  const points: DefensePoint[] = [];

  for (const entry of entries) {
    if (eventFilter && (entry.eventKey || '').toLowerCase() !== eventFilter) continue;
    const defender = Number(entry.teamNumber);
    if (!defenderTeams.has(defender)) continue;

    const teleop = (entry.gameData as Record<string, unknown> | undefined)?.teleop as
      | Record<string, unknown>
      | undefined;
    const teleopPath = teleop?.teleopPath;
    if (!Array.isArray(teleopPath)) continue;

    for (const waypoint of teleopPath) {
      if (!waypoint || typeof waypoint !== 'object') continue;
      const record = waypoint as Record<string, unknown>;
      if (record.type !== 'defense') continue;
      const position = record.position as { x?: number; y?: number } | undefined;
      if (typeof position?.x !== 'number' || typeof position?.y !== 'number') continue;
      // Scout paths for red are stored mirrored for FieldCanvas; CV uses absolute blue-left.
      const entryAlliance = String(entry.allianceColor || '').toLowerCase();
      const x = entryAlliance === 'red' ? 1 - position.x : position.x;
      points.push({
        x,
        y: position.y,
        effectiveness: typeof record.defenseEffectiveness === 'string'
          ? record.defenseEffectiveness
          : undefined,
      });
    }
  }
  return points;
}

export function CvDefenseHotZones({
  eventKey,
  selectedTeams,
  cvEntries,
  className,
}: CvDefenseHotZonesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [defensePoints, setDefensePoints] = useState<DefensePoint[]>([]);

  const defenderSet = useMemo(() => new Set(selectedTeams), [selectedTeams]);

  const opponentPaths = useMemo(() => {
    // Opponent = CV entries whose alliance differs from the majority of selected defenders
    const blues = cvEntries.filter((e) => e.alliance === 'blue').length;
    const reds = cvEntries.filter((e) => e.alliance === 'red').length;
    const focusAlliance = blues >= reds ? 'blue' : 'red';
    const oppAlliance = focusAlliance === 'blue' ? 'red' : 'blue';
    return cvEntries
      .filter((e) => e.alliance === oppAlliance)
      .map((e) => ({
        team: e.teamNumber,
        points: (e.matchPath && e.matchPath.length > 0
          ? e.matchPath
          : e.teleopPath && e.teleopPath.length > 0
            ? e.teleopPath
            : e.autoPath) as CvFieldPoint[],
      }))
      .filter((p) => p.points.length >= 2);
  }, [cvEntries]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!eventKey || defenderSet.size === 0) {
        setDefensePoints([]);
        return;
      }
      const entries = await loadAllScoutingEntries();
      if (cancelled) return;
      setDefensePoints(collectDefensePoints(entries, eventKey, defenderSet));
    })();
    return () => {
      cancelled = true;
    };
  }, [eventKey, defenderSet]);

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

    const img = new Image();
    img.src = fieldImage;
    img.onload = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Defense density (amber hot zones)
      if (defensePoints.length > 0) {
        const cols = 64;
        const rows = 32;
        const grid = new Float32Array(cols * rows);
        for (const p of defensePoints) {
          const cx = Math.min(cols - 1, Math.max(0, Math.floor(p.x * cols)));
          const cy = Math.min(rows - 1, Math.max(0, Math.floor(p.y * rows)));
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const x = cx + dx;
              const y = cy + dy;
              if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
              const dist = Math.hypot(dx, dy);
              grid[y * cols + x]! += dist === 0 ? 1 : 1 / (1 + dist);
            }
          }
        }
        let max = 0;
        for (let i = 0; i < grid.length; i++) max = Math.max(max, grid[i]!);
        const cellW = width / cols;
        const cellH = height / rows;
        if (max > 0) {
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const v = grid[y * cols + x]! / max;
              if (v < 0.12) continue;
              ctx.fillStyle = `rgba(245, 158, 11, ${0.15 + v * 0.55})`;
              ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
            }
          }
        }

        for (const p of defensePoints) {
          ctx.beginPath();
          ctx.fillStyle =
            p.effectiveness === 'very'
              ? '#f59e0b'
              : p.effectiveness === 'somewhat'
                ? '#fbbf24'
                : '#fde68a';
          ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const oppColors = ['#38bdf8', '#22d3ee', '#67e8f9'];
      opponentPaths.forEach((path, i) => {
        ctx.beginPath();
        ctx.strokeStyle = oppColors[i % oppColors.length]!;
        ctx.lineWidth = 2.25;
        ctx.globalAlpha = 0.9;
        path.points.forEach((pt, idx) => {
          const px = pt.x * width;
          const py = pt.y * height;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    };
  }, [defensePoints, opponentPaths]);

  if (defensePoints.length === 0 && opponentPaths.length === 0) {
    return (
      <div className={cn('rounded-lg border border-dashed p-4 text-sm text-muted-foreground', className)}>
        No scout defense waypoints or CV opponent paths for this selection yet.
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-sm font-medium">Defense hot zones vs opponent CV paths</div>
      <p className="text-xs text-muted-foreground">
        Amber = scouted defense density for selected robots. Cyan = CV trails of the opposing
        alliance in this match.
      </p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg border">
        <canvas ref={canvasRef} className="block w-full" />
      </div>
      <div className="text-xs text-muted-foreground">
        {defensePoints.length} defense marks · {opponentPaths.length} opponent CV trails
      </div>
    </div>
  );
}
