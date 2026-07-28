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

/*
 * BT.601 luma weights, NOT Rec.709 — see `gradeMatrix` below for why the whole
 * grade is computed in 601's YUV.
 */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

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

/** The Kelvin `colortemperature` is driven at. Lower = warmer; 6500 = daylight. */
export function temperatureKelvin(temperature: number): number {
  return Math.round(6500 - temperature * 2500);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * ffmpeg's `kelvin2rgb` (vf_colortemperature.c) — the Tanner Helland black-body
 * approximation. Ported rather than approximated because `colortemperature`
 * turns out to be a plain per-channel gain, which means the browser preview can
 * reproduce it EXACTLY inside the grade's colour matrix instead of guessing.
 *
 * Verified against this ffmpeg build at 4000/5000/6500/8000/9000 K over eight
 * probe colours: every channel agrees. ffmpeg truncates to uint8 where a canvas
 * matrix rounds, so single values can differ by 1/255 — below the h264 noise
 * floor the export already carries.
 */
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
    kelvin >= 66 ? 1 : kelvin <= 19 ? 0 : clamp01(0.54320678911019607843 * Math.log(kelvin - 10) - 1.19625408914);
  return [r, g, b];
}

/**
 * Per-channel RGB gain for a temperature in our -1..1 units.
 *
 * Identity at 0 — deliberately, and not the same as `kelvinToGains(6500)`, which
 * is (1, 0.9965, 0.9806). `filterToFFmpeg` omits the filter entirely at 0, so a
 * neutral grade must be a true no-op here too or the preview would tint where
 * the export does not.
 */
export function temperatureGains(temperature: number): [number, number, number] {
  if (!temperature) return [1, 1, 1];
  return kelvinToGains(temperatureKelvin(temperature));
}

/*
 * ---- The grade as a colour matrix, the way `eq` actually computes it ----
 *
 * `eq` never touches RGB. It works on the DECODED YUV PLANES: it runs a LUT over
 * luma (`v' = contrast·(v − 0.5) + 0.5 + brightness`, `v` being the raw plane
 * byte over 255) and the same LUT shape with `contrast = saturation` and no
 * brightness over each chroma plane, which scales chroma about neutral.
 *
 * Every step of that is AFFINE, and so are the conversions either side of it, so
 * the whole chain collapses into one 4×5 colour matrix that both previews can
 * apply directly — no approximation, no second pass.
 *
 * This replaced a version that applied contrast and saturation to the R, G and B
 * channels independently. On mid-tones the two agree; on SATURATED colour they
 * do not, because scaling a channel that is already near an extreme is nothing
 * like scaling the luma that channel contributes to. Measured against a real MP4
 * (2026-07-28), that cost up to 25/255 on a saturated red under `film`.
 *
 * THE ONE ASSUMPTION: BT.601, limited range — what an SD `yuv420p` stream from
 * x264 carries, and what the browser converts back with. HD sources are normally
 * tagged 709, and for those this is again an approximation: the browser hands us
 * RGB decoded with the 709 matrix while `eq` scaled 709-coded planes. Nothing in
 * either preview can see the stream's tagging, so there is no better default —
 * and 601 is the one that measures closer here (with 709 coefficients `mono` was
 * off by 39/255; the current set puts it at 3).
 */
const KY = 219 / 255;
const OY = 16 / 255;
const KC = 224 / 255;
const OC = 128 / 255;

/** RGB (0..1) → eq → RGB, unclamped. Affine, which is what makes the matrix exact. */
function eqApply(
  rgb: [number, number, number],
  p: FilterParams,
): [number, number, number] {
  const [r, g, b] = rgb;
  const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;

  // Forward: the limited-range 601 planes ffmpeg is handed.
  let y = KY * luma + OY;
  let cb = (KC * (b - luma)) / 1.772 + OC;
  let cr = (KC * (r - luma)) / 1.402 + OC;

  // `eq` itself: contrast + brightness on luma, saturation on chroma.
  y = p.contrast * (y - 0.5) + 0.5 + p.brightness;
  cb = p.saturation * (cb - 0.5) + 0.5;
  cr = p.saturation * (cr - 0.5) + 0.5;

  // Back to RGB.
  const l2 = (y - OY) / KY;
  const r2 = l2 + (1.402 * (cr - OC)) / KC;
  const b2 = l2 + (1.772 * (cb - OC)) / KC;
  const g2 = (l2 - LUMA_R * r2 - LUMA_B * b2) / LUMA_G;
  return [r2, g2, b2];
}

/**
 * The grade as a 4×5 row-major colour matrix over channels in 0..1 — the form
 * both an SVG `feColorMatrix` and Skia's `<ColorMatrix>` take.
 *
 * Recovered by evaluating the affine chain on the origin and the three basis
 * colours rather than by multiplying the conversions out by hand: same result,
 * no algebra to get wrong, and it stays right if `eqApply` ever gains a step.
 *
 * `colortemperature` runs AFTER `eq` in the export chain and is a plain
 * per-channel gain (see `temperatureGains`), so it is the diagonal applied to
 * each finished row, offset column included.
 */
export function gradeMatrix(p: FilterParams): number[] {
  const o = eqApply([0, 0, 0], p);
  const cr = eqApply([1, 0, 0], p);
  const cg = eqApply([0, 1, 0], p);
  const cb = eqApply([0, 0, 1], p);
  const gains = temperatureGains(p.temperature);

  const m: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const gain = gains[i];
    m.push(
      (cr[i] - o[i]) * gain,
      (cg[i] - o[i]) * gain,
      (cb[i] - o[i]) * gain,
      0,
      o[i] * gain,
    );
  }
  m.push(0, 0, 0, 1, 0);
  return m;
}

/** ffmpeg video filter chain for a clip filter, WITH a trailing comma; '' if neutral. */
export function filterToFFmpeg(f?: ClipFilter): string {
  const p = resolveFilter(f);
  if (isNeutral(p)) return '';
  const parts = [`eq=brightness=${p.brightness}:contrast=${p.contrast}:saturation=${p.saturation}`];
  if (p.temperature !== 0) {
    parts.push(`colortemperature=temperature=${temperatureKelvin(p.temperature)}`);
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
