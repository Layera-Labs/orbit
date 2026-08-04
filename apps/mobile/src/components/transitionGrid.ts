/**
 * Geometry for the transition picker's tile grid.
 *
 * A module of its own, and tested, because the number this replaces was WRONG
 * and nothing could see it. The tile was a flat 38, chosen so two four-variant
 * families would sit side by side: `4*38 + 3*8` is 176, and "two of those plus
 * the block gap clears the sheet's 372pt of content".
 *
 * The sheet pads 18 a side, so the content is `width - 36` — **366pt on a 402pt
 * iPhone 17 Pro, not 372**. Two blocks need `2*176 + 16 = 368`. It missed by TWO
 * POINTS, so Wipe, Slide, Push and Reveal each took a whole row with ~190pt
 * stranded beside it, and the sheet grew past the top of the screen. The layout
 * that constant was chosen for never happened on any phone narrower than a Pro
 * Max.
 *
 * So the size is derived from the real width and the pairing is guaranteed
 * rather than hoped for. `transitionGrid.test.ts` asserts exactly that, at every
 * width a phone actually is — which is the check the comment could not perform.
 */

/** `BottomSheet`'s horizontal padding, per side. */
export const SHEET_PAD = 18;
/** `trWrap.columnGap` — between two family blocks. */
export const COL_GAP = 16;
/** `trRow.gap` — between a family's own variants. */
export const TILE_GAP = 8;
/** The widest family is four variants, so four is what has to fit in a column. */
export const MAX_VARIANTS = 4;

/**
 * Floor and ceiling on the tile.
 *
 * The floor is legibility: a tile IS the transition, drawn as a real frame at
 * `p = 0.42`, and under about 32pt the mask families stop telling each other
 * apart. The ceiling stops a large phone from inflating them into something
 * that reads as a button rather than a swatch.
 */
export const MIN_TILE = 32;
export const MAX_TILE = 44;

/** The tile edge, in points, for a window of `width` points. */
export function tileSize(width: number): number {
  const content = width - SHEET_PAD * 2;
  const col = (content - COL_GAP) / 2;
  const fit = Math.floor((col - (MAX_VARIANTS - 1) * TILE_GAP) / MAX_VARIANTS);
  return Math.max(MIN_TILE, Math.min(MAX_TILE, fit));
}

/** How wide a family of `n` variants renders at this tile size. */
export function familyWidth(n: number, tile: number): number {
  return n * tile + (n - 1) * TILE_GAP;
}

/** The content width the grid has to lay out inside. */
export function contentWidth(width: number): number {
  return width - SHEET_PAD * 2;
}
