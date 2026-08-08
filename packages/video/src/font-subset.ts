/**
 * Cut a font down to the glyphs one caption actually uses.
 *
 * ## Why this exists
 *
 * The caption SVG carries no font data, and an SVG loaded through `<img>` is a
 * resource-isolated document: it cannot see the page's `@font-face` rules or
 * `document.fonts`. Measured, with a real webfont against a `serif` control,
 * the `<img>` copy rendered at **exactly the fallback width** — so the web
 * preview has always drawn captions in a system face while the export drew them
 * in the chosen one. The comment claiming preview and export "match" because
 * they share the SVG string was half right: the string matched, the fonts did
 * not.
 *
 * Embedding the face as a base64 `@font-face` inside the SVG fixes it, because
 * a data URI is not an external resource. Embedding the WHOLE face does not: a
 * Google TTF is 100–400 KB, base64 adds a third, and the preview holds 64
 * cached caption SVGs. A caption uses a few dozen glyphs out of a few thousand,
 * so the subset is 2–6 KB and the full face is 500 KB. That ratio is the reason
 * this file is worth its length.
 *
 * ## Scope, stated plainly
 *
 * TrueType outlines (`glyf`/`loca`) only. A CFF/OpenType face (`CFF ` table)
 * stores outlines in an entirely different format whose subsetting is a much
 * larger job, so `subsetFont` returns `null` for one and the caller embeds
 * nothing rather than embedding something broken. Google's CSS API serves
 * TrueType to the User-Agent we send, which is the case that matters here.
 *
 * ## Glyph ids are PRESERVED, and that is the whole trick
 *
 * The obvious way to subset is to renumber glyphs 0..n so the tables pack
 * tightly. Doing that was measured and rejected: `GPOS` (kerning), `GSUB`
 * (ligatures) and `GDEF` are all indexed BY GLYPH ID, so renumbering either
 * invalidates them or forces rewriting three of the most intricate tables in
 * the format. Dropping them instead loses kerning, which showed up immediately
 * — "The quick brown fox" rendered **3.84px wider** than the full face at 64px,
 * because the `ow` and `ox` pairs each kern by 1.28px.
 *
 * So this keeps every glyph id exactly where it was, empties the `loca` entries
 * for glyphs nobody asked for, and copies the layout tables verbatim. The
 * result kerns identically to the original, which means **the export's
 * appearance does not change at all** — only the preview's does, from a
 * substituted face to the right one. `loca` costs 2 bytes per glyph in the
 * original font and the layout tables cost whatever they cost; `glyf`, which is
 * ~69% of a typical face, is what actually goes away.
 *
 * Hinting (`fpgm`/`prep`/`cvt `) and `gasp` travel too: they are small, they
 * are not glyph-indexed, and dropping them would be one more way for the two
 * renderers to disagree.
 */
import { readCmap, sfntTables, TAG } from './font-metrics';

/** Composite-glyph component flags we have to walk to find the next record. */
const ARG_1_AND_2_ARE_WORDS = 0x0001;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

class Writer {
  private buf: number[] = [];
  u8(v: number) {
    this.buf.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    this.buf.push((v >> 8) & 0xff, v & 0xff);
    return this;
  }
  u32(v: number) {
    this.buf.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    return this;
  }
  bytes(b: Uint8Array) {
    for (let i = 0; i < b.length; i++) this.buf.push(b[i]);
    return this;
  }
  /** sfnt tables are 4-byte aligned; the padding must be zeroes. */
  pad4() {
    while (this.buf.length % 4) this.buf.push(0);
    return this;
  }
  get length() {
    return this.buf.length;
  }
  done(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

/** Read `loca` into absolute glyph offsets, whichever format it uses. */
function readLoca(v: DataView, off: number, numGlyphs: number, longFormat: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i <= numGlyphs; i++) {
    out.push(longFormat ? v.getUint32(off + i * 4) : v.getUint16(off + i * 2) * 2);
  }
  return out;
}

/**
 * Every glyph a composite depends on, transitively.
 *
 * A composite glyph (é, most accented letters) is a reference to other glyphs.
 * Subsetting without following those references produces a font where `é` is
 * blank — which looks like a rendering bug and is really a missing dependency.
 */
function expandComposites(
  v: DataView,
  glyfOff: number,
  loca: number[],
  wanted: Set<number>,
): Set<number> {
  const out = new Set(wanted);
  const queue = [...wanted];
  while (queue.length) {
    const g = queue.pop()!;
    const start = glyfOff + loca[g];
    const end = glyfOff + loca[g + 1];
    if (end <= start || end > v.byteLength) continue;
    if (v.getInt16(start) >= 0) continue; // simple glyph, no components
    let p = start + 10;
    for (;;) {
      if (p + 4 > end) break;
      const flags = v.getUint16(p);
      const glyphIndex = v.getUint16(p + 2);
      if (!out.has(glyphIndex)) {
        out.add(glyphIndex);
        queue.push(glyphIndex);
      }
      p += 4;
      p += flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2;
      if (flags & WE_HAVE_A_SCALE) p += 2;
      else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) p += 4;
      else if (flags & WE_HAVE_A_TWO_BY_TWO) p += 8;
      if (!(flags & MORE_COMPONENTS)) break;
    }
  }
  return out;
}

