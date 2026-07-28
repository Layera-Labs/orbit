import { describe, expect, it } from 'vitest';
import { overlayBox, overlayToSVG } from '../overlay-svg';
import type { TextOverlay } from '../types';

const base: TextOverlay = {
  id: 'o1',
  type: 'text',
  text: 'Title',
  x: 0.5,
  y: 0.5,
  start: 0,
  end: 4,
  fontSize: 96,
  color: '#fff',
};

/*
 * `overlayBox` exists because a caption's `DrawOp.dst` is the whole frame, so
 * an editor cannot learn from the ops where the words are. It is therefore the
 * ONLY description of that rectangle — which makes "does it agree with what is
 * actually drawn" the only thing worth testing.
 */
describe('overlayBox', () => {
  it('is the rectangle the SVG draws for a boxed caption', () => {
    const o: TextOverlay = { ...base, box: { color: '#000', padding: 20 } };
    const b = overlayBox(o, 1920, 1080);
    const svg = overlayToSVG(o, 1920, 1080);
    const rect = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    expect(rect).not.toBeNull();
    const [, x, y, w, h] = rect!;
    // The SVG rounds to 2dp on the way out; the box does not.
    expect(Number(x)).toBeCloseTo(b.x, 1);
    expect(Number(y)).toBeCloseTo(b.y, 1);
    expect(Number(w)).toBeCloseTo(b.w, 1);
    expect(Number(h)).toBeCloseTo(b.h, 1);
  });

  /* `dominant-baseline: middle` centres a single line ON the anchor, so the box
     has to be centred there too or the outline sits off the words. */
  it('centres a single centred line on its anchor', () => {
    const b = overlayBox(base, 1920, 1080);
    expect(b.x + b.w / 2).toBeCloseTo(960, 6);
    expect(b.y + b.h / 2).toBeCloseTo(540, 6);
  });

  it('hangs a left-aligned caption off the anchor, and a right-aligned one back from it', () => {
    const left = overlayBox({ ...base, align: 'left' }, 1920, 1080);
    const right = overlayBox({ ...base, align: 'right' }, 1920, 1080);
    expect(left.x).toBeCloseTo(960, 6);
    expect(right.x + right.w).toBeCloseTo(960, 6);
  });

  it('grows down the frame with each line, around the same anchor', () => {
    const one = overlayBox(base, 1920, 1080);
    const three = overlayBox({ ...base, text: 'a\nb\nc' }, 1920, 1080);
    expect(three.h).toBeCloseTo(one.h * 3, 6);
    expect(three.y + three.h / 2).toBeCloseTo(one.y + one.h / 2, 6);
  });

  /* An empty caption still has to be pointable, or it can never be selected on
     the canvas to be given text. */
  it('keeps a clickable box for an empty caption', () => {
    const b = overlayBox({ ...base, text: '' }, 1920, 1080);
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
  });
});
