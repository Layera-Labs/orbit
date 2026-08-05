/**
 * `visibleStroke`, which exists because a truthiness check was not enough.
 *
 * Every shape `ElementsSection` creates carries `stroke: 'transparent'`. That
 * is a non-empty string, so `el.stroke || fallback` keeps it — and dragging the
 * outline thickness up wrote 8px of invisible outline. The control looked
 * broken in the worst way available: not obviously dead, so you drag it
 * further and nothing ever appears.
 */
import { describe, expect, it } from 'vitest';
import { visibleStroke } from '../strokeColour';

describe('visibleStroke', () => {
  it('rejects the values that mean "no colour"', () => {
    for (const v of ['transparent', 'none', '', '   ', 'TRANSPARENT', 'None'])
      expect(visibleStroke(v)).toBeNull();
  });

  it('rejects a hex colour whose alpha is zero, in both lengths', () => {
    // The 4-digit form carries alpha in ONE character and the 8-digit form in
    // two, so reading two off the end of `#00f0` would find `f0` and call a
    // fully transparent colour visible.
    for (const v of ['#0000', '#00f0', '#f000', '#00000000', '#ff00ff00'])
      expect(visibleStroke(v), v).toBeNull();
  });

  it('keeps a colour that is actually visible', () => {
    for (const v of ['#100f0e', '#fff', '#00ff00ff', '#00fa', 'red', 'rgb(1,2,3)'])
      expect(visibleStroke(v), v).toBe(v);
  });

  it('rejects anything that is not a string', () => {
    for (const v of [undefined, null, 0, 8, {}, []]) expect(visibleStroke(v)).toBeNull();
  });
});
