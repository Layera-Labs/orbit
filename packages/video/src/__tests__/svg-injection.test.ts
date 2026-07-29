/**
 * SVG injection: the numbers in a project are not numbers.
 *
 * A `VideoProject` arrives as JSON over HTTP and is cast, never validated, so
 * every `number` field is whatever the caller sent. These builders assemble
 * markup by concatenation, and a string containing `"` closes the attribute it
 * lands in — the remainder becomes markup.
 *
 * The demonstrated impact was not defacement. `font-size` carrying
 * `48" /><image href="/…/orbit-render-media/u_1.bin" …` made resvg load that
 * file off local disk and composite it into the frame, and the attacker then
 * downloaded the render: any image on the box, INCLUDING OTHER ACCOUNTS'
 * UPLOADS, read out through a field that sets a font size. Verified against a
 * real media directory before this was written.
 *
 * These tests are written as the attack, not as assertions about `num`, so
 * they keep meaning if the escaping is ever reimplemented.
 */
import { describe, expect, it } from 'vitest';
import { backgroundToSVG } from '../background-svg';
import { overlayToSVG } from '../overlay-svg';
import { assertNoExternalRefs, col, num } from '../svg';
import type { Background, TextOverlay } from '../types';

/** A caption with one field poisoned, cast the way the server casts a body. */
const poisoned = (field: Partial<Record<keyof TextOverlay, unknown>>): TextOverlay =>
  ({
    text: 'hello',
    x: 0.5,
    y: 0.5,
    fontSize: 32,
    color: '#ffffff',
    start: 0,
    end: 2,
    ...field,
  }) as unknown as TextOverlay;

const BREAKOUT = '48" /><image href="/etc/passwd" width="99" /><text font-size="10';

describe('a project number cannot become markup', () => {
  it('cannot close the font-size attribute — the one that was exploited', () => {
    const svg = overlayToSVG(poisoned({ fontSize: BREAKOUT }), 400, 300);
    expect(() => assertNoExternalRefs(svg)).not.toThrow();
    expect(svg).toContain('font-size="32"'); // fell back, did not emit NaN
  });

  /* Every numeric field, not just the one that was found. A fix that covered
     `fontSize` alone would leave the identical hole in five other places. */
  it.each([
    ['letterSpacing', { letterSpacing: BREAKOUT }],
    ['lineHeight', { lineHeight: BREAKOUT }],
    ['x', { x: BREAKOUT }],
    ['y', { y: BREAKOUT }],
    ['box.opacity', { box: { color: '#000', opacity: BREAKOUT, padding: 8 } }],
    ['box.padding', { box: { color: '#000', opacity: 1, padding: BREAKOUT } }],
    ['shadow.opacity', { shadow: { color: '#000', opacity: BREAKOUT } }],
    ['shadow.blur', { shadow: { color: '#000', blur: BREAKOUT } }],
    ['shadow.dx', { shadow: { color: '#000', dx: BREAKOUT } }],
    ['stroke.width', { stroke: { color: '#000', width: BREAKOUT } }],
  ])('holds for %s', (_name, field) => {
    const svg = overlayToSVG(poisoned(field), 400, 300);
    expect(() => assertNoExternalRefs(svg)).not.toThrow();
  });

  it('holds for the frame size, which also comes from the project', () => {
    const o = poisoned({});
    expect(() => assertNoExternalRefs(overlayToSVG(o, BREAKOUT as unknown as number, 300))).not.toThrow();
    expect(() => assertNoExternalRefs(overlayToSVG(o, 400, BREAKOUT as unknown as number))).not.toThrow();
  });

  /*
   * Colours are constrained rather than escaped, and this is why. `esc` is an
   * XML transform and the PARSER UNDOES IT: `url('/etc/passwd')` stores as
   * `url(&apos;…&apos;)`, looks safely escaped, and decodes back to a live
   * reference before resvg ever sees it. Escaping a value that gets re-parsed
   * as CSS is not escaping.
   */
  it('holds for colours, including a url() that would survive escaping', () => {
    const svg = overlayToSVG(
      poisoned({
        color: "url('/etc/passwd')",
        fontFamily: BREAKOUT,
        text: '</text><image href="/x"/>',
      }),
      400,
      300,
    );
    expect(() => assertNoExternalRefs(svg)).not.toThrow();
    expect(svg).not.toContain('url(');
    expect(svg).not.toContain('&apos;');
  });

  /* Text is a TEXT NODE, not a re-parsed attribute, so escaping is the right
     tool there — and it must stay readable rather than being stripped. */
  it('keeps caption text intact while making it inert', () => {
    const svg = overlayToSVG(poisoned({ text: 'Rock & Roll <3 "quoted"' }), 400, 300);
    expect(() => assertNoExternalRefs(svg)).not.toThrow();
    expect(svg).toContain('Rock &amp; Roll &lt;3 &quot;quoted&quot;');
  });

  it('holds for the background builder too', () => {
    const grad = {
      type: 'gradient',
      from: BREAKOUT,
      to: '#000',
      angle: BREAKOUT,
    } as unknown as Background;
    expect(() => assertNoExternalRefs(backgroundToSVG(grad, BREAKOUT as unknown as number, 300))).not.toThrow();
    expect(() =>
      assertNoExternalRefs(backgroundToSVG({ type: 'color', color: BREAKOUT } as Background, 400, 300)),
    ).not.toThrow();
  });
});