/**
 * `cmap` for the subset.
 *
 * One segment (or group) per codepoint. That is more segments than a run-length
 * encoding would need, but a caption's character set is a few dozen entries, so
 * the whole table is a few hundred bytes — and the naive form has no way to be
 * subtly wrong, which a hand-rolled range coalescer very much does.
 */
function buildCmap(map: Map<number, number>): Uint8Array {
  const codes = [...map.keys()].sort((a, b) => a - b);
  const astral = codes.some((c) => c > 0xffff);
  const sub = new Writer();

  if (astral) {
    sub.u16(12).u16(0).u32(16 + codes.length * 12).u32(0).u32(codes.length);
    for (const c of codes) sub.u32(c).u32(c).u32(map.get(c)!);
  } else {
    const segCount = codes.length + 1; // + the mandatory 0xFFFF terminator
    let searchRange = 2;
    while (searchRange * 2 <= segCount * 2) searchRange *= 2;
    const entrySelector = Math.log2(searchRange / 2);
    sub
      .u16(4)
      .u16(16 + segCount * 8)
      .u16(0)
      .u16(segCount * 2)
      .u16(searchRange)
      .u16(entrySelector)
      .u16(segCount * 2 - searchRange);
    for (const c of codes) sub.u16(c);
    sub.u16(0xffff); // endCode terminator
    sub.u16(0); // reservedPad
    for (const c of codes) sub.u16(c);
    sub.u16(0xffff); // startCode terminator
    // idDelta maps this codepoint straight onto its new glyph id.
    for (const c of codes) sub.u16((map.get(c)! - c) & 0xffff);
    sub.u16(1); // terminator delta: 0xFFFF -> 0
    for (let i = 0; i < segCount; i++) sub.u16(0); // idRangeOffset, all direct
  }

  const subtable = sub.done();
  const out = new Writer();
  out.u16(0).u16(1);
  out.u16(3).u16(astral ? 10 : 1).u32(12);
  out.bytes(subtable);
  return out.done();
}

