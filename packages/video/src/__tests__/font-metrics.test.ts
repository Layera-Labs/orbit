/**
 * The font metrics parser, checked against an independent oracle.
 *
 * The parser reads advance widths out of `hmtx`. resvg lays the same string out
 * with the same file and reports the painted extent. Those are two different
 * questions asked of one artifact, so agreement between them is real evidence —
 * unlike `overlay-box.test.ts`, which compares two functions that share a
 * constant and therefore cannot fail.
 *
 * **Advance width is not ink width, and the difference is the whole subtlety.**
 * An advance includes the glyph's left and right side bearings — the designed
 * whitespace either side of the mark — while resvg's bbox reports only where
 * paint actually landed. So the advance sum is always slightly LARGER, by
 * however much bearing the first and last glyphs contribute. Measured across
 * the corpus that is 0.2%–6.4%, and the widest case is a run of `i`, which is
 * exactly right: `i` is a narrow mark in a comparatively wide advance.
 *
 * Advance is also the number a caption box wants. A box drawn to the ink would
 * clip the bearings and sit visibly tight against the text.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import {
  APPROX_EM_PER_CHAR,
  approximateMeasurer,
  measureLine,
  measurerFor,
  parseFontMetrics,
  wrapLines,
} from '../font-metrics';

const here = dirname(fileURLToPath(import.meta.url));
const FONT = join(here, 'fixtures/fonts/NotoSans-Regular.ttf');
const FAMILY = 'Noto Sans';

const metrics = parseFontMetrics(new Uint8Array(readFileSync(FONT)))!;

/** The independent oracle: what resvg actually painted. */
function inkWidth(text: string, fontSize: number): number {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="400">` +
    `<text font-family="${FAMILY}" font-size="${fontSize}" fill="#fff" text-anchor="middle" ` +
    `dominant-baseline="middle"><tspan x="2000" y="200">${text}</tspan></text></svg>`;
  const b = new Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles: [FONT], defaultFontFamily: FAMILY },
  }).getBBox();
  if (!b) throw new Error(`no bbox for ${JSON.stringify(text)}`);
  return b.width;
}

const CORPUS: [string, number][] = [
  ['Hello world', 64],
  ['The quick brown fox', 48],
  ['iiiiiiiiii', 64],
  ['WWWWWWWWWW', 64],
  ['A', 64],
  ['0123456789', 64],
  ['Orbit SDK', 96],
];

describe('parseFontMetrics', () => {
  it('reads the face', () => {
    expect(metrics.unitsPerEm).toBe(1000);
    expect(metrics.advances.size).toBeGreaterThan(100);
    expect(metrics.fallbackAdvance).toBeGreaterThan(0);
  });

  it('returns null on bytes that are not a font, rather than throwing', () => {
    // A render must not die because someone put a JPEG in the font directory.
    expect(parseFontMetrics(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(parseFontMetrics(new Uint8Array(0))).toBeNull();
  });
});

describe('measureLine against resvg', () => {
  it('sits just above the painted ink, never below it', () => {
    for (const [text, size] of CORPUS) {
      const ratio = measureLine(text, metrics, size) / inkWidth(text, size);
      // Below 1 would mean the box clips the glyphs; far above would mean the
      // advances are not being read correctly.
      expect(ratio, `${text} advance/ink`).toBeGreaterThanOrEqual(1);
      expect(ratio, `${text} advance/ink`).toBeLessThan(1.08);
    }
  });

  it('beats the flat 0.58em guess on every single string', () => {
    // The claim this whole module exists to make. Asserted rather than stated,
    // because "we replaced a guess with metrics" is only worth anything if the
    // numbers moved.
    const approx = approximateMeasurer();
    for (const [text, size] of CORPUS) {
      const ink = inkWidth(text, size);
      const metricErr = Math.abs(measureLine(text, metrics, size) - ink) / ink;
      const approxErr = Math.abs(approx(text, size) - ink) / ink;
      expect(metricErr, `${text}: metrics vs approximation`).toBeLessThanOrEqual(approxErr);
    }
  });

  it('is wrong by at most 7% where the guess is wrong by 139%', () => {
    const worstMetric = Math.max(
      ...CORPUS.map(([t, s]) => Math.abs(measureLine(t, metrics, s) - inkWidth(t, s)) / inkWidth(t, s)),
    );
    const approx = approximateMeasurer();
    const worstApprox = Math.max(
      ...CORPUS.map(([t, s]) => Math.abs(approx(t, s) - inkWidth(t, s)) / inkWidth(t, s)),
    );
    expect(worstMetric).toBeLessThan(0.07);
    expect(worstApprox).toBeGreaterThan(1.0);
  });

  it('scales linearly and applies letter spacing per character', () => {
    expect(measureLine('Hello', metrics, 64)).toBeCloseTo(measureLine('Hello', metrics, 32) * 2, 4);
    const spaced = measureLine('Hello', metrics, 64, 3);
    expect(spaced - measureLine('Hello', metrics, 64)).toBeCloseTo(5 * 3, 4);
  });

  it('counts by code point, not UTF-16 unit', () => {
    // An astral character is two UTF-16 units. Measuring per unit would charge
    // it two fallback advances and over-size every box containing an emoji.
    const astral = '\u{1F600}';
    expect(astral.length).toBe(2);
    expect(measureLine(astral, metrics, 64)).toBeCloseTo(
      (metrics.fallbackAdvance / metrics.unitsPerEm) * 64,
      4,
    );
  });
});

describe('wrapLines', () => {
  const measure = measurerFor(metrics);

  it('breaks greedily at the width', () => {
    const lines = wrapLines('The quick brown fox jumps over the lazy dog', 300, measure, 32);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l, 32), `"${l}"`).toBeLessThanOrEqual(300);
  });

  it('always breaks on an explicit newline', () => {
    // An author who typed a newline meant it; reflowing across it silently
    // rewrites their layout.
    expect(wrapLines('a\nb', 10_000, measure, 32)).toEqual(['a', 'b']);
  });

  it('lets a single over-long word overflow rather than cutting it', () => {
    // Hiding characters is never the right answer, and a hyphenless mid-word
    // break is worse than one wide line.
    const lines = wrapLines('Supercalifragilistic', 20, measure, 64);
    expect(lines).toEqual(['Supercalifragilistic']);
  });

  it('does not lose or duplicate text', () => {
    const src = 'one two three four five six seven eight';
    expect(wrapLines(src, 200, measure, 32).join(' ')).toBe(src);
  });

  it('keeps an empty line empty', () => {
    expect(wrapLines('a\n\nb', 10_000, measure, 32)).toEqual(['a', '', 'b']);
  });
});

describe('the approximation is still named and available', () => {
  it('is the constant the old code inlined', () => {
    expect(APPROX_EM_PER_CHAR).toBe(0.58);
    expect(approximateMeasurer()('abcd', 100)).toBeCloseTo(4 * 100 * 0.58, 6);
  });
});
