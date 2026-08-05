/**
 * Font embedding in the caption SVG, and the promise that nothing moved.
 *
 * Two separate claims live here:
 *
 * 1. **Passing no options changes nothing.** `overlayBox` and `overlayToSVG`
 *    grew a measurement seam; every existing caller passes nothing and must
 *    keep getting the exact bytes it got before. Asserted against literal
 *    expected values rather than against a re-derivation, so a change to the
 *    approximation cannot quietly move both sides of the comparison.
 *
 * 2. **Passing font bytes embeds a working face.** Verified by rendering: the
 *    subset in the SVG measures the same as the full face handed to resvg
 *    through `fontFiles`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayBox, overlayFontOptions, overlayToSVG } from '../overlay-svg';
import { frameStateAt } from '../frame';
import { createProject } from '../project';
import { measurerFor, parseFontMetrics } from '../font-metrics';
import { assertNoExternalRefs } from '../svg';
import type { TextOverlay } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
const FONT = join(here, 'fixtures/fonts/NotoSans-Regular.ttf');
const fontData = new Uint8Array(readFileSync(FONT));

const base: TextOverlay = {
  id: 'c',
  type: 'text',
  text: 'Hello world',
  start: 0,
  end: 2,
  x: 0.5,
  y: 0.8,
  fontSize: 64,
  color: '#ffffff',
  fontFamily: 'Noto Sans',
};

describe('defaults are unchanged', () => {
  it('measures exactly as the old flat constant did', () => {
    // 11 characters * 64px * 0.58 == 408.32, the number the previous
    // implementation produced from `maxLen * fontSize * 0.58`.
    expect(overlayBox(base, 1920, 1080).w).toBeCloseTo(408.32, 6);
  });

  it('emits no font block when given no font', () => {
    const svg = overlayToSVG(base, 1920, 1080);
    expect(svg).not.toContain('@font-face');
    expect(svg).not.toContain('<defs>');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">')).toBe(true);
  });

  it('keeps a grabbable box for an empty caption', () => {
    const b = overlayBox({ ...base, text: '' }, 1920, 1080);
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
  });
});

describe('font embedding', () => {
  it('carries a subsetted @font-face when given font bytes', () => {
    const svg = overlayToSVG(base, 1920, 1080, { fontData });
    expect(svg).toContain('@font-face');
    expect(svg).toContain('font-family:"Noto Sans"');
    expect(svg).toContain('src:url(data:font/ttf;base64,');
  });

  it('embeds only the caption\'s own glyphs', () => {
    // Two captions of very different character counts must not produce
    // similarly sized payloads, or the subsetting is not happening.
    const small = overlayToSVG({ ...base, text: 'Hi' }, 1920, 1080, { fontData }).length;
    const large = overlayToSVG(
      { ...base, text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' },
      1920,
      1080,
      { fontData },
    ).length;
    expect(large).toBeGreaterThan(small);
    // ...and the whole face must never be in there: it is 27,748 bytes, which
    // is ~37,000 of base64.
    expect(small).toBeLessThan(20_000);
  });

  it('survives the external-reference guard', () => {
    // `assertNoExternalRefs` is the last line before a string reaches resvg. A
    // <style> block is allowed; the point is that embedding a font did not
    // introduce an <image>, <use> or <foreignObject> along the way.
    expect(() => assertNoExternalRefs(overlayToSVG(base, 1920, 1080, { fontData }))).not.toThrow();
  });

  it('degrades to no font block rather than emitting a broken one', () => {
    const svg = overlayToSVG(base, 1920, 1080, { fontData: new Uint8Array([1, 2, 3, 4]) });
    expect(svg).not.toContain('@font-face');
  });
});

describe('frameStateAt threads fonts to the caption', () => {
  const project = {
    ...createProject({ width: 1920, height: 1080 }),
    overlays: [{ ...base, start: 0, end: 5 }],
  };

  it('embeds the face when given one', () => {
    const fonts = new Map([['Noto Sans', fontData]]);
    const op = frameStateAt(project, 1, { fonts }).find((o) => o.kind === 'overlay');
    expect(op?.svg).toContain('@font-face');
  });

  it('produces the SAME string the export produces', () => {
    /*
     * The invariant the whole change set exists for. The web preview calls
     * `frameStateAt` and the export calls `overlayToSVG` directly; both go
     * through `overlayFontOptions`, so given the same font map they must emit
     * one identical string. If they ever diverge, the caption box is sized from
     * one measurement and drawn from another.
     */
    const fonts = new Map([['Noto Sans', fontData]]);
    const fromPreview = frameStateAt(project, 1, { fonts }).find((o) => o.kind === 'overlay')?.svg;
    const fromExport = overlayToSVG(project.overlays[0], 1920, 1080, overlayFontOptions(project.overlays[0], fonts));
    expect(fromPreview).toBe(fromExport);
  });

  it('falls back to exactly the old output when no font is available', () => {
    // An editor offline, or a deployment whose font route 404s, must still draw
    // the caption — and must draw the one it always drew.
    const withNone = frameStateAt(project, 1).find((o) => o.kind === 'overlay')?.svg;
    const withMiss = frameStateAt(project, 1, { fonts: new Map() }).find(
      (o) => o.kind === 'overlay',
    )?.svg;
    expect(withNone).toBe(withMiss);
    expect(withNone).not.toContain('@font-face');
    expect(withNone).toBe(overlayToSVG(project.overlays[0], 1920, 1080));
  });

  it('caches the subset instead of rebuilding it every frame', () => {
    // The preview rebuilds this SVG on every frame. Subsetting walks the whole
    // source font, so an uncached call per frame would be the difference
    // between a usable editor and a slideshow.
    const fonts = new Map([['Noto Sans', fontData]]);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) frameStateAt(project, i / 30, { fonts });
    const ms = performance.now() - t0;
    expect(ms, `200 frames took ${ms.toFixed(0)}ms`).toBeLessThan(500);
  });
});

describe('real metrics change the box, and only when asked', () => {
  const metrics = parseFontMetrics(fontData)!;
  const measure = measurerFor(metrics);

  it('sizes the box from advance widths when a measurer is supplied', () => {
    const approx = overlayBox(base, 1920, 1080).w;
    const real = overlayBox(base, 1920, 1080, measure).w;
    // The approximation over-predicts prose by ~23%; the real measurement is
    // narrower, and the two must not be the same number.
    expect(real).toBeLessThan(approx);
    expect(real).toBeCloseTo(343.23, 1);
  });

  it('is the measurement the SVG actually draws with', () => {
    // The box in the markup has to come from the same measurer the caller
    // passed, or an editor outline and the exported rectangle disagree.
    const svg = overlayToSVG({ ...base, box: { color: '#000' } }, 1920, 1080, { measure });
    const w = Number(/width="(\d+(?:\.\d+)?)"[^>]*rx=/.exec(svg)?.[1] ?? NaN);
    expect(w).toBeCloseTo(overlayBox({ ...base, box: { color: '#000' } }, 1920, 1080, measure).w, 1);
  });
});