function checksum(b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) {
    const w =
      ((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    sum = (sum + w) >>> 0;
  }
  return sum >>> 0;
}

/**
 * Build a font containing only the glyphs the given codepoints need.
 *
 * Returns `null` when the input is not a TrueType-outline sfnt we can subset —
 * a CFF face, a collection we cannot read, or anything malformed. A caller that
 * gets `null` should embed nothing; shipping a broken `@font-face` is worse
 * than falling back, because the browser will silently substitute either way
 * and a corrupt one may take the whole SVG down with it.
 */
export function subsetFont(data: Uint8Array, codepoints: Iterable<number>): Uint8Array | null {
  try {
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tt = sfntTables(v);
    if (tt.has(TAG.cff)) return null; // CFF outlines, out of scope by design

    const head = tt.get(TAG.head);
    const hhea = tt.get(TAG.hhea);
    const maxp = tt.get(TAG.maxp);
    const hmtx = tt.get(TAG.hmtx);
    const cmap = tt.get(TAG.cmap);
    const glyf = tt.get(TAG.glyf);
    const loca = tt.get(TAG.loca);
    if (!head || !hhea || !maxp || !hmtx || !cmap || !glyf || !loca) return null;

    const numGlyphs = v.getUint16(maxp.offset + 4);
    const longLoca = v.getInt16(head.offset + 50) === 1;
    const locaOffsets = readLoca(v, loca.offset, numGlyphs, longLoca);
    const codeToGlyph = readCmap(v, cmap);

    // .notdef is always glyph 0 and must always be present.
    const wanted = new Set<number>([0]);
    const kept = new Map<number, number>(); // codepoint -> glyph id (unchanged)
    for (const cp of codepoints) {
      const g = codeToGlyph.get(cp);
      if (g !== undefined && g < numGlyphs) {
        wanted.add(g);
        kept.set(cp, g);
      }
    }
    const keep = expandComposites(v, glyf.offset, locaOffsets, wanted);

    /*
     * `glyf` carries only the kept outlines; `loca` still has an entry for
     * every glyph in the original font, with dropped glyphs given a zero-length
     * range (loca[i] === loca[i+1]), which is how the format spells "this glyph
     * has no outline". Ids therefore never move, so `GPOS`/`GSUB`/`GDEF` and
     * every composite component reference stay valid with no rewriting.
     *
     * `loca` uses the SHORT form, which stores offset/2 and so requires every
     * offset to be even. Each glyph is already padded to a 4-byte boundary, so
     * that holds for free — and on a 3000-glyph face it halves the one table
     * whose size is fixed by the ORIGINAL glyph count rather than by how many
     * glyphs the caption actually uses.
     */
    const glyfW = new Writer();
    const newLoca: number[] = [];
    for (let g = 0; g < numGlyphs; g++) {
      newLoca.push(glyfW.length);
      if (!keep.has(g)) continue;
      const s = glyf.offset + locaOffsets[g];
      const e = glyf.offset + locaOffsets[g + 1];
      if (e > s && e <= data.byteLength) {
        glyfW.bytes(data.slice(s, e)); // ids unchanged, so bytes copy verbatim
        glyfW.pad4();
      }
    }
    newLoca.push(glyfW.length);
    const glyfBytes = glyfW.done();

    // Short loca is only representable while every offset fits in 16 bits once
    // halved. A caption's glyphs are small, but fall back rather than truncate.
    const shortLoca = newLoca[newLoca.length - 1] <= 0x1fffe;
    const locaW = new Writer();
    for (const o of newLoca) (shortLoca ? locaW.u16(o >> 1) : locaW.u32(o));

    const headBytes = data.slice(head.offset, head.offset + head.length);
    new DataView(headBytes.buffer, headBytes.byteOffset).setInt16(50, shortLoca ? 0 : 1);
    new DataView(headBytes.buffer, headBytes.byteOffset).setUint32(8, 0); // checkSumAdjustment

    /*
     * `hmtx` is truncated to the highest glyph we kept.
     *
     * The format's run-length rule says every glyph at or beyond
     * `numberOfHMetrics` reuses the LAST advance in the table. Every glyph past
     * our high-water mark was emptied above, so none of them is ever drawn and
     * what advance they nominally inherit cannot matter. Latin glyph ids sit
     * low in most faces, so on a big font this turns ~12 KB into ~1 KB.
     */
    const maxKept = Math.max(...keep);
    const origHMetrics = v.getUint16(hhea.offset + 34);
    const newHMetrics = Math.min(origHMetrics, maxKept + 1);

    /** Left side bearing for a glyph, wherever `hmtx` happens to keep it. */
    const lsbOf = (g: number): number => {
      const at =
        g < origHMetrics
          ? hmtx.offset + g * 4 + 2
          : hmtx.offset + origHMetrics * 4 + (g - origHMetrics) * 2;
      return at + 2 <= data.byteLength ? v.getInt16(at) : 0;
    };

    const hmtxW = new Writer();
    for (let i = 0; i < newHMetrics; i++) {
      const at = hmtx.offset + i * 4;
      hmtxW.u16(at + 2 <= data.byteLength ? v.getUint16(at) : 0);
      hmtxW.u16(lsbOf(i) & 0xffff);
    }
    /*
     * The trailing bearing array, and it is NOT optional.
     *
     * `hmtx` is `numberOfHMetrics` four-byte entries followed by a two-byte
     * left-side-bearing for EVERY REMAINING GLYPH. Omitting that tail makes the
     * table shorter than `numGlyphs` implies, and while resvg renders such a
     * font perfectly happily, Chrome's OpenType Sanitiser rejects it outright —
     * the FontFace API reports the rejection as "A network error occurred",
     * which is the least informative message it could possibly have chosen.
     * That cost a full debugging cycle: every test passed, because every test
     * validated through resvg.
     */
    for (let g = newHMetrics; g < numGlyphs; g++) hmtxW.u16(lsbOf(g) & 0xffff);
    const hheaBytes = data.slice(hhea.offset, hhea.offset + hhea.length);
    new DataView(hheaBytes.buffer, hheaBytes.byteOffset).setUint16(34, newHMetrics);

    const out: [number, Uint8Array][] = [
      [TAG.head, headBytes],
      // maxp keeps the ORIGINAL glyph count: ids did not move, and lowering it
      // would orphan every layout-table reference above the new bound.
      [TAG.hhea, hheaBytes],
      [TAG.maxp, data.slice(maxp.offset, maxp.offset + maxp.length)],
      [TAG.hmtx, hmtxW.done()],
      // cmap is rebuilt small — it is not glyph-indexed in a way anything else
      // depends on, and the original maps thousands of codepoints we dropped.
      [TAG.cmap, buildCmap(kept)],
      [TAG.loca, locaW.done()],
      [TAG.glyf, glyfBytes],
      // post 3.0 is valid and drops the glyph-name table; nothing renders from
      // glyph names and it is often a fifth of a small font.
      [TAG.post, new Writer().u32(0x00030000).u32(0).u16(0).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0).done()],
    ];
    /*
     * Everything below is copied verbatim, and the layout tables are the reason
     * this subsetter preserves glyph ids at all: GPOS is what kerns "ow" and
     * "ox", and without it the same string renders measurably wider than the
     * face it came from.
     */
    for (const tag of [TAG.name, TAG.os2, TAG.gpos, TAG.gsub, TAG.gdef, TAG.prep, TAG.fpgm, TAG.cvt, TAG.gasp] as number[]) {
      const t = tt.get(tag);
      if (t) out.push([tag, data.slice(t.offset, t.offset + t.length)]);
    }
    out.sort((a, b) => a[0] - b[0]);

    const numTables = out.length;
    let searchRange = 16;
    while (searchRange * 2 <= numTables * 16) searchRange *= 2;
    const header = new Writer();
    header
      .u32(0x00010000)
      .u16(numTables)
      .u16(searchRange)
      .u16(Math.log2(searchRange / 16))
      .u16(numTables * 16 - searchRange);

    let offset = 12 + numTables * 16;
    const dir = new Writer();
    for (const [tag, bytes] of out) {
      dir.u32(tag).u32(checksum(bytes)).u32(offset).u32(bytes.length);
      offset += Math.ceil(bytes.length / 4) * 4;
    }

    const file = new Writer();
    file.bytes(header.done()).bytes(dir.done());
    for (const [, bytes] of out) file.bytes(bytes).pad4();
    const result = file.done();

    // head.checkSumAdjustment is defined against the finished file.
    const headEntry = out.findIndex(([tag]) => tag === TAG.head);
    let headOffset = 12 + numTables * 16;
    for (let i = 0; i < headEntry; i++) headOffset += Math.ceil(out[i][1].length / 4) * 4;
    new DataView(result.buffer, result.byteOffset).setUint32(
      headOffset + 8,
      (0xb1b0afba - checksum(result)) >>> 0,
    );

    return result;
  } catch {
    return null;
  }
}

