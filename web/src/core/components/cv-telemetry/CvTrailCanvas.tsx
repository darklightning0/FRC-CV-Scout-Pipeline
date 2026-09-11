/**
 * Multi-layer CV trail on the Hunter Eyes field (absolute blue-left coords).
 * Y is flipped to match meter-space telemetry and Python heatmaps.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import fieldImage from '@/game-template/assets/2026-field.png';
import { Button } from '@/core/components/ui/button';
import { Checkbox } from '@/core/components/ui/checkbox';
import { Label } from '@/core/components/ui/label';
import { Slider } from '@/core/components/ui/slider';
import { cn } from '@/core/lib/utils';
import {
  BLUE_ALLIANCE_HUES,
  RED_ALLIANCE_HUES,
  cvNormToCanvas,
  smoothCvPoints,
} from '@/core/lib/cvFieldCoords';
import type { CvFieldPoint } from '@/core/types/cv-telemetry';
import { Pause, Play } from 'lucide-react';

export type CvTrailLayer = {
  id: string;
  label: string;
  color: string;
  points: CvFieldPoint[];
  emphasis?: boolean;
  /** Playback speed for this layer's time domain (1 = realtime, 2 = 2×) */
  playbackRate?: number;
};

type CvTrailCanvasProps = {
  layers: CvTrailLayer[];
  className?: string;
  enableReplay?: boolean;
  title?: string;
  /** Default speed when layers don't set playbackRate */
  defaultPlaybackRate?: number;
};

const PHASE_PRESETS = [
  { id: 'auto', label: 'Auto', hueIndex: 0, playbackRate: 1 },
  { id: 'teleop', label: 'Teleop', hueIndex: 1, playbackRate: 2 },
  { id: 'endgame', label: 'Endgame', hueIndex: 2, playbackRate: 1 },
] as const;

export function CvTrailCanvas({
  layers,
  className = '',
  enableReplay = true,
  title,
  defaultPlaybackRate = 1,
}: CvTrailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(layers.map((l) => [l.id, true]))
  );
  const [playing, setPlaying] = useState(false);
  const [timeSec, setTimeSec] = useState(0);

  const { minTime, maxTime, playbackRate } = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    let rate = defaultPlaybackRate;
    for (const layer of layers) {
      if (layer.playbackRate && layer.playbackRate > 0) rate = layer.playbackRate;
      for (const p of layer.points) {
        if (p.timeSec < min) min = p.timeSec;
        if (p.timeSec > max) max = p.timeSec;
      }
    }
    if (!Number.isFinite(min)) min = 0;
    return { minTime: min, maxTime: Math.max(max, min + 1), playbackRate: rate };
  }, [layers, defaultPlaybackRate]);

  // Reset playhead when layers change
  useEffect(() => {
    setTimeSec(minTime);
    setPlaying(false);
  }, [minTime, maxTime]);

  useEffect(() => {
    setVisible((prev) => {
      const next = { ...prev };
      for (const l of layers) {
        if (next[l.id] === undefined) next[l.id] = true;
      }
      return next;
    });
  }, [layers]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTimeSec((prev) => {
        const next = prev + dt * playbackRate;
        if (next >= maxTime) {
          setPlaying(false);
          return maxTime;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, playbackRate, maxTime]);

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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    for (const layer of layers) {
      if (!visible[layer.id]) continue;
      const raw = enableReplay
        ? layer.points.filter((p) => p.timeSec <= timeSec + 0.01)
        : layer.points;
      const pts = smoothCvPoints(raw, 5);
      if (pts.length < 1) continue;

      const thick = layer.emphasis === false ? 1.5 : 2.5;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = thick;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = layer.emphasis === false ? 0.45 : 0.9;

      if (pts.length >= 2) {
        ctx.beginPath();
        const first = cvNormToCanvas(pts[0]!.x, pts[0]!.y, width, height);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length; i += 1) {
          const p = cvNormToCanvas(pts[i]!.x, pts[i]!.y, width, height);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      const lastPt = pts[pts.length - 1]!;
      const lastPx = cvNormToCanvas(lastPt.x, lastPt.y, width, height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.arc(lastPx.x, lastPx.y, layer.emphasis === false ? 3 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (pts[0]) {
        const startPx = cvNormToCanvas(pts[0].x, pts[0].y, width, height);
        ctx.beginPath();
        ctx.arc(startPx.x, startPx.y, 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }, [layers, visible, timeSec, enableReplay]);

  const span = Math.max(0.001, maxTime - minTime);
  const progress = Math.min(1, Math.max(0, (timeSec - minTime) / span));

  return (
    <div className={cn('space-y-3', className)}>
      {title && <p className="text-sm font-medium">{title}</p>}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg border border-border bg-muted/30 aspect-2/1"
      >
        <img src={fieldImage} alt="" className="absolute inset-0 h-full w-full object-fill opacity-90" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      <div className="flex flex-wrap gap-3">
        {layers.map((layer) => (
          <div key={layer.id} className="flex items-center gap-2 text-xs">
            <Checkbox
              id={`trail-${layer.id}`}
              checked={visible[layer.id] !== false}
              onCheckedChange={(v) =>
                setVisible((prev) => ({ ...prev, [layer.id]: v === true }))
              }
            />
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: layer.color }}
            />
            <Label htmlFor={`trail-${layer.id}`}>{layer.label}</Label>
          </div>
        ))}
      </div>

      {enableReplay && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            onClick={() => {
              if (timeSec >= maxTime - 0.05) setTimeSec(minTime);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Pause' : 'Replay'}
          </Button>
          <Slider
            value={[progress]}
            min={0}
            max={1}
            step={0.001}
            onValueChange={(v) => {
              setPlaying(false);
              setTimeSec(minTime + (v[0] ?? 0) * span);
            }}
            className="flex-1"
          />
          <span className="w-20 text-right font-mono text-xs text-muted-foreground">
            {timeSec.toFixed(1)}s
            {playbackRate !== 1 ? ` · ${playbackRate}×` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

export function phaseLayersFromPaths(opts: {
  auto?: CvFieldPoint[];
  teleop?: CvFieldPoint[];
  endgame?: CvFieldPoint[];
  alliance?: 'red' | 'blue' | 'unknown';
}): CvTrailLayer[] {
  const hues = opts.alliance === 'red' ? RED_ALLIANCE_HUES : BLUE_ALLIANCE_HUES;
  return PHASE_PRESETS.map((preset) => {
    const points =
      preset.id === 'auto'
        ? opts.auto ?? []
        : preset.id === 'teleop'
          ? opts.teleop ?? []
          : opts.endgame ?? [];
    return {
      id: preset.id,
      label: preset.label,
      color: hues[preset.hueIndex]!,
      points,
      emphasis: true,
      playbackRate: preset.playbackRate,
    };
  }).filter((l) => l.points.length > 0);
}

export default CvTrailCanvas;
