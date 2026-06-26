/**
 * Canonical colour-grade presets + their ffmpeg mapping. A preset is a set of
 * numeric params; `resolveFilter` merges preset + explicit overrides + intensity
 * into final params, and `filterToFFmpeg` turns those into an `eq`/
 * `colortemperature` chain. The mobile Skia preview mirrors these same params as
 * a colour matrix so the on-device preview matches the export.
 */
import type { ClipFilter } from './types';

export interface FilterParams {
  brightness: number; // -1..1
  contrast: number; //   0..2
  saturation: number; // 0..3
  temperature: number; // -1 (cool) .. 1 (warm)
}

export const NEUTRAL: FilterParams = { brightness: 0, contrast: 1, saturation: 1, temperature: 0 };

export const FILTER_PRESETS: Record<string, FilterParams> = {
  none: { ...NEUTRAL },
  vivid: { brightness: 0.03, contrast: 1.15, saturation: 1.4, temperature: 0 },
  warm: { brightness: 0.02, contrast: 1.05, saturation: 1.1, temperature: 0.35 },
  cool: { brightness: 0.0, contrast: 1.05, saturation: 1.05, temperature: -0.35 },
  mono: { brightness: 0.0, contrast: 1.1, saturation: 0, temperature: 0 },
  fade: { brightness: 0.06, contrast: 0.85, saturation: 0.85, temperature: 0.08 },
  film: { brightness: -0.02, contrast: 1.2, saturation: 0.9, temperature: 0.12 },
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Merge preset + explicit overrides + intensity into final params. */
export function resolveFilter(f?: ClipFilter): FilterParams {
  if (!f) return { ...NEUTRAL };
  const base = f.preset ? FILTER_PRESETS[f.preset] ?? NEUTRAL : NEUTRAL;
  const target: FilterParams = {
    brightness: f.brightness ?? base.brightness,
    contrast: f.contrast ?? base.contrast,
    saturation: f.saturation ?? base.saturation,
    temperature: f.temperature ?? base.temperature,
  };
  const k = f.intensity ?? 1;
  return {
    brightness: round(NEUTRAL.brightness + (target.brightness - NEUTRAL.brightness) * k),
    contrast: round(NEUTRAL.contrast + (target.contrast - NEUTRAL.contrast) * k),
    saturation: round(NEUTRAL.saturation + (target.saturation - NEUTRAL.saturation) * k),
    temperature: round(NEUTRAL.temperature + (target.temperature - NEUTRAL.temperature) * k),
  };
}

export function isNeutral(p: FilterParams): boolean {
  return p.brightness === 0 && p.contrast === 1 && p.saturation === 1 && p.temperature === 0;
}

/** ffmpeg video filter chain for a clip filter, WITH a trailing comma; '' if neutral. */
export function filterToFFmpeg(f?: ClipFilter): string {
  const p = resolveFilter(f);
  if (isNeutral(p)) return '';
  const parts = [`eq=brightness=${p.brightness}:contrast=${p.contrast}:saturation=${p.saturation}`];
  if (p.temperature !== 0) {
    // ffmpeg colortemperature: lower Kelvin = warmer. 6500 = neutral.
    parts.push(`colortemperature=temperature=${Math.round(6500 - p.temperature * 2500)}`);
  }
  return `${parts.join(',')},`;
}

/**
 * `atempo` only accepts 0.5..2.0, so chain factors for larger speed changes.
 * Returns e.g. `atempo=2.0,atempo=1.5` for 3×, or '' for speed 1.
 */
export function atempoChain(speed: number): string {
  if (!speed || speed === 1) return '';
  let s = speed;
  const factors: number[] = [];
  while (s > 2.0) {
    factors.push(2.0);
    s /= 2.0;
  }
  while (s < 0.5) {
    factors.push(0.5);
    s /= 0.5;
  }
  factors.push(round(s));
  return factors.map((f) => `atempo=${f}`).join(',');
}
