/**
 * Chroma-key (background removal). The same `ChromaKey` drives the Skia preview
 * (a runtime shader keying per-pixel) and this ffmpeg `colorkey` for export, so
 * a green-screen keyed live looks the same in the rendered MP4.
 */
import type { ChromaKey } from './types';

/** Parse `#rgb` / `#rrggbb` to 0..255 components (defaults to green on garbage). */
export function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [0, 212, 0];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** ffmpeg `colorkey` for a chroma key (operates on an rgba clip), or '' for no-op. */
export function chromaToFFmpeg(c: ChromaKey | undefined): string {
  if (!c || !c.color) return '';
  const [r, g, b] = hexToRgb(c.color);
  const hex = `0x${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const similarity = Math.max(0.01, clamp01(c.similarity ?? 0.3));
  const blend = clamp01(c.smoothness ?? 0.1);
  return `colorkey=color=${hex}:similarity=${similarity}:blend=${blend}`;
}
