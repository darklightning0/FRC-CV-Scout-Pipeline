/**
 * Multi-layer CV trail on the Maneuver field (absolute blue-left coords).
 * Supports phase colors, multi-match overlays, and a simple time scrubber.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import fieldImage from '@/game-template/assets/2026-field.png';
import { Button } from '@/core/components/ui/button';
import { Checkbox } from '@/core/components/ui/checkbox';
import { Label } from '@/core/components/ui/label';
import { Slider } from '@/core/components/ui/slider';
import { cn } from '@/core/lib/utils';
import type { CvFieldPoint } from '@/core/types/cv-telemetry';
import { Pause, Play } from 'lucide-react';

export type CvTrailLayer = {
  id: string;
  label: string;
  color: string;
  points: CvFieldPoint[];
  /** When false, drawn thinner / lower opacity */
  emphasis?: boolean;
};

type CvTrailCanvasProps = {
  layers: CvTrailLayer[];
  className?: string;
  /** Enable playhead scrubbing across all points with timeSec */
  enableReplay?: boolean;
  title?: string;
};

const PHASE_PRESETS = [
  { id: 'auto', label: 'Auto', color: '#22d3ee' },
  { id: 'teleop', label: 'Teleop', color: '#a78bfa' },
  { id: 'endgame', label: 'Endgame', color: '#f59e0b' },
] as const;

export function CvTrailCanvas({
  layers,
  className = '',
  enableReplay = true,
  title,
}: CvTrailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(layers.map((l) => [l.id, true]))
  );
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1); // 0–1 of max time

  const maxTime = useMemo(() => {
    let max = 0;
    for (const layer of layers) {
      for (const p of layer.points) {
        if (p.timeSec > max) max = p.timeSec;
      }
    }
    return Math.max(max, 1);
  }, [layers]);

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
    const started = performance.now();
    const startProgress = progress;
    const durationMs = Math.max(4000, maxTime * 40);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, startProgress + (now - started) / durationMs);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // intentionally not depending on progress — restart only when play toggled on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, maxTime]);

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

    const cutoff = progress * maxTime;

    for (const layer of layers) {
      if (!visible[layer.id]) continue;
      const pts = enableReplay
        ? layer.points.filter((p) => p.timeSec <= cutoff + 0.01)
        : layer.points;
      if (pts.length < 1) continue;

      const thick = layer.emphasis === false ? 1.5 : 2.5;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = thick;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = layer.emphasis === false ? 0.45 : 0.9;

      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x * width, pts[0]!.y * height);
        for (let i = 1; i < pts.length; i += 1) {
          ctx.lineTo(pts[i]!.x * width, pts[i]!.y * height);
        }
        ctx.stroke();
      }

      const last = pts[pts.length - 1]!;
      ctx.globalAlpha = 1;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.arc(last.x * width, last.y * height, layer.emphasis === false ? 3 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (pts[0]) {
        ctx.beginPath();
        ctx.arc(pts[0].x * width, pts[0].y * height, 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }, [layers, visible, progress, maxTime, enableReplay]);

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
              if (progress >= 0.999) setProgress(0);
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
            step={0.01}
            onValueChange={(v) => {
              setPlaying(false);
              setProgress(v[0] ?? 0);
            }}
            className="flex-1"
          />
          <span className="w-14 text-right font-mono text-xs text-muted-foreground">
            {(progress * maxTime).toFixed(0)}s
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
}): CvTrailLayer[] {
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
      color: preset.color,
      points,
      emphasis: true,
    };
  }).filter((l) => l.points.length > 0);
}

export default CvTrailCanvas;
