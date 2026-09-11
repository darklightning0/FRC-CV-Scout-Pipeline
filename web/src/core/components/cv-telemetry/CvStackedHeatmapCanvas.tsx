/**
 * Client-side stacked alliance heatmap — density only (no scribble polylines).
 * Y flipped to match Python heatmaps / meter-space telemetry.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/core/lib/utils';
import { cvNormToCanvas } from '@/core/lib/cvFieldCoords';
import { getFieldBackgroundImage } from '@/core/lib/cvFieldImage';
import type { CvFieldPoint } from '@/core/types/cv-telemetry';

export type StackedHeatLayer = {
  id: string;
  label: string;
  color: string;
  points: CvFieldPoint[];
};

type CvStackedHeatmapCanvasProps = {
  layers: StackedHeatLayer[];
  className?: string;
  title?: string;
};

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function CvStackedHeatmapCanvas({
  layers,
  className,
  title,
}: CvStackedHeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      ctx.drawImage(img, 0, 0, width, height);

      const cols = 96;
      const rows = 48;
      const cellW = width / cols;
      const cellH = height / rows;

      for (const layer of layers) {
        if (layer.points.length < 4) continue;
        const grid = new Float32Array(cols * rows);
        for (const p of layer.points) {
          const px = cvNormToCanvas(p.x, p.y, width, height);
          const cx = Math.min(cols - 1, Math.max(0, Math.floor(px.x / cellW)));
          const cy = Math.min(rows - 1, Math.max(0, Math.floor(px.y / cellH)));
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const x = cx + dx;
              const y = cy + dy;
              if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
              const dist = Math.hypot(dx, dy);
              grid[y * cols + x]! += dist === 0 ? 1 : 0.45 / (1 + dist);
            }
          }
        }
        let max = 0;
        for (let i = 0; i < grid.length; i++) max = Math.max(max, grid[i]!);
        if (max <= 0) continue;
        const [r, g, b] = hexToRgb(layer.color);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const v = grid[y * cols + x]! / max;
            if (v < 0.12) continue;
            ctx.fillStyle = `rgba(${r},${g},${b},${0.1 + v * 0.5})`;
            ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
          }
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [layers]);

  const usable = layers.filter((l) => l.points.length >= 4);
  if (usable.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {title && <div className="text-sm font-medium">{title}</div>}
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg border bg-muted/20">
        <canvas ref={canvasRef} className="block w-full" />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {usable.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
