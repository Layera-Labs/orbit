/**
 * Real text measurement, from the font file rather than from a constant.
 *
 * `overlayBox` has always guessed a caption's width at `0.58em` per character.
 * `__tests__/text-metrics.test.ts` measures what the guess actually costs
 * against Noto Sans: **+139% on a run of `i`, −37% on a run of `W`**, ~+20% on
 * ordinary prose. The error changes SIGN with the string, so no tuned constant
 * can fix it — only per-glyph advance widths can.
 *
 * This module parses those advances out of an sfnt (`.ttf`/`.otf`) and measures
 * with them. It is deliberately **browser-safe**: it takes a `Uint8Array`, not
 * a path, so the same code serves the export (which reads the file off disk)
 * and any caller that already has the font bytes. Nothing here touches `node:`.
 *
 * ## Why a parser and not `canvas.measureText`
 *
 * The export runs in Node under resvg, which lays text out from the font file.
 * A browser measuring the same string through canvas would be a SECOND
 * implementation of the same question, and this engine's whole discipline is
 * that preview and export must not answer such questions separately. Reading
 * `hmtx` gives both sides one arithmetic, derived from the one artifact that
 * actually decides the answer.
 *
 * ## What it deliberately does not model
 *
 * Kerning (`kern`/`GPOS`) and ligatures. Both change a string's width by a few
 * tenths of a percent in the faces used for captions, and supporting them means
 * shipping a shaping engine. The residual is recorded as a tolerance in the
 * oracle test, the same way the colour grade records its ~2–3% rather than
 * pretending to be exact.
 */

/** Advance widths for one face, in font design units. */
export interface FontMetrics {
  /** Design units per em — 1000 for most CFF fonts, 2048 for most TrueType. */
  unitsPerEm: number;
  /** Codepoint → advance width, in design units. */
  advances: Map<number, number>;
  /** Advance used for any codepoint the font does not map. */
  fallbackAdvance: number;
}

/**
 * Measures a single line, in pixels.
 *
 * Supplied by whoever knows which font is in play. `overlayBox` takes one of
 * these rather than a `FontMetrics` so a caller with a different source of
 * truth — a test, a host app that has already shaped the text — can provide it
 * without owning a font file.
 */
export type TextMeasurer = (text: string, fontSize: number) => number;

const TAG_HEAD = 0x68656164; // 'head'
const TAG_HHEA = 0x68686561; // 'hhea'
const TAG_MAXP = 0x6d617870; // 'maxp'
const TAG_HMTX = 0x686d7478; // 'hmtx'
const TAG_CMAP = 0x636d6170; // 'cmap'

export interface SfntTable {
  offset: number;
  length: number;
}

/** Table tags, shared with the subsetter so the two cannot disagree. */
export const TAG = {
  head: TAG_HEAD,
  hhea: TAG_HHEA,
  maxp: TAG_MAXP,
  hmtx: TAG_HMTX,
  cmap: TAG_CMAP,
  glyf: 0x676c7966,
  loca: 0x6c6f6361,
  name: 0x6e616d65,
  os2: 0x4f532f32,
  post: 0x706f7374,
  cff: 0x43464620,
  gpos: 0x47504f53,
  gsub: 0x47535542,
  gdef: 0x47444546,
  prep: 0x70726570,
  fpgm: 0x6670676d,
  cvt: 0x63767420,
  gasp: 0x67617370,
} as const;

export function sfntTables(v: DataView): Map<number, SfntTable> {
  return tables(v);
}

type Table = SfntTable;

function tables(v: DataView): Map<number, Table> {
  const out = new Map<number, Table>();
  // A TrueType Collection wraps one or more sfnts; take the first face.
  let base = 0;
  if (v.getUint32(0) === 0x74746366 /* 'ttcf' */) base = v.getUint32(12);
  const numTables = v.getUint16(base + 4);
  for (let i = 0; i < numTables; i++) {
    const rec = base + 12 + i * 16;
    if (rec + 16 > v.byteLength) break;
    out.set(v.getUint32(rec), { offset: v.getUint32(rec + 8), length: v.getUint32(rec + 12) });
  }
  return out;
}

/**
 * Codepoint → glyph id, from the best `cmap` subtable available.
 *
 * Preference order is (3,10) then (3,1) then anything: format 12 covers the
 * full Unicode range and format 4 only the BMP, so a font with both must use
 * 12 or an emoji in a caption silently measures as a missing glyph.
 */
