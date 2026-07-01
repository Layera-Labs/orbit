/**
 * Content library catalog (hybrid sourcing): background presets are pure data
 * (offline); emoji/sticker assets come from a CDN, cached into the project media
 * on use, with a small bundled starter set for offline. See `library.ts` for the
 * add path and `content/assets.ts` for the CDN/bundled resolution.
 */
import type { Background } from '../model/types';

export type BgPreset = { id: string; label: string; bg: Background };

/** Curated gradients — rendered identically by the engine (backgroundToSVG). */
export const GRADIENT_PRESETS: BgPreset[] = [
  { id: 'sunset', label: 'Sunset', bg: { type: 'gradient', from: '#ff7e5f', to: '#feb47b', angle: 135 } },
  { id: 'ocean', label: 'Ocean', bg: { type: 'gradient', from: '#2193b0', to: '#6dd5ed', angle: 135 } },
  { id: 'grape', label: 'Grape', bg: { type: 'gradient', from: '#6a11cb', to: '#2575fc', angle: 135 } },
  { id: 'peach', label: 'Peach', bg: { type: 'gradient', from: '#ffecd2', to: '#fcb69f', angle: 135 } },
  { id: 'mint', label: 'Mint', bg: { type: 'gradient', from: '#00b09b', to: '#96c93d', angle: 135 } },
  { id: 'candy', label: 'Candy', bg: { type: 'gradient', from: '#ff9a9e', to: '#fecfef', angle: 135 } },
  { id: 'night', label: 'Night', bg: { type: 'gradient', from: '#0f2027', to: '#2c5364', angle: 135 } },
  { id: 'ember', label: 'Ember', bg: { type: 'gradient', from: '#f83600', to: '#f9d423', angle: 135 } },
  { id: 'violet', label: 'Violet', bg: { type: 'gradient', from: '#c471f5', to: '#fa71cd', angle: 135 } },
  { id: 'sky', label: 'Sky', bg: { type: 'gradient', from: '#a1c4fd', to: '#c2e9fb', angle: 135 } },
  { id: 'lush', label: 'Lush', bg: { type: 'gradient', from: '#56ab2f', to: '#a8e063', angle: 135 } },
  { id: 'plum', label: 'Plum', bg: { type: 'gradient', from: '#42275a', to: '#734b6d', angle: 135 } },
];

/** Solid colour palette. */
export const SOLID_PRESETS: BgPreset[] = [
  '#000000', '#ffffff', '#101018', '#1f2933', '#6d4aff', '#2f7bff', '#15b8a6', '#f2c14e', '#ff6b6b', '#ff8fab', '#c04af0', '#0e7c66',
].map((c) => ({ id: `solid-${c}`, label: c, bg: { type: 'color', color: c } as Background }));
