/**
 * Cached field background for CV canvases — avoids black flash from
 * clearRect + async Image() reload on every React effect run.
 */

import fieldImageUrl from '@/game-template/assets/2026-field.png';

let cached: HTMLImageElement | null = null;
let loadPromise: Promise<HTMLImageElement> | null = null;

export function getFieldBackgroundImage(): Promise<HTMLImageElement> {
  if (cached?.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cached = img;
      resolve(img);
    };
    img.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load field background'));
    };
    img.src = fieldImageUrl;
    if (img.complete && img.naturalWidth > 0) {
      cached = img;
      resolve(img);
    }
  });
  return loadPromise;
}

export function drawFieldBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  img: HTMLImageElement
) {
  ctx.drawImage(img, 0, 0, width, height);
}
