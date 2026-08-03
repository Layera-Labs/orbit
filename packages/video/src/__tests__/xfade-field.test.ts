/**
 * The seventeen families whose transition is a FIELD over the frame, held to
 * what ffmpeg actually produced.
 *
 * `xfade-probe.test.ts` covers the families that cut and translate the frame,
 * where the interesting question is where an edge lands. These are the other
 * kind: a soft alpha mask, a dip through a solid, a squeeze, a zoom, a
 * pixelation grid. What has to be right is a NUMBER per pixel, so the fixture
 * is a lattice of measured bytes and this reproduces each one.
 *
 * Two things about how the fixture was measured, both of which were wrong on
 * the first attempt and both of which produce a confident-looking lie:
 *
 * 1. **The sources are greyscale**, black to white. With saturated colours the
 *    YUV round trip alone contributes ~12/255 on the blue channel — enough to
 *    swallow a real error, and enough to make a correct formula look broken.
 *    On grey there is no chroma, so a byte read back IS the incoming clip's
 *    weight.
 * 2. **`p` is DERIVED from the frame index**, never chosen. Asking for `p=0.25`
 *    at 30fps lands on frame 38, which is a `p` of 0.2667; on `radial`, whose
 *    ramp covers 2.5π, that half-frame reads as a **49/255** error in maths
 *    that is exactly right. Every "mismatch" in the first run was this.
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/xfade-field.json';
import { xfadeMaskAt, xfadeStateAt, xfadeVeilAt, xfadeHasPreview } from '../xfade';
import type { TransitionType } from '../types';

const { w: W, h: H, fps, duration, offset, frames, points, samples } = fixture as {
  w: number;
  h: number;
  fps: number;
  duration: number;
  offset: number;
  frames: number[];
  points: [number, number][];
  samples: Record<string, number[][]>;
};

/**
 * What the compositors will put on screen at one pixel, in the same layer order
 * they draw in: the outgoing clip, then the veil, then the incoming clip.
 *
 * Sources are black and white, so this is the whole composite — which is the
 * point. Predicting only the incoming clip's weight cannot describe
 * `fadewhite`, where the veil is the same colour the incoming clip is.
 */
function composite(name: string, p: number, x: number, y: number): number {
  const to = xfadeStateAt(name, p, 'to', W, H);
  const veil = xfadeVeilAt(name, p);
  const inside = (c?: { x: number; y: number; w: number; h: number }) =>
    !!c && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h;

  let wB = to.alpha;
  if (to.mask) wB *= xfadeMaskAt(to.mask, x, y, W, H);
  if (to.clip && !inside(to.clip)) wB = 0;
  if (to.hole && inside(to.hole)) wB = 0;

  let surface = 0; // the outgoing clip: black
  if (veil) surface = surface * (1 - veil.alpha) + (veil.color === '#000000' ? 0 : 255) * veil.alpha;
  return surface * (1 - wB) + 255 * wB;
}

describe('field transitions reproduce ffmpeg', () => {
  for (const name of Object.keys(samples)) {
    it(`${name} matches the measured frame`, () => {
      let worst = 0;
      frames.forEach((n, fi) => {
        const p = (n / fps - offset) / duration;
        points.forEach(([x, y], pi) => {
          const d = Math.abs(samples[name][fi][pi] - composite(name, p, x, y));
          if (d > worst) worst = d;
        });
      });
      /*
       * One byte. Not a tolerance anyone had to negotiate — every family here
       * came out at 0 or 1 the first time the probe was measured correctly,
       * because all of them are exact arithmetic on the same two pictures.
       * Anything above this is a real change in behaviour, not drift.
       */
      expect(worst).toBeLessThanOrEqual(1);
    });
  }

  it('sampled inside the transition, not on either side of it', () => {
    // A frame outside [offset, offset+duration] is pure A or pure B and would
    // pass every assertion above while testing nothing at all.
    for (const n of frames) {
      const p = (n / fps - offset) / duration;
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it('the fixture actually varies across the frame', () => {
    // Guards the failure that made the first probe run report a clean pass on
    // seventeen families at once: empty buffers compared as NaN, and `NaN > 0`
    // is false, so nothing was ever tested.
    for (const name of Object.keys(samples)) {
      const flat = samples[name].flat();
      expect(new Set(flat).size).toBeGreaterThan(1);
    }
  });

  it('does not offer a family neither preview draws yet', () => {
    /*
     * The maths above is correct and the export renders all of it, but a picker
     * may only offer what BOTH previews draw. `xfadeHasPreview` is the gate,
     * and this holds it shut for anything whose Skia half has not landed — the
     * one way this work could ship a picker that promises more than the file.
     */
    for (const name of Object.keys(samples)) {
      expect(xfadeHasPreview(name as TransitionType)).toBe(false);
    }
  });
});