export function readCmap(v: DataView, t: Table): Map<number, number> {
  const map = new Map<number, number>();
  const n = v.getUint16(t.offset + 2);
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < n; i++) {
    const rec = t.offset + 4 + i * 8;
    const platform = v.getUint16(rec);
    const encoding = v.getUint16(rec + 2);
    const sub = t.offset + v.getUint32(rec + 4);
    const score =
      platform === 3 && encoding === 10 ? 3 : platform === 3 && encoding === 1 ? 2 : platform === 0 ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = sub;
    }
  }
  if (best < 0) return map;

  const format = v.getUint16(best);
  if (format === 4) {
    const segX2 = v.getUint16(best + 6);
    const seg = segX2 / 2;
    const endBase = best + 14;
    const startBase = endBase + segX2 + 2;
    const deltaBase = startBase + segX2;
    const rangeBase = deltaBase + segX2;
    for (let s = 0; s < seg; s++) {
      const end = v.getUint16(endBase + s * 2);
      const start = v.getUint16(startBase + s * 2);
      if (start > end) continue;
      const delta = v.getInt16(deltaBase + s * 2);
      const rangeOff = v.getUint16(rangeBase + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number;
        if (rangeOff === 0) {
          g = (c + delta) & 0xffff;
        } else {
          const gi = rangeBase + s * 2 + rangeOff + (c - start) * 2;
          if (gi + 1 >= v.byteLength) continue;
          g = v.getUint16(gi);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g) map.set(c, g);
      }
    }
  } else if (format === 12) {
    const groups = v.getUint32(best + 12);
    for (let g = 0; g < groups; g++) {
      const rec = best + 16 + g * 12;
      if (rec + 12 > v.byteLength) break;
      const start = v.getUint32(rec);
      const end = v.getUint32(rec + 4);
      const startGlyph = v.getUint32(rec + 8);
      // Guard against a corrupt range asking us to build a billion entries.
      if (end - start > 0x10ffff) continue;
      for (let c = start; c <= end; c++) map.set(c, startGlyph + (c - start));
    }
  }
  return map;
}

/**
 * Parse advance widths out of an sfnt.
 *
 * Returns `null` rather than throwing when the bytes are not a font we can
 * read: a caller that cannot measure should fall back visibly, not crash a
 * render over a typeface.
 */
export function parseFontMetrics(data: Uint8Array): FontMetrics | null {
  try {
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tt = tables(v);
    const head = tt.get(TAG_HEAD);
    const hhea = tt.get(TAG_HHEA);
    const hmtx = tt.get(TAG_HMTX);
    const cmap = tt.get(TAG_CMAP);
    const maxp = tt.get(TAG_MAXP);
    if (!head || !hhea || !hmtx || !cmap || !maxp) return null;

    const unitsPerEm = v.getUint16(head.offset + 18);
    if (!unitsPerEm) return null;
    const numHMetrics = v.getUint16(hhea.offset + 34);
    const numGlyphs = v.getUint16(maxp.offset + 4);
    if (!numHMetrics) return null;

    // `hmtx` stores `numHMetrics` full entries; every glyph after that reuses
    // the LAST advance (that is how monospaced tails are compressed).
    const advanceOfGlyph = (g: number): number => {
      const i = Math.min(g, numHMetrics - 1);
      const at = hmtx.offset + i * 4;
      if (at + 2 > v.byteLength) return 0;
      return v.getUint16(at);
    };

    const codeToGlyph = readCmap(v, cmap);
    const advances = new Map<number, number>();
    for (const [code, glyph] of codeToGlyph) {
      if (glyph < numGlyphs) advances.set(code, advanceOfGlyph(glyph));
    }
    // A missing glyph renders as .notdef, whose advance is glyph 0's.
    return { unitsPerEm, advances, fallbackAdvance: advanceOfGlyph(0) };
  } catch {
    return null;
  }
}

/**
 * `parseFontMetrics`, memoized on the byte array it was given.
 *
 * `frameStateAt` runs once per frame and asks for a caption's metrics every
 * time. Parsing walks the whole `cmap` and builds a map of every codepoint the
 * face maps — thousands of entries on a real font — so doing it per frame at
 * 30fps would dominate the preview. The cache is a `WeakMap` keyed on the
 * buffer, so it costs nothing once the caller stops holding the font.
 */
