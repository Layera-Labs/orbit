/**
 * The two primitives every hand-built SVG string in this package must use.
 *
 * We assemble SVG by concatenation, and a `VideoProject` arrives as JSON over
 * HTTP. TypeScript says `fontSize: number`; the wire says whatever the caller
 * typed. A field that is a string at runtime lands inside an attribute, and
 * one `"` closes it — the rest of the value becomes markup.
 *
 * That was not theoretical. `font-size="${o.fontSize}"` with
 * `48" /><image href="/…/orbit-render-media/u_1.bin" …` made resvg load a file
 * off local disk and composite it into the frame, and the attacker downloaded
 * the render: any image on the box, including OTHER ACCOUNTS' uploads, read
 * out through a feature that only ever meant to set a font size.
 *
 * So there is exactly one rule here: strings go through `esc`, numbers go
 * through `num`, and nothing else is ever interpolated into markup.
 */

/** Escape a string for use as XML text or a quoted attribute value. */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Coerce anything to a number safe to interpolate — digits, one dot, one sign.
 *
 * Not `String(v)`: that is the hole. A non-finite or non-numeric value becomes
 * `fallback` rather than `NaN`, because `NaN` in a coordinate silently drops
 * the element from the render, and a caption that vanishes on export while
 * showing in the preview is its own bug.
 */
export function num(v: unknown, fallback = 0): string {
  const x = typeof v === 'number' ? v : Number(v);
  const safe = Number.isFinite(x) ? x : fallback;
  return String(Math.round(safe * 100) / 100);
}

/**
 * Constrain a colour to colour syntax instead of escaping it.
 *
 * Escaping is not enough here, and the reason is easy to miss: `esc` is an XML
 * transform, and the parser UNDOES it. A colour of `url('/etc/passwd')` is
 * stored as `url(&apos;…&apos;)`, looks safely escaped in the string, and
 * decodes back to a live `url()` the moment resvg parses the attribute. A
 * paint value has a small, known grammar, so matching it is both stricter and
 * simpler than reasoning about what survives a round trip.
 */
export function col(v: unknown, fallback = '#000000'): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/i.test(s)) return s;
  if (/^[a-z]{3,20}$/i.test(s)) return s; // a CSS named colour, or a harmless miss
  return fallback;
}

/**
 * Constrain a font family the same way, for the same reason.
 *
 * A family name is a list of identifiers and quoted strings; anything with a
 * bracket, a slash or a semicolon in it is not one.
 */
export function fontFamily(v: unknown, fallback = 'Arial'): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^[\w \-,.]{1,120}$/.test(s) ? s : fallback;
}

/**
 * Nothing we build contains an element that can reach outside the document.
 *
 * `rasterizeSVG` is where such a reference would actually be FETCHED, so this
 * is where the invariant is worth asserting. It looks for the ELEMENTS rather
 * than for the string `href`, because an escaped `href` inside a text node is
 * inert and flagging it would fail perfectly good renders — a caption reading
 * "see href= for details" is not an attack. Our builders emit `rect`, `text`,
 * `tspan`, `filter` and `linearGradient`; an `<image>` means something escaped
 * an attribute, and failing is the correct outcome. It also covers code
 * written after this comment, which is the point of putting it here.
 */
const FORBIDDEN = /<\s*(image|use|script|foreignObject|iframe)\b/i;

export function assertNoExternalRefs(svg: string): void {
  const hit = FORBIDDEN.exec(svg);
  if (hit)
    throw new Error(
      `refusing to rasterize SVG containing <${hit[1]}> (${JSON.stringify(
        svg.slice(Math.max(0, hit.index - 30), hit.index + 60),
      )})`,
    );
}
