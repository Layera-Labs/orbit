/**
 * Is this stroke colour one you could actually see?
 *
 * Its own module rather than a helper inside `ElementBar`, because importing
 * that component reaches `@orbit/editor` → konva → the native `canvas` binding,
 * which cannot load under jsdom. A pure function that needs testing should not
 * be behind a canvas.
 */

/**
 * A stroke colour you could see, or null.
 *
 * **A truthiness check is not enough here.** `ElementsSection` creates every
 * shape with `stroke: 'transparent'`, which is a non-empty string — so
 * `el.stroke || fallback` keeps the transparent one, and dragging the outline
 * thickness up writes 8px of invisible outline. The control appears to do
 * nothing, which is the worst outcome available: it is not obviously broken, so
 * you drag it further and still see nothing.
 */
export function visibleStroke(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!s || s === 'transparent' || s === 'none') return null;
  // The same colour spelled in hex. Alpha is the LAST channel, which is one
  // character in the 4-digit form and two in the 8-digit one — reading two off
  // the end of `#00f0` would find `f0` and call a transparent colour visible.
  if (/^#[0-9a-f]{4}$/.test(s) && s[4] === '0') return null;
  if (/^#[0-9a-f]{8}$/.test(s) && s.slice(7) === '00') return null;
  return typeof value === 'string' ? value : null;
}

/** Ink for an outline that has none yet. */
export const DEFAULT_STROKE = '#100f0e';
