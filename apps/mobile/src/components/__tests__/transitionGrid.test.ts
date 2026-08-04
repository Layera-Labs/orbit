// The property the old hard-coded 38 got wrong by two points.
import { describe, expect, it } from 'vitest';
import {
  COL_GAP,
  MAX_TILE,
  MIN_TILE,
  contentWidth,
  familyWidth,
  tileSize,
} from '../transitionGrid';

/**
 * Every portrait width this app can actually run on. The narrowest is 375 — the
 * SE 2nd/3rd gen and the 13 mini; 320 belongs to the SE 1st gen, which cannot
 * run an iOS this Expo SDK supports and so is not a target.
 */
const PHONES = [
  { name: 'SE 2nd/3rd gen, 13 mini', width: 375 },
  { name: '14 / 15 / 16 / 17', width: 393 },
  { name: '17 Pro', width: 402 },
  { name: '15 Pro Max', width: 430 },
  { name: '17 Pro Max', width: 440 },
];

describe('the transition grid pairs two four-variant families', () => {
  /*
   * The whole point. Wipe, Slide, Push and Reveal have four variants each, and
   * if two of them cannot share a row the grid doubles in height — which is how
   * the sheet came to overflow the screen. Asserted at every real width, not at
   * the one the author happened to hold.
   */
  it.each(PHONES)('fits two 4-variant families at $width ($name)', ({ width }) => {
    const tile = tileSize(width);
    const two = familyWidth(4, tile) * 2 + COL_GAP;
    expect(two).toBeLessThanOrEqual(contentWidth(width));
  });

  it('fails the old fixed 38 on the phone it was written for', () => {
    // 402pt iPhone 17 Pro: content 366, two blocks 368. Two points short — the
    // regression this module exists to make visible.
    expect(familyWidth(4, 38) * 2 + COL_GAP).toBeGreaterThan(contentWidth(402));
    expect(familyWidth(4, tileSize(402)) * 2 + COL_GAP).toBeLessThanOrEqual(
      contentWidth(402),
    );
  });

  it('stays legible, and never inflates into a button', () => {
    for (const { width } of PHONES) {
      expect(tileSize(width)).toBeGreaterThanOrEqual(MIN_TILE);
      expect(tileSize(width)).toBeLessThanOrEqual(MAX_TILE);
    }
  });

  it('grows with the screen rather than jumping about', () => {
    const sizes = [...PHONES]
      .sort((a, b) => a.width - b.width)
      .map((p) => tileSize(p.width));
    for (let i = 1; i < sizes.length; i++)
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
  });

  /*
   * Below the range above, the floor wins and pairing stops being possible —
   * four 32pt tiles plus gaps is 152 against a 126pt column at 320. That is the
   * right trade rather than a gap: a tile IS the transition, and shrinking it
   * further to force a pair would make the mask families indistinguishable. An
   * unreadable swatch is worse than an extra row in a scroller. No shipping
   * phone is this narrow; the case is asserted so the clamp is deliberate.
   */
  it('lets the legibility floor win rather than shrink past readable', () => {
    expect(tileSize(320)).toBe(MIN_TILE);
    expect(familyWidth(4, tileSize(320)) * 2 + COL_GAP).toBeGreaterThan(
      contentWidth(320),
    );
  });
});
