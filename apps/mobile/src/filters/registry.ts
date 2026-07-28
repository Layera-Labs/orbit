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

/*
 * MIRRORED from `gradeMatrix` in packages/video/src/filters.ts — keep in step.
 * (Mobile is outside the pnpm workspace and cannot import @orbit/video; the same
 * rule that makes it vendor the model applies here.)
 *
 * What this replaced, and why it mattered: three matrices multiplied together,
 * applying brightness, contrast and Rec.709 saturation to the R, G and B
 * channels independently, plus a ±0.15·t stand-in for temperature. `eq` does
 * none of that. It runs on the DECODED YUV PLANES — contrast and brightness over
 * luma, saturation over chroma — and `colortemperature` is a measured
 * per-channel gain, not a linear guess.
 *
 * Measured against a real exported MP4 (2026-07-28) the per-channel version was
 * out by up to 25/255 on saturated colour; this lands within 6 for every preset
 * but `vivid`, which reaches 10 because high saturation amplifies the 8-bit
 * round trip. The old temperature curve was additionally wrong in its own right.
 *
 * Assumes BT.601 limited range, which is what an SD yuv420p stream carries.
 */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;
const KY = 219 / 255;
const OY = 16 / 255;
const KC = 224 / 255;
const OC = 128 / 255;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** ffmpeg's `kelvin2rgb` (vf_colortemperature.c), ported exactly. */
function kelvinToGains(k: number): [number, number, number] {
  const kelvin = k / 100;
  let r: number;
  let g: number;
  if (kelvin <= 66) {
    r = 1;
    g = clamp01(0.39008157876901960784 * Math.log(kelvin) - 0.63184144378862745098);
  } else {
    const t = Math.max(kelvin - 60, 0);
    r = clamp01(1.29293618606274509804 * Math.pow(t, -0.1332047592));
    g = clamp01(1.12989086089529411765 * Math.pow(t, -0.0755148492));
  }
  const b =
    kelvin >= 66
      ? 1
      : kelvin <= 19
        ? 0
        : clamp01(0.54320678911019607843 * Math.log(kelvin - 10) - 1.19625408914);
  return [r, g, b];
}

/** Identity at 0 — the export omits the filter entirely there. */
function temperatureGains(temperature: number): [number, number, number] {
  if (!temperature) return [1, 1, 1];
  return kelvinToGains(Math.round(6500 - temperature * 2500));
}

/** RGB (0..1) → eq → RGB, unclamped. Affine, which is what makes the matrix exact. */
function eqApply(rgb: [number, number, number], p: FilterParams): [number, number, number] {
  const [r, g, b] = rgb;
  const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;

  let y = KY * luma + OY;
  let cb = (KC * (b - luma)) / 1.772 + OC;
  let cr = (KC * (r - luma)) / 1.402 + OC;

  y = p.contrast * (y - 0.5) + 0.5 + p.brightness;
  cb = p.saturation * (cb - 0.5) + 0.5;
  cr = p.saturation * (cr - 0.5) + 0.5;

  const l2 = (y - OY) / KY;
  const r2 = l2 + (1.402 * (cr - OC)) / KC;
  const b2 = l2 + (1.772 * (cb - OC)) / KC;
  const g2 = (l2 - LUMA_R * r2 - LUMA_B * b2) / LUMA_G;
  return [r2, g2, b2];
}

/** Final colour matrix for a clip filter (null if neutral → no <ColorMatrix>). */
export function colorMatrix(f?: ClipFilter): Mat | null {
  if (isNeutral(f)) return null;
  const p = resolveParams(f);

  // Recovered by evaluating the affine chain on the origin and the three basis
  // colours, so there is no algebra here to get wrong.
  const o = eqApply([0, 0, 0], p);
  const cr = eqApply([1, 0, 0], p);
  const cg = eqApply([0, 1, 0], p);
  const cb = eqApply([0, 0, 1], p);
  const gains = temperatureGains(p.temperature);

  const m: Mat = [];
  for (let i = 0; i < 3; i += 1) {
    const gain = gains[i];
    m.push((cr[i] - o[i]) * gain, (cg[i] - o[i]) * gain, (cb[i] - o[i]) * gain, 0, o[i] * gain);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
}

export { IDENTITY };
