import { describe, expect, it } from 'vitest';
import { computeSnap } from '../snapping';

describe('computeSnap', () => {
  it('snaps left edge to a peer left edge within threshold', () => {
    const moving = { x: 103, y: 200, width: 50, height: 50 };
    const peer = { x: 100, y: 0, width: 80, height: 80 };
    const result = computeSnap(moving, [peer], { threshold: 6 });
    expect(result.x).toBe(100);
    expect(result.guides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
  });

  it('does not snap when outside threshold', () => {
    // moving edges {200,220,240} vs peer edges {100,140,180}: nearest gap = 20 > 6
    const moving = { x: 200, y: 300, width: 40, height: 40 };
    const peer = { x: 100, y: 0, width: 80, height: 80 };
    const result = computeSnap(moving, [peer], { threshold: 6 });
    expect(result.x).toBe(200);
    expect(result.guides).toHaveLength(0);
  });

  it('snaps center to page center', () => {
    const moving = { x: 0, y: 0, width: 100, height: 100 };
    // center would be at 50; page center at 500 -> not within threshold
    const result = computeSnap(moving, [], {
      threshold: 6,
      page: { width: 100, height: 100 },
    });
    // moving centerX=50 == page centerX=50 -> snaps, delta 0
    expect(result.x).toBe(0);
    expect(result.guides.some((g) => g.axis === 'x')).toBe(true);
  });

  it('snaps on both axes simultaneously', () => {
    const moving = { x: 98, y: 47, width: 40, height: 40 };
    const peer = { x: 100, y: 50, width: 40, height: 40 };
    const result = computeSnap(moving, [peer], { threshold: 6 });
    expect(result.x).toBe(100);
    expect(result.y).toBe(50);
    expect(result.guides).toHaveLength(2);
  });
});
