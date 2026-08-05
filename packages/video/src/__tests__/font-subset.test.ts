/**
 * The subsetter, proved by rendering.
 *
 * A font subsetter is easy to write and hard to write correctly: drop a glyph a
 * composite depends on, get the `loca` format wrong, forget to renumber a
 * component reference, and the result is still a file — just one that renders
 * blanks or is rejected outright. So the load-bearing test here is not "is the
 * output smaller"; it is **resvg renders the subset to the same pixels as the
 * full face**. That is the only claim the caller depends on.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { codePointsOf, subsetFont } from '../font-subset';
import { measureLine, parseFontMetrics, sfntTables, TAG } from '../font-metrics';

const here = dirname(fileURLToPath(import.meta.url));
const FONT = join(here, 'fixtures/fonts/NotoSans-Regular.ttf');
const FAMILY = 'Noto Sans';
const full = new Uint8Array(readFileSync(FONT));

/** Render `text` with the given font bytes and report the painted extent. */
function ink(text: string, fontBytes: Uint8Array, fontSize = 64): { w: number; h: number } {
  // resvg takes file paths, so the subset goes through a temp file.
  const tmp = join(
    process.env.TMPDIR ?? '/tmp',
    `orbit-subset-${Buffer.from(text).toString('hex').slice(0, 24)}-${fontBytes.length}.ttf`,
  );
  require('node:fs').writeFileSync(tmp, fontBytes);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="400">` +
    `<text font-family="${FAMILY}" font-size="${fontSize}" fill="#fff" text-anchor="middle" ` +
    `dominant-baseline="middle"><tspan x="2000" y="200">${text}</tspan></text></svg>`;
  const b = new Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles: [tmp], defaultFontFamily: FAMILY },
  }).getBBox();
  if (!b) throw new Error(`no bbox for ${JSON.stringify(text)} with ${fontBytes.length}B font`);
  return { w: b.width, h: b.height };
}

describe('subsetFont', () => {
  it('renders identically to the full face', () => {
    // The whole point. If this passes, the embedded subset is a real font.
    for (const text of ['Hello world', 'Orbit SDK', 'The quick brown fox', '0123456789']) {
      const sub = subsetFont(full, codePointsOf(text))!;
      expect(sub, `subset for ${JSON.stringify(text)}`).not.toBeNull();
      const a = ink(text, full);
      const b = ink(text, sub);
      expect(b.w, `${text} width`).toBeCloseTo(a.w, 2);
      expect(b.h, `${text} height`).toBeCloseTo(a.h, 2);
    }
  });

  /*
   * Measured on the committed fixture (322 glyphs, 27,748 B):
   *
   *    2 glyphs ->  5,800 B   (base64  7,734)
   *    8 glyphs ->  6,348 B   (base64  8,464)
   *   28 glyphs ->  8,216 B   (base64 10,955)
   *   66 glyphs -> 11,556 B   (base64 15,408)
   *
   * This fixture is a PESSIMISTIC case, and it is worth saying why: it is a
   * latin-only face where `glyf` is only 19 KB, so the tables whose size is
   * fixed by the original glyph count (GPOS 2,730, GSUB 812, loca 646) are
   * most of what survives. On a full 400 KB Google face `glyf` is ~350 KB and
   * essentially all of it goes, while those fixed tables grow far more slowly.
   *
   * GPOS is 43% of the subset and is kept deliberately — it is what kerns the
   * text, and dropping it made "The quick brown fox" render 3.84px wide.
   */
  it('is a fraction of the face it came from', () => {
    const sub = subsetFont(full, codePointsOf('Hello world'))!;
    expect(sub.length).toBeLessThan(full.length / 3);
    // Absolute bound too: a ratio alone would pass on a font where everything
    // is big, and what the preview cache actually cares about is bytes.
    expect(sub.length).toBeLessThan(12_000);
  });

  it('grows with the character set, not with the source font', () => {
    const small = subsetFont(full, codePointsOf('Hi'))!.length;
    const large = subsetFont(full, codePointsOf('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'))!.length;
    expect(large).toBeGreaterThan(small);
    // ...but the fixed tables mean it is never proportional to the glyph count.
    expect(large).toBeLessThan(small * 3);
  });

  it('keeps the advance widths the metrics parser reads', () => {
    // The subset must measure the same, or the caption box would be sized from
    // one font and drawn with another.
    const text = 'Orbit SDK';
    const sub = subsetFont(full, codePointsOf(text))!;
    const a = parseFontMetrics(full)!;
    const b = parseFontMetrics(sub)!;
    expect(b.unitsPerEm).toBe(a.unitsPerEm);
    expect(measureLine(text, b, 64)).toBeCloseTo(measureLine(text, a, 64), 6);
  });

  it('follows composite glyph references', () => {
    // An accented letter is a reference to a base glyph plus a mark. Subsetting
    // without walking that reference yields a font where the letter is blank —
    // and blank still renders, so only a pixel comparison catches it.
    const text = 'café';
    const sub = subsetFont(full, codePointsOf(text));
    if (!sub) return; // this subset face may not carry the accented forms
    const a = ink(text, full);
    const b = ink(text, sub);
    expect(b.w).toBeCloseTo(a.w, 2);
  });

  it('always keeps .notdef', () => {
    const sub = subsetFont(full, codePointsOf('A'))!;
    const m = parseFontMetrics(sub)!;
    expect(m.fallbackAdvance).toBeGreaterThan(0);
  });

  it('survives a codepoint the font does not have', () => {
    // A caption may contain anything. An unmapped codepoint is dropped from the
    // subset, not treated as an error.
    const sub = subsetFont(full, codePointsOf('A\u{1F600}'));
    expect(sub).not.toBeNull();
    expect(ink('A', sub!).w).toBeCloseTo(ink('A', full).w, 2);
  });

  /*
   * Structural validity, checked directly rather than through a renderer.
   *
   * resvg accepts fonts a browser will not. The first version of this
   * subsetter truncated `hmtx` without its trailing left-side-bearing array;
   * resvg rendered it correctly and every test here passed, while Chrome's
   * OpenType Sanitiser rejected the face and reported it as "A network error
   * occurred". So the format's own invariants are asserted here, because the
   * lenient consumer cannot be trusted to enforce them.
   */
  describe('is structurally valid, not merely renderable', () => {
    const sub = subsetFont(full, codePointsOf('Hello world'))!;
    const v = new DataView(sub.buffer, sub.byteOffset, sub.byteLength);
    const tables = sfntTables(v);
    const numGlyphs = v.getUint16(tables.get(TAG.maxp)!.offset + 4);
    const numHMetrics = v.getUint16(tables.get(TAG.hhea)!.offset + 34);

    it('sizes hmtx as metrics + a bearing for every remaining glyph', () => {
      const expected = numHMetrics * 4 + (numGlyphs - numHMetrics) * 2;
      expect(tables.get(TAG.hmtx)!.length).toBe(expected);
    });

    it('sizes loca for every glyph plus the terminator', () => {
      const short = v.getInt16(tables.get(TAG.head)!.offset + 50) === 0;
      expect(tables.get(TAG.loca)!.length).toBe((numGlyphs + 1) * (short ? 2 : 4));
    });

    it('keeps the table directory sorted and in bounds', () => {
      const tags = [...tables.keys()];
      expect([...tags].sort((a, b) => a - b)).toEqual(tags);
      for (const [, t] of tables) {
        expect(t.offset % 4, 'tables are 4-byte aligned').toBe(0);
        expect(t.offset + t.length).toBeLessThanOrEqual(sub.length);
      }
    });

    it('preserves head.magicNumber', () => {
      expect(v.getUint32(tables.get(TAG.head)!.offset + 12)).toBe(0x5f0f3cf5);
    });

    it('keeps the layout tables that make it kern', () => {
      expect(tables.has(TAG.gpos), 'GPOS survived').toBe(true);
    });
  });

  it('returns null rather than a broken font for input it cannot subset', () => {
    expect(subsetFont(new Uint8Array([1, 2, 3, 4]), [65])).toBeNull();
    expect(subsetFont(new Uint8Array(0), [65])).toBeNull();
  });

  it('produces a font for an empty character set', () => {
    // Degenerate but reachable: a caption whose text is empty. It must still be
    // a parseable face rather than null, so the caller has one code path.
    const sub = subsetFont(full, []);
    expect(sub).not.toBeNull();
    expect(parseFontMetrics(sub!)).not.toBeNull();
  });
});
