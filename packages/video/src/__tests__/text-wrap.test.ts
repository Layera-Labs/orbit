/**
 * Caption wrapping — `linesOf` and the `maxWidth` that drives it.
 *
 * Three surfaces answered "where does this text break" and one of them answered
 * differently: `overlayBox` and `overlayToSVG` each did `text.split('\n')`,
 * while the mobile preview drew every caption inside `width: "90%"` and let
 * React Native break it. So a caption long enough to reach nine tenths of the
 * canvas came back as two lines on a phone and one long line in the exported
 * file. That is a live breach of this engine's one rule — preview and export do
 * not answer the same question separately — and it had been shipping unnoticed
 * because nothing measured it.
 *
 * The claims here, in the order they matter:
 *
 * 1. **A caption with no `maxWidth` is byte-identical to before.** Every stored
 *    project is such a caption. Asserted against literal markup, not against a
 *    re-derivation through the same helper.
 * 2. **`maxWidth` breaks where the measurer says**, not where a constant does —
 *    so the same field means the same thing under the flat approximation and
 *    under real advance widths, and the wrap point MOVES between them.
 * 3. **The box follows the wrapped text**, growing in height and shrinking to
 *    the longest surviving line rather than to `maxWidth`.
 * 4. **The preview and the export produce one string**, which is the property
 *    `frameStateAt` and `renderProject` already share and must keep sharing now
 *    that a second thing decides line breaks.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayBox, overlayFontOptions, overlayToSVG } from '../overlay-svg';
import { frameStateAt } from '../frame';
import { createProject } from '../project';
import { approximateMeasurer, linesOf, measurerFor, parseFontMetrics } from '../font-metrics';
import type { TextOverlay } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
const fontData = new Uint8Array(readFileSync(join(here, 'fixtures/fonts/NotoSans-Regular.ttf')));
const metrics = parseFontMetrics(fontData)!;
const real = measurerFor(metrics);
const approx = approximateMeasurer();

const W = 1920;
const H = 1080;

const base: TextOverlay = {
  id: 'c',
  type: 'text',
  text: 'The quick brown fox jumps over the lazy dog',
  start: 0,
  end: 2,
  x: 0.5,
  y: 0.8,
  fontSize: 48,
  color: '#ffffff',
};

/** Every `<tspan>`'s text, in document order — the lines actually drawn. */
function tspans(svg: string): string[] {
  return [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
}

describe('linesOf', () => {
  it('breaks only on explicit newlines when no width is given', () => {
    expect(linesOf('a\nb\nc', 32, approx)).toEqual(['a', 'b', 'c']);
    expect(linesOf('one long line that would wrap anywhere', 32, approx)).toHaveLength(1);
  });

  it('treats an absent, zero, negative or NaN width as "do not wrap"', () => {
    /*
     * Not pedantry: `wrapLines` is a greedy loop against a width, and a
     * non-positive one makes EVERY word overflow, so it emits one word per
     * line. A `maxWidth` of 0 arriving from a cleared number field would
     * silently shred a caption into a column. The guard is one comparison and
     * this is what it is for.
     */
    const text = 'alpha beta gamma';
    for (const bad of [undefined, 0, -100, NaN]) {
      expect(linesOf(text, 32, approx, bad), `maxWidth=${bad}`).toEqual([text]);
    }
  });

  it('wraps greedily on whitespace when a width is given', () => {
    const lines = linesOf('alpha beta gamma delta', 32, approx, 200);
    expect(lines.length).toBeGreaterThan(1);
    // Nothing is lost and nothing is invented: the words come back in order.
    expect(lines.join(' ').split(/\s+/)).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });

  it('handles a missing string without throwing', () => {
    expect(linesOf(undefined, 32, approx, 100)).toEqual(['']);
  });

  it('breaks in a DIFFERENT place under real metrics than under the guess', () => {
    // The whole point of measuring: `maxWidth` is a pixel width, so it has to
    // be answered by whatever knows how wide the glyphs are. If these agreed,
    // the field would be a character count wearing a pixel's name.
    // Measured: at 48px the approximation calls this string 612.5px wide and
    // Noto Sans's own advances make it 392.8px. A width BETWEEN the two is the
    // only kind that can tell them apart — either side of that range and both
    // measurers agree, which is why an arbitrary width proves nothing here.
    const text = 'Illicit initialisation';
    const between = 500;
    expect(linesOf(text, 48, approx, between)).toHaveLength(2);
    expect(linesOf(text, 48, real, between)).toEqual([text]);
  });
});

describe('a caption with no maxWidth is exactly what it always was', () => {
  it('emits one tspan per authored line and nothing else', () => {
    const svg = overlayToSVG({ ...base, text: 'first\nsecond' }, W, H);
    expect(tspans(svg)).toEqual(['first', 'second']);
  });

  it('leaves a long line long', () => {
    // 43 characters at 48px would wrap under any sane width. Without one it
    // must not, because the export never has.
    expect(tspans(overlayToSVG(base, W, H))).toEqual([base.text]);
  });

  it('measures the box exactly as the old flat constant did', () => {
    // 43 chars * 48px * 0.58 == 1197.12 — the literal the previous
    // implementation produced, kept as a literal so a change to the
    // approximation cannot move both sides of this comparison at once.
    expect(overlayBox(base, W, H).w).toBeCloseTo(1197.12, 6);
  });
});

describe('maxWidth', () => {
  const wrapped: TextOverlay = { ...base, maxWidth: 600 };

  it('splits the caption into lines the SVG actually draws', () => {
    const lines = tspans(overlayToSVG(wrapped, W, H));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(base.text);
  });

  it('draws each line one lineHeight below the last, still centred on the anchor', () => {
    const svg = overlayToSVG({ ...wrapped, lineHeight: 1.5 }, W, H);
    const ys = [...svg.matchAll(/<tspan[^>]*y="([-\d.]+)"/g)].map((m) => Number(m[1]));
    const lineH = 48 * 1.5;
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(lineH, 6);
    // The block stays centred on `y`, so it grows upward and downward equally.
    expect((ys[0] + ys[ys.length - 1]) / 2).toBeCloseTo(H * base.y, 6);
  });

  it('grows the box taller and narrower — and to the TEXT, not to maxWidth', () => {
    const flat = overlayBox(base, W, H);
    const box = overlayBox(wrapped, W, H);
    expect(box.h).toBeGreaterThan(flat.h);
    expect(box.w).toBeLessThan(flat.w);
    // A box the width of `maxWidth` would be a box sized to a setting rather
    // than to the words in it — visible the moment a short last line leaves
    // the background sticking out past the text.
    expect(box.w).toBeLessThanOrEqual(600);
    expect(box.w).not.toBeCloseTo(600, 6);
  });

  it('keeps the background rect on the wrapped box, not the unwrapped one', () => {
    const o = { ...wrapped, box: { color: '#000000', padding: 20 } };
    const svg = overlayToSVG(o, W, H);
    const rect = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg)!;
    const b = overlayBox(o, W, H);
    expect(Number(rect[1])).toBeCloseTo(b.x, 6);
    expect(Number(rect[3])).toBeCloseTo(b.w, 6);
    expect(Number(rect[4])).toBeCloseTo(b.h, 6);
  });

  it('wraps at the width the supplied measurer reports', () => {
    // Same overlay, two measurers: the real one fits more words per line than
    // the approximation, which over-predicts prose by roughly a fifth.
    const withApprox = tspans(overlayToSVG(wrapped, W, H));
    const withReal = tspans(overlayToSVG(wrapped, W, H, { measure: real }));
    expect(withReal.length).toBeLessThan(withApprox.length);
    expect(withReal.join(' ')).toBe(base.text);
  });

  it('leaves a single unbreakable word alone rather than cutting it', () => {
    const o = { ...base, text: 'Supercalifragilisticexpialidocious', maxWidth: 50 };
    expect(tspans(overlayToSVG(o, W, H))).toEqual([o.text]);
  });

  it('still honours an explicit newline inside a wrapped caption', () => {
    const o = { ...base, text: 'alpha beta gamma\ndelta', maxWidth: 400 };
    const lines = tspans(overlayToSVG(o, W, H));
    // Whatever the wrap does to the first paragraph, `delta` is its own line.
    expect(lines[lines.length - 1]).toBe('delta');
  });
});

