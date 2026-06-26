/**
 * Filter registry for the live Skia preview. Presets mirror the engine's
 * FILTER_PRESETS (packages/video/filters.ts) so the on-device grade matches the
 * ffmpeg export. Each grade resolves to params {brightness,contrast,saturation,
 * temperature}, then to a 4×5 colour matrix for Skia's <ColorMatrix>.
 */
import type { ClipFilter } from '../model/types';

export interface FilterParams {
  brightness: number; // -1..1
  contrast: number; //   0..2
  saturation: number; // 0..3
  temperature: number; // -1 (cool) .. 1 (warm)
}

const NEUTRAL: FilterParams = { brightness: 0, contrast: 1, saturation: 1, temperature: 0 };

export const FILTER_PRESETS: Record<string, FilterParams> = {
  none: { ...NEUTRAL },
  vivid: { brightness: 0.03, contrast: 1.15, saturation: 1.4, temperature: 0 },
  warm: { brightness: 0.02, contrast: 1.05, saturation: 1.1, temperature: 0.35 },
  cool: { brightness: 0.0, contrast: 1.05, saturation: 1.05, temperature: -0.35 },
  mono: { brightness: 0.0, contrast: 1.1, saturation: 0, temperature: 0 },
  fade: { brightness: 0.06, contrast: 0.85, saturation: 0.85, temperature: 0.08 },
  film: { brightness: -0.02, contrast: 1.2, saturation: 0.9, temperature: 0.12 },
};

/** Order shown in the Filter sheet. */
export const FILTER_LIST: { key: string; label: string }[] = [
  { key: 'none', label: 'Original' },
  { key: 'vivid', label: 'Vivid' },
  { key: 'warm', label: 'Warm' },
  { key: 'cool', label: 'Cool' },
  { key: 'mono', label: 'Mono' },
  { key: 'fade', label: 'Fade' },
  { key: 'film', label: 'Film' },
];

export function resolveParams(f?: ClipFilter): FilterParams {
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
    brightness: NEUTRAL.brightness + (target.brightness - NEUTRAL.brightness) * k,
    contrast: NEUTRAL.contrast + (target.contrast - NEUTRAL.contrast) * k,
    saturation: NEUTRAL.saturation + (target.saturation - NEUTRAL.saturation) * k,
    temperature: NEUTRAL.temperature + (target.temperature - NEUTRAL.temperature) * k,
  };
}

export function isNeutral(f?: ClipFilter): boolean {
  const p = resolveParams(f);
  return p.brightness === 0 && p.contrast === 1 && p.saturation === 1 && p.temperature === 0;
}

// ---- colour-matrix math (4×5 row-major, channels in 0..1) ----

type Mat = number[]; // 20 values
const IDENTITY: Mat = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Multiply two 4×5 colour matrices (a then b applied to a colour → b∘a). */
function mul(a: Mat, b: Mat): Mat {
  const A = [...a, 0, 0, 0, 0, 1];
  const B = [...b, 0, 0, 0, 0, 1];
  const out = new Array(25).fill(0);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    let s = 0;
    for (let k = 0; k < 5; k++) s += A[r * 5 + k] * B[k * 5 + c];
    out[r * 5 + c] = s;
  }
  return out.slice(0, 20);
}

function brightnessMat(b: number): Mat {
  return [1, 0, 0, 0, b, 0, 1, 0, 0, b, 0, 0, 1, 0, b, 0, 0, 0, 1, 0];
}
function contrastMat(c: number): Mat {
  const o = 0.5 - 0.5 * c;
  return [c, 0, 0, 0, o, 0, c, 0, 0, o, 0, 0, c, 0, o, 0, 0, 0, 1, 0];
}
function saturationMat(s: number): Mat {
  const lr = 0.2126, lg = 0.7152, lb = 0.0722;
  const inv = 1 - s;
  return [
    lr * inv + s, lg * inv, lb * inv, 0, 0,
    lr * inv, lg * inv + s, lb * inv, 0, 0,
    lr * inv, lg * inv, lb * inv + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}
function temperatureMat(t: number): Mat {
  const rg = 1 + 0.15 * t;
  const bg = 1 - 0.15 * t;
  return [rg, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, bg, 0, 0, 0, 0, 0, 1, 0];
}

/** Final colour matrix for a clip filter (null if neutral → no <ColorMatrix>). */
export function colorMatrix(f?: ClipFilter): Mat | null {
  if (isNeutral(f)) return null;
  const p = resolveParams(f);
  // applied to colour in order: saturation → contrast → brightness → temperature
  return mul(temperatureMat(p.temperature), mul(brightnessMat(p.brightness), mul(contrastMat(p.contrast), saturationMat(p.saturation))));
}

export { IDENTITY };