/** The distinct code points in a string, ready to hand to `subsetFont`. */
export function codePointsOf(text: string): Set<number> {
  const out = new Set<number>();
  for (const ch of text) out.add(ch.codePointAt(0)!);
  return out;
}

/**
 * `subsetFont`, memoized on the face and the character set.
 *
 * The preview rebuilds a caption's SVG on every frame, and subsetting is not
 * cheap — it reads the whole `cmap`, walks `loca` for every glyph in the source
 * font, and copies the layout tables. Doing that thirty times a second per
 * caption would make the editor unusable, and the result is a pure function of
 * (face, codepoints), so it is exactly the thing to cache.
 *
 * Keyed by the buffer in a `WeakMap`, so a font the caller drops is collected.
 * The inner map is bounded because a long editing session retypes a caption a
 * character at a time, and each keystroke is a different character set — an
 * unbounded cache would keep every intermediate spelling of every caption for
 * as long as the font is alive.
 */
const MAX_SUBSETS_PER_FACE = 64;
const subsetCache = new WeakMap<Uint8Array, Map<string, Uint8Array | null>>();

export function subsetFontCached(
  data: Uint8Array,
  codepoints: Iterable<number>,
): Uint8Array | null {
  const key = [...new Set(codepoints)].sort((a, b) => a - b).join(',');
  let perFace = subsetCache.get(data);
  if (!perFace) {
    perFace = new Map();
    subsetCache.set(data, perFace);
  }
  const hit = perFace.get(key);
  if (hit !== undefined) return hit;
  const built = subsetFont(data, key ? key.split(',').map(Number) : []);
  if (perFace.size >= MAX_SUBSETS_PER_FACE) perFace.clear();
  perFace.set(key, built);
  return built;
}