describe('the preview and the export wrap identically', () => {
  it('produces one string from both entry points, with a font in hand', () => {
    const o: TextOverlay = { ...base, fontFamily: 'Noto Sans', maxWidth: 700, start: 0, end: 5 };
    const project = { ...createProject({ width: W, height: H }), overlays: [o] };
    const fonts = new Map([['Noto Sans', fontData]]);

    const fromPreview = frameStateAt(project, 1, { fonts }).find((x) => x.kind === 'overlay')?.svg;
    const fromExport = overlayToSVG(o, W, H, overlayFontOptions(o, fonts));
    expect(fromPreview).toBe(fromExport);
    // And it genuinely wrapped, so the agreement above is about something.
    expect(tspans(fromPreview!).length).toBeGreaterThan(1);
  });

  it('wraps by measurement, so the same caption breaks later in a bigger face map', () => {
    /*
     * A caption drawn with the real face fits more per line than one drawn with
     * the fallback. Both are correct for what they drew — the failure this
     * guards is one surface wrapping with metrics while the other wraps with
     * the guess, which would put the same caption on a different number of
     * lines in the preview and the file.
     */
    // Measured at 48px: the approximation calls this caption 1197.1px wide and
    // the real advances 1008.5px, so 1100 is the width that separates them.
    const o: TextOverlay = { ...base, fontFamily: 'Noto Sans', maxWidth: 1100, start: 0, end: 5 };
    const project = { ...createProject({ width: W, height: H }), overlays: [o] };
    const withFont = frameStateAt(project, 1, { fonts: new Map([['Noto Sans', fontData]]) });
    const without = frameStateAt(project, 1);
    expect(tspans(withFont.find((x) => x.kind === 'overlay')!.svg!)).toEqual([base.text]);
    expect(tspans(without.find((x) => x.kind === 'overlay')!.svg!)).toHaveLength(2);
    expect(without.find((x) => x.kind === 'overlay')?.svg).toBe(overlayToSVG(o, W, H));
  });
});