const metricsCache = new WeakMap<Uint8Array, FontMetrics | null>();

export function metricsFor(data: Uint8Array): FontMetrics | null {
  const hit = metricsCache.get(data);
  if (hit !== undefined) return hit;
  const parsed = parseFontMetrics(data);
  metricsCache.set(data, parsed);
  return parsed;
}

/** Width of one line in pixels, from real advances. */
export function measureLine(
  text: string,
  metrics: FontMetrics,
  fontSize: number,
  letterSpacing = 0,
): number {
  let units = 0;
  let count = 0;
  // Iterate by CODE POINT, not by UTF-16 unit, or every astral character is
  // measured as two missing glyphs.
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    units += metrics.advances.get(cp) ?? metrics.fallbackAdvance;
    count++;
  }
  return (units / metrics.unitsPerEm) * fontSize + count * letterSpacing;
}

/** Build a `TextMeasurer` bound to one face. */
export function measurerFor(metrics: FontMetrics, letterSpacing = 0): TextMeasurer {
  return (text, fontSize) => measureLine(text, metrics, fontSize, letterSpacing);
}

/**
 * The flat approximation, kept as the explicit fallback for callers with no
 * font in hand.
 *
 * It is wrong — badly, and in both directions — and it is still better than
 * refusing to place a caption at all. Naming it is the point: a caller that
 * ends up here can say so, which the old code could not, because the constant
 * was inlined at the only place that used it.
 */
export const APPROX_EM_PER_CHAR = 0.58;

export function approximateMeasurer(letterSpacing = 0): TextMeasurer {
  return (text, fontSize) => {
    let count = 0;
    for (const _ of text) count++;
    return count * fontSize * APPROX_EM_PER_CHAR + count * letterSpacing;
  };
}

/**
 * Greedy word wrap to a pixel width.
 *
 * Greedy rather than balanced (Knuth-Plass) because the export and the preview
 * must agree exactly, and greedy is the algorithm a reader can reproduce by
 * hand from the measurements — a balanced break depends on a penalty function
 * nobody would be able to check a caption against.
 *
 * Explicit `\n` always breaks: an author who typed a newline meant it, and a
 * wrapper that reflows across it would silently rewrite their layout. A single
 * word longer than `maxWidth` is left to overflow rather than being cut, since
 * a hyphenless mid-word break is worse than a slightly wide line and hiding
 * characters is never the right answer.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: TextMeasurer,
  fontSize: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of (text ?? '').split('\n')) {
    const words = paragraph.split(/(\s+)/).filter((w) => w.length > 0);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const next = line + word;
      if (line && measure(next.trimEnd(), fontSize) > maxWidth) {
        out.push(line.trimEnd());
        line = /^\s+$/.test(word) ? '' : word;
      } else {
        line = next;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/**
 * The lines a caption actually renders as — the single answer to "where does
 * this text break".
 *
 * Three places asked that question independently and each answered
 * `text.split('\n')`: `overlayBox`, `overlayToSVG`, and — differently — the
 * mobile preview, which hard-wrapped every caption at `width: "90%"` of the
 * canvas. So a caption long enough to reach that width wrapped on a phone and
 * ran straight on in the exported file: the same project, drawn two ways, which
 * is the one thing this engine is built not to do. One helper is what stops the
 * three drifting again.
 *
 * `maxWidth` is in the SAME pixels as `fontSize` — the output resolution — so a
 * caption breaks in the same place whatever size the preview happens to be. It
 * is optional and absent by default, which is what keeps every stored project
 * byte-identical: with no width to break against, only an explicit `\n` breaks,
 * exactly as before.
 */
export function linesOf(
  text: string | undefined,
  fontSize: number,
  measure: TextMeasurer,
  maxWidth?: number,
): string[] {
  const t = text ?? '';
  // Covers undefined, 0, negative and NaN in one comparison — every one of
  // which means "no wrap", and none of which may reach `wrapLines`, whose
  // greedy loop would push one word per line against a non-positive width.
  if (!(maxWidth! > 0)) return t.split('\n');
  return wrapLines(t, maxWidth!, measure, fontSize);
}
