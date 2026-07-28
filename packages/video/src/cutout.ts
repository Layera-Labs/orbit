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

export interface ChromaParams {
  /** Key colour, 0..1 per channel. */
  key: [number, number, number];
  similarity: number;
  blend: number;
}

/**
 * The clamped numbers `colorkey` is actually driven with.
 *
 * Extracted so the browser preview keys on the SAME values as the export rather
 * than re-deriving them — the `max(0.01, …)` floor on similarity in particular
 * is easy to forget and would shift every edge in the matte.
 */
export function chromaParams(c: ChromaKey | undefined): ChromaParams | null {
  if (!c || !c.color) return null;
  const [r, g, b] = hexToRgb(c.color);
  return {
    key: [r / 255, g / 255, b / 255],
    similarity: Math.max(0.01, clamp01(c.similarity ?? 0.3)),
    blend: clamp01(c.smoothness ?? 0.1),
  };
}

/**
 * Alpha for one pixel, in ffmpeg's own terms (`do_colorkey_pixel`).
 *
 * Verified against this ffmpeg build over eight probe colours at three
 * similarity/blend settings: every byte matches. The browser runs this as a
 * fragment shader; this reference copy is what the tests pin.
 */
export function chromaAlphaAt(p: ChromaParams, r: number, g: number, b: number): number {
  const dr = r - p.key[0];
  const dg = g - p.key[1];
  const db = b - p.key[2];
  const diff = Math.sqrt((dr * dr + dg * dg + db * db) / 3);
  if (p.blend > 0.0001) return clamp01((diff - p.similarity) / p.blend);
  return diff > p.similarity ? 1 : 0;
}

/** ffmpeg `colorkey` for a chroma key (operates on an rgba clip), or '' for no-op. */
export function chromaToFFmpeg(c: ChromaKey | undefined): string {
  const p = chromaParams(c);
  if (!p) return '';
  const hex = `0x${p.key
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')}`;
  return `colorkey=color=${hex}:similarity=${p.similarity}:blend=${p.blend}`;
}
