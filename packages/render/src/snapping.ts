import type { Box, Guide } from './types';

export interface SnapResult {
  /** Adjusted top-left position for the moving box. */
  x: number;
  y: number;
  guides: Guide[];
}

export interface SnapOptions {
  /** Snap distance in canvas pixels. */
  threshold?: number;
  /** Page bounds to snap against (edges + center). */
  page?: { width: number; height: number };
}

interface SnapLine {
  value: number; // coordinate on the relevant axis
  rangeStart: number; // perpendicular extent start
  rangeEnd: number; // perpendicular extent end
}

function edgesX(box: Box): number[] {
  return [box.x, box.x + box.width / 2, box.x + box.width];
}

function edgesY(box: Box): number[] {
  return [box.y, box.y + box.height / 2, box.y + box.height];
}

/**
 * Compute a snapped position for `moving` against `peers` (and optional page
 * bounds). Pure function — no Konva, fully unit-testable. Returns the adjusted
 * origin plus the guide lines that should be drawn.
 */
export function computeSnap(
  moving: Box,
  peers: Box[],
  options: SnapOptions = {},
): SnapResult {
  const threshold = options.threshold ?? 6;

  const targetsX: SnapLine[] = [];
  const targetsY: SnapLine[] = [];

  for (const peer of peers) {
    for (const vx of edgesX(peer)) {
      targetsX.push({ value: vx, rangeStart: peer.y, rangeEnd: peer.y + peer.height });
    }
    for (const vy of edgesY(peer)) {
      targetsY.push({ value: vy, rangeStart: peer.x, rangeEnd: peer.x + peer.width });
    }
  }

  if (options.page) {
    const { width, height } = options.page;
    for (const vx of [0, width / 2, width]) {
      targetsX.push({ value: vx, rangeStart: 0, rangeEnd: height });
    }
    for (const vy of [0, height / 2, height]) {
      targetsY.push({ value: vy, rangeStart: 0, rangeEnd: width });
    }
  }

  let bestX: { delta: number; line: SnapLine; movingEdge: number } | null = null;
  for (const me of edgesX(moving)) {
    for (const line of targetsX) {
      const delta = line.value - me;
      if (Math.abs(delta) <= threshold) {
        if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
          bestX = { delta, line, movingEdge: me };
        }
      }
    }
  }

  let bestY: { delta: number; line: SnapLine; movingEdge: number } | null = null;
  for (const me of edgesY(moving)) {
    for (const line of targetsY) {
      const delta = line.value - me;
      if (Math.abs(delta) <= threshold) {
        if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
          bestY = { delta, line, movingEdge: me };
        }
      }
    }
  }

  const guides: Guide[] = [];
  let x = moving.x;
  let y = moving.y;

  if (bestX) {
    x = moving.x + bestX.delta;
    const span = [bestX.line.rangeStart, bestX.line.rangeEnd, y, y + moving.height];
    guides.push({
      axis: 'x',
      position: bestX.line.value,
      start: Math.min(...span),
      end: Math.max(...span),
    });
  }
  if (bestY) {
    y = moving.y + bestY.delta;
    const span = [bestY.line.rangeStart, bestY.line.rangeEnd, x, x + moving.width];
    guides.push({
      axis: 'y',
      position: bestY.line.value,
      start: Math.min(...span),
      end: Math.max(...span),
    });
  }

  return { x, y, guides };
}
