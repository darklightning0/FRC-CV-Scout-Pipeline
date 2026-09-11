/**
 * Overlay scouted auto path vs CV ground-truth auto path on the field image.
 * Read-only — never writes to scoutingData.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import fieldImage from '@/game-template/assets/2026-field.png';
import { Badge } from '@/core/components/ui/badge';
import { Checkbox } from '@/core/components/ui/checkbox';
import { Label } from '@/core/components/ui/label';
import { useFieldOrientation } from '@/core/hooks/useFieldOrientation';
import { cn } from '@/core/lib/utils';
import type { CvAlliance, CvFieldPoint } from '@/core/types/cv-telemetry';
import type { PathWaypoint } from '@/game-template/components/field-map';

const FIELD_LENGTH_M = 16.54;
const FIELD_WIDTH_M = 8.21;

type CvPathOverlayProps = {
  scoutWaypoints?: PathWaypoint[];
  cvAutoPath?: CvFieldPoint[];
  alliance?: CvAlliance;
  matchKey?: string;
  className?: string;
};

function visualize(
  x: number,
  y: number,
  _alliance: CvAlliance
): { x: number; y: number } {
  // CV + scout overlay uses a fixed blue-left field image.
  // Coords are absolute / blue-wall-at-0 — do NOT mirror for red (that put red starts on blue).
  return { x, y };
}

export function CvPathOverlay({
  scoutWaypoints = [],
  cvAutoPath = [],
  alliance = 'unknown',
  matchKey,
  className = '',
}: CvPathOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFieldRotated } = useFieldOrientation();

  const [showScoutPath, setShowScoutPath] = useState(true);
  const [showCvPath, setShowCvPath] = useState(true);
  const [showDelta, setShowDelta] = useState(true);

  const drawAlliance: 'red' | 'blue' = alliance === 'red' ? 'red' : 'blue';

  const startDelta = useMemo(() => {
    const scoutStart =
      scoutWaypoints.find((w) => w.type === 'start') || scoutWaypoints[0];
    const cvStart = cvAutoPath[0];
    if (!scoutStart?.position || !cvStart) return null;

    const dxM = (scoutStart.position.x - cvStart.x) * FIELD_LENGTH_M;
    const dyM = (scoutStart.position.y - cvStart.y) * FIELD_WIDTH_M;
    const distM = Math.round(Math.hypot(dxM, dyM) * 100) / 100;

    return {
      distM,
      scoutPos: scoutStart.position,
      cvPos: { x: cvStart.x, y: cvStart.y },
    };
  }, [scoutWaypoints, cvAutoPath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth || 640;
    const height = Math.round(width / 2);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const toPx = (normX: number, normY: number) => {
      const v = visualize(normX, normY, drawAlliance);
      return { x: v.x * width, y: v.y * height };
    };

    const drawPolyline = (
      points: { x: number; y: number }[],
      color: string,
      lineWidth: number,
      dashed = false
    ) => {
      if (points.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.beginPath();
      const first = toPx(points[0]!.x, points[0]!.y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i += 1) {
        const p = toPx(points[i]!.x, points[i]!.y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawDot = (x: number, y: number, color: string, radius: number) => {
      const p = toPx(x, y);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    // Scout path (orange) — waypoint positions + pathPoints
    if (showScoutPath && scoutWaypoints.length > 0) {
      const scoutPoints: { x: number; y: number }[] = [];
      for (const wp of scoutWaypoints) {
        if (wp.pathPoints && wp.pathPoints.length > 0) {
          scoutPoints.push(...wp.pathPoints);
        } else if (wp.position) {
          scoutPoints.push(wp.position);
        }
      }
      drawPolyline(scoutPoints, 'rgba(249, 115, 22, 0.95)', 3);
      const start = scoutWaypoints.find((w) => w.type === 'start') || scoutWaypoints[0];
      if (start?.position) {
        drawDot(start.position.x, start.position.y, '#f97316', 6);
      }
    }

    // CV path (cyan)
    if (showCvPath && cvAutoPath.length > 0) {
      drawPolyline(cvAutoPath, 'rgba(34, 211, 238, 0.95)', 3);
      const start = cvAutoPath[0]!;
      const end = cvAutoPath[cvAutoPath.length - 1]!;
      drawDot(start.x, start.y, '#22d3ee', 6);
      drawDot(end.x, end.y, '#67e8f9', 4);
    }

    // Start delta
    if (showDelta && startDelta && showScoutPath && showCvPath) {
      const p1 = toPx(startDelta.scoutPos.x, startDelta.scoutPos.y);
      const p2 = toPx(startDelta.cvPos.x, startDelta.cvPos.y);
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.fillStyle = 'rgba(236, 72, 153, 0.95)';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${startDelta.distM} m`, midX + 6, midY - 6);
    }

    ctx.restore();
  }, [
    scoutWaypoints,
    cvAutoPath,
    drawAlliance,
    showScoutPath,
    showCvPath,
    showDelta,
    startDelta,
    isFieldRotated,
  ]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">
            CV path
          </Badge>
          <Badge variant="outline" className="border-orange-500/40 text-orange-300">
            Scout path
          </Badge>
          {matchKey && (
            <Badge variant="secondary" className="font-mono text-xs">
              {matchKey}
            </Badge>
          )}
          {startDelta && (
            <Badge variant="outline" className="border-pink-500/40 text-pink-300">
              Start Δ {startDelta.distM} m
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Checkbox
              id="cv-show-cv"
              checked={showCvPath}
              onCheckedChange={(v) => setShowCvPath(v === true)}
            />
            <Label htmlFor="cv-show-cv">CV</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="cv-show-scout"
              checked={showScoutPath}
              disabled={scoutWaypoints.length === 0}
              onCheckedChange={(v) => setShowScoutPath(v === true)}
            />
            <Label htmlFor="cv-show-scout">Scout</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="cv-show-delta"
              checked={showDelta}
              disabled={!startDelta}
              onCheckedChange={(v) => setShowDelta(v === true)}
            />
            <Label htmlFor="cv-show-delta">Start Δ</Label>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg border border-border bg-muted/30 aspect-2/1"
      >
        <div className={cn('absolute inset-0', isFieldRotated && 'rotate-180')}>
          <img
            src={fieldImage}
            alt="2026 Field"
            className="h-full w-full object-fill opacity-90"
          />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        </div>

        {cvAutoPath.length === 0 && scoutWaypoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40">
            <p className="text-sm text-muted-foreground">No path data for this match</p>
          </div>
        )}
      </div>

      {scoutWaypoints.length === 0 && cvAutoPath.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No scouted auto path for this match — showing CV only. Scout paths are never overwritten.
        </p>
      )}
    </div>
  );
}

export default CvPathOverlay;
