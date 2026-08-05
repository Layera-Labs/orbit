/**
 * The oracle for text measurement.
 *
 * `overlayBox` predicts how wide a caption will be, and `overlayToSVG` uses
 * that prediction to size the caption's background box. Until now the only test
 * over either was `overlay-box.test.ts`, which asserts the two AGREE WITH EACH
 * OTHER — and they always will, because they call the same function. Both are
 * built on one guess (`0.58em` per character, no font metrics), so the suite
 * pinned the guess to itself and could not tell you it was wrong.
 *
 * This file measures instead. resvg lays the text out with the real font and
 * reports the resulting geometry through `getBBox()`, which is the same number
 * the exported PNG will have. That makes it an independent oracle: it is
 * derived from the font file, not from our arithmetic.
 *
 * **Determinism is the whole point, and it is bought with two settings.**
 * `loadSystemFonts: false` plus one pinned `fontFiles` entry means the result
 * depends on the committed .ttf and nothing else — not the machine, not the OS
 * font set, not the network. That is exactly the property the render path did
 * not have before `resolveFonts` (a font fetched from Google mid-render made
 * "what does this caption measure" a question with a different answer on every
 * box), and it is why the font hardening and this file are one change.
 *
 * The fixture is regenerated with `ORBIT_FONT_PROBE=1`, the same shape
 * `xfade-field-probe.test.ts` uses. Regenerating it is a claim that the
 * measurement moved for a reason.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { overlayBox, overlayToSVG } from '../overlay-svg';
import type { TextOverlay } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
const FONT = join(here, 'fixtures/fonts/NotoSans-Regular.ttf');
const FIXTURE = join(here, 'fixtures/text-metrics.json');
const FAMILY = 'Noto Sans';

const W = 1080;
const H = 1920;

/**
 * The corpus is chosen so a per-character constant CANNOT fit it.
 *
 * `iiii…` and `WWWW…` are the same length and nearly four times different in
 * width; any single em-per-character value is badly wrong for at least one of
 * them. The prose lines are what real captions look like, and the digit run is
 * there because digits are tabular in most faces and so are the one case the
 * flat guess very nearly gets right — without it the fixture would imply the
 * guess is uniformly bad, and it is not.
 */
const CORPUS = [
  { id: 'prose-short', text: 'Hello world', fontSize: 64 },
  { id: 'prose-long', text: 'The quick brown fox', fontSize: 48 },
  { id: 'narrow', text: 'iiiiiiiiii', fontSize: 64 },
  { id: 'wide', text: 'WWWWWWWWWW', fontSize: 64 },
  { id: 'single', text: 'A', fontSize: 64 },
  { id: 'digits', text: '0123456789', fontSize: 64 },
  { id: 'mixed-case', text: 'Orbit SDK', fontSize: 96 },
  { id: 'two-line', text: 'first line\nsecond line is longer', fontSize: 40 },
] as const;

function overlay(text: string, fontSize: number): TextOverlay {
  return {
    id: 'm',
    type: 'text',
    text,
    start: 0,
    end: 1,
    x: 0.5,
    y: 0.5,
    fontSize,
    color: '#ffffff',
    fontFamily: FAMILY,
    align: 'center',
  };
}

/** The true laid-out extent of the caption's glyphs, in project pixels. */
function measure(text: string, fontSize: number): { w: number; h: number } {
  const svg = overlayToSVG(overlay(text, fontSize), W, H);
  const r = new Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles: [FONT], defaultFontFamily: FAMILY },
  });
  const b = r.getBBox();
  if (!b) throw new Error(`resvg reported no bbox for ${JSON.stringify(text)}`);
  return { w: b.width, h: b.height };
}

interface Row {
  id: string;
  text: string;
  fontSize: number;
  /** Measured ink width, px. */
  measuredW: number;
  /** What `overlayBox` currently predicts, px. */
  predictedW: number;
  /** Signed error of the prediction, as a fraction of the measurement. */
  error: number;
}

