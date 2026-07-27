/**
 * Canvas placement snapping for the preview.
 *
 * The Object Snapping preference reads: "When off, objects snap only to edges
 * or center." So canvas edges and the centre line are ALWAYS live; the
 * preference adds alignment to the other objects on the canvas.
 *
 * Everything here is in normalized canvas units (0..1) and pure, so the drag
 * gesture stays a thin caller.
 */

/** Within this fraction of the canvas, a moving edge locks onto a target. */
export const SNAP_THRESHOLD = 0.012;

/** Edges + centre of the canvas itself. Always available. */
export const CANVAS_TARGETS: readonly number[] = [0, 0.5, 1];

export interface Span {
  /** Leading edge, normalized. */
  pos: number;
  /** Extent, normalized. 0 for a point (e.g. a caption anchor). */
  size: number;
}

/**
 * Alignment targets contributed by other objects on the canvas: each one's
 * leading edge, centre and trailing edge.
 */
export function objectTargets(others: readonly Span[]): number[] {
  const out: number[] = [];
  for (const o of others) {
    out.push(o.pos, o.pos + o.size / 2, o.pos + o.size);
  }
  return out;
}

/**
 * Snap a moving span to the nearest target, testing its leading edge, centre
 * and trailing edge. Returns the adjusted leading edge, or `pos` unchanged when
 * nothing is within `threshold`.
 *
 * Ties resolve to the smallest distance, so a box whose centre and edge are
 * both near targets locks to whichever is closer rather than to whichever
 * happened to be checked first.
 */
export function snapSpan(
  { pos, size }: Span,
  targets: readonly number[],
  threshold = SNAP_THRESHOLD,
): number {
  let bestPos = pos;
  let bestDist = threshold;
  for (const anchor of size > 0 ? [0, size / 2, size] : [0]) {
    for (const t of targets) {
      const d = Math.abs(pos + anchor - t);
      if (d < bestDist) {
        bestDist = d;
        bestPos = t - anchor;
      }
    }
  }
  return bestPos;
}

/** Targets for one axis: the canvas, plus other objects when `snapping` is on. */
export function targetsFor(
  snapping: boolean,
  others: readonly Span[],
): number[] {
  return snapping
    ? [...CANVAS_TARGETS, ...objectTargets(others)]
    : [...CANVAS_TARGETS];
}