describe('num', () => {
  it('emits only a number, whatever it is handed', () => {
    for (const v of [BREAKOUT, '1e999', NaN, Infinity, null, undefined, {}, [], '12px'])
      expect(num(v)).toMatch(/^-?\d+(\.\d+)?$/);
  });

  /* NaN in a coordinate silently drops the element, so a caption would vanish
     on export while showing in the preview — a bug wearing a fix's clothes. */
  it('falls back rather than emitting NaN', () => {
    expect(num('nonsense', 32)).toBe('32');
    expect(num(undefined, 1)).toBe('1');
  });

  it('keeps real numbers intact, rounded to 2dp', () => {
    expect(num(12.3456)).toBe('12.35');
    expect(num(-4)).toBe('-4');
    expect(num(0)).toBe('0');
  });
});

describe('colours are constrained, not escaped', () => {
  it('passes real colours through untouched', () => {
    for (const c of ['#fff', '#ff0000', '#ff0000cc', 'rgb(1,2,3)', 'rgba(1,2,3,0.5)', 'red'])
      expect(col(c)).toBe(c);
  });

  it('replaces anything that is not a colour', () => {
    for (const c of ["url('/etc/passwd')", 'url(#g)', '<script>', '', null, 42, 'a;b'])
      expect(col(c as unknown as string, '#123456')).toBe('#123456');
  });
});

describe('the rasterizer refuses elements that can reach outside', () => {
  /* The invariant that protects code written after this file: resvg is where a
     reference is actually FETCHED, and nothing we build emits such an element. */
  it('throws on the elements that fetch', () => {
    expect(() => assertNoExternalRefs('<svg><image href="/etc/passwd"/></svg>')).toThrow(/image/i);
    expect(() => assertNoExternalRefs('<svg><IMAGE xlink:href="/etc/passwd"/></svg>')).toThrow();
    expect(() => assertNoExternalRefs('<svg>< image href="/x"/></svg>')).toThrow();
    expect(() => assertNoExternalRefs('<svg><use href="/x"/></svg>')).toThrow();
    expect(() => assertNoExternalRefs('<svg><script>x</script></svg>')).toThrow();
  });

  /*
   * And it must NOT fire on inert text. A caption is allowed to say the word
   * href; escaping already made it a text node. Failing that render would be a
   * fix that broke the product.
   */
  it('leaves escaped text alone', () => {
    const svg = overlayToSVG(poisoned({ text: '<image href="/etc/passwd">' }), 400, 300);
    expect(() => assertNoExternalRefs(svg)).not.toThrow();
  });

  /* Internal references are how the real output works — a gradient and the
     shadow filter both use url(#id) — so this must not be a blanket ban. */
  it('allows the internal references our own output contains', () => {
    expect(() =>
      assertNoExternalRefs(backgroundToSVG({ type: 'gradient', from: '#000', to: '#fff' } as Background, 8, 8)),
    ).not.toThrow();
    expect(() =>
      assertNoExternalRefs(
        overlayToSVG(poisoned({ shadow: { color: '#000', opacity: 0.5 } }), 8, 8),
      ),
    ).not.toThrow();
  });
});