function build(): Row[] {
  return CORPUS.map((c) => {
    const { w: measuredW } = measure(c.text, c.fontSize);
    const predictedW = overlayBox(overlay(c.text, c.fontSize), W, H).w;
    return {
      id: c.id,
      text: c.text,
      fontSize: c.fontSize,
      measuredW: Math.round(measuredW * 100) / 100,
      predictedW: Math.round(predictedW * 100) / 100,
      error: Math.round(((predictedW - measuredW) / measuredW) * 10000) / 10000,
    };
  });
}

if (process.env.ORBIT_FONT_PROBE === '1' || !existsSync(FIXTURE)) {
  mkdirSync(dirname(FIXTURE), { recursive: true });
  writeFileSync(FIXTURE, JSON.stringify({ font: 'NotoSans-Regular.ttf', rows: build() }, null, 2) + '\n');
}

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { font: string; rows: Row[] };

describe('text metrics oracle', () => {
  it('measures identically to the recorded fixture', () => {
    // The determinism guard. With `loadSystemFonts: false` and a pinned file
    // this is reproducible on any machine, so a drift here means the font, the
    // SVG builder or resvg changed — all three worth being told about.
    for (const row of fixture.rows) {
      const { w } = measure(row.text, row.fontSize);
      expect(Math.round(w * 100) / 100, `measured width of ${row.id}`).toBeCloseTo(row.measuredW, 1);
    }
  });

  it('rasterizes byte-identically across runs', () => {
    // The Phase 0 gate itself. `loadSystemFonts: false` plus a pinned file is
    // what makes an export reproducible; before `resolveFonts` the render
    // fetched its typeface from Google mid-encode, so two boxes could produce
    // two different files from one project and neither was wrong.
    const svg = overlayToSVG(overlay('Determinism gate', 64), W, H);
    const png = () =>
      createHash('sha256')
        .update(
          new Resvg(svg, {
            font: { loadSystemFonts: false, fontFiles: [FONT], defaultFontFamily: FAMILY },
          })
            .render()
            .asPng(),
        )
        .digest('hex');
    const hashes = new Set([png(), png(), png()]);
    expect(hashes.size, 'three renders of one SVG must agree').toBe(1);
  });

  it('scales linearly with font size', () => {
    // A property no fixture can go stale on, and the sanity check that the
    // oracle is reading geometry rather than something incidental.
    const a = measure('Hello world', 32).w;
    const b = measure('Hello world', 64).w;
    expect(b / a).toBeCloseTo(2, 1);
  });

  /*
   * The gap this oracle exists to expose.
   *
   * `overlayBox` is a flat 0.58em per character, so its error depends entirely
   * on which characters you use: it is ~139% too wide for a run of `i` and
   * ~37% too narrow for a run of `W`. Both are recorded in the fixture.
   *
   * The bound below is deliberately loose because it describes what the code
   * DOES today, not what it should do. It is here so the number cannot get
   * worse unnoticed while the real fix lands. When per-glyph advance widths
   * replace the constant, this tolerance drops to a few percent and the
   * assertion becomes meaningful rather than merely honest.
   */
  const CURRENT_WORST_ERROR = 1.5;

  it('records how far the flat 0.58em guess is from the truth', () => {
    for (const row of fixture.rows) {
      const predicted = overlayBox(overlay(row.text, row.fontSize), W, H).w;
      const error = (predicted - row.measuredW) / row.measuredW;
      expect(Math.abs(error), `${row.id} prediction error`).toBeLessThan(CURRENT_WORST_ERROR);
    }
  });

  it('is wrong in BOTH directions, so no single constant can fix it', () => {
    // The load-bearing fact. If every error had the same sign, tuning 0.58
    // would be a real fix and per-glyph metrics would be over-engineering.
    const errors = fixture.rows.map((r) => r.error);
    expect(Math.max(...errors), 'some strings are over-predicted').toBeGreaterThan(0.1);
    expect(Math.min(...errors), 'some strings are under-predicted').toBeLessThan(-0.1);
  });
});
