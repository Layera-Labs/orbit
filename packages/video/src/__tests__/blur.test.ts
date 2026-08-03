/**
 * Blur: the fourth AUTHORED family, and the only one whose export cannot be
 * written as an expression at all.
 *
 * `gblur`'s sigma is a plain option — settable at runtime, but not evaluated
 * per frame — so where the shakes, the flashes and the zooms are all a function
 * of `t` handed to ffmpeg, this one is a list of `sendcmd` commands. That makes
 * the schedule itself the thing to test: which frame each command lands on, and
 * what sigma it carries.
 *
 * Two facts underneath it, both measured against ffmpeg 8.1.2 rather than
 * assumed, and both of which produce a plausible-looking wrong picture:
 *
 * 1. **`sendcmd` fires on the first frame at or after its timestamp**, the same
 *    rule `fade` follows. A command written at `0.0667` on a 30fps stream lands
 *    on frame 3, not the frame at `0.06667`, because the printed decimal is a
 *    hair larger. Hence the half-frame-early stamp, asserted below.
 * 2. **`gblur` is an IIR approximation and comes out 20% NARROW.** Nominal 1, 2,
 *    4, 8, 16 fit effective 0.80, 1.50, 3.20, 6.50, 12.95 against a true
 *    gaussian. Both previews take a real sigma, so the export multiplies by
 *    1.25 — without it the file was a quarter less blurred than the picture the
 *    user watched, which reads as a codec artefact and is not one.
 *
 * With both applied, a rendered edge fits `blurSigmaAt` at every frame of the
 * transition, with ~8/255 left over: the shape difference between an IIR
 * approximation and a convolution, recorded like the grade's residual.
 */
import { describe, expect, it } from 'vitest';
import {
  blurCommands,
  blurSigmaAt,
  isAuthoredTransition,
  ridesOverlayPath,
  unsupportedTransitions,
  xfadeHasPreview,
  xfadeStateAt,
} from '../xfade';
import type { TransitionType } from '../types';

const BLURS: TransitionType[] = ['blur1', 'blur2'];
const W = 1080;
const H = 1920;

describe('blur', () => {
  it('is perfectly sharp at both ends of the transition', () => {
    // The load-bearing half, as the shake envelope is. A blur that started or
    // stopped mid-ramp would pop into and out of focus on one frame.
    for (const name of BLURS) {
      for (const p of [0, 1]) expect([name, p, blurSigmaAt(name, p, W, H)]).toEqual([name, p, 0]);
      expect(blurSigmaAt(name, 0.5, W, H)).toBeGreaterThan(0);
    }
    expect(blurSigmaAt('blur2', 0.5, W, H)).toBeGreaterThan(blurSigmaAt('blur1', 0.5, W, H));
  });

  it('scales with the frame, not with the pixel count', () => {
    // A sigma in absolute pixels would be four times as strong at 4K as at
    // 540p, so the same transition would read as a different one per export
    // preset. It is a fraction of the SHORT side, so 1080x1920 and 1920x1080
    // blur identically.
    expect(blurSigmaAt('blur1', 0.5, 1080, 1920)).toBeCloseTo(
      blurSigmaAt('blur1', 0.5, 1920, 1080),
      9,
    );
    expect(blurSigmaAt('blur1', 0.5, 2160, 3840)).toBeCloseTo(
      2 * blurSigmaAt('blur1', 0.5, 1080, 1920),
      9,
    );
  });

  it('stamps every command onto exactly one frame, half a frame early', () => {
    for (const name of BLURS) {
      for (const fps of [24, 30, 60]) {
        for (const at of [0, 1, 2.37]) {
          const overlap = 0.8;
          const cmds = blurCommands(name, at, overlap, fps, W, H);
          expect(cmds.length).toBeGreaterThan(1);
          for (const c of cmds) {
            /*
             * The frame this command selects, under ffmpeg's rule: the first
             * frame at or after the timestamp. Asserting it lands strictly
             * inside the gap is what makes the schedule robust to how the
             * number prints — which is the entire bug this stamp exists for.
             */
            const n = Math.ceil(c.t * fps);
            expect(c.t * fps).toBeGreaterThan(n - 1);
            expect(c.t * fps).toBeLessThanOrEqual(n);
            const p = (n / fps - at) / overlap;
            expect([name, fps, n, c.sigma]).toEqual([
              name,
              fps,
              n,
              expect.closeTo(blurSigmaAt(name, p, W, H) * 1.25, 9),
            ]);
          }
          // One per output frame in the window, none repeated and none skipped.
          const frames = cmds.map((c) => Math.ceil(c.t * fps));
          expect(new Set(frames).size).toBe(cmds.length);
          expect(Math.max(...frames) - Math.min(...frames)).toBe(cmds.length - 1);
        }
      }
    }
  });

  it('the commands are ordered, which sendcmd requires', () => {
    for (const name of BLURS) {
      const cmds = blurCommands(name, 1, 1, 30, W, H);
      for (let i = 1; i < cmds.length; i++) expect(cmds[i].t).toBeGreaterThan(cmds[i - 1].t);
    }
  });

  it('blurs BOTH sides, because it is the frame that goes soft', () => {
    // Blurring only the incoming clip would read as it arriving out of focus
    // over a sharp one, which is a different effect entirely.
    for (const name of BLURS) {
      const to = xfadeStateAt(name, 0.4, 'to', W, H);
      const from = xfadeStateAt(name, 0.4, 'from', W, H);
      expect([name, to.blur]).toEqual([name, from.blur]);
      expect(to.alpha).toBeCloseTo(0.4, 6);
      expect(from.alpha).toBe(1);
    }
  });

  it('cannot be missing from a server, because it names no token', () => {
    for (const name of BLURS) {
      expect([name, ridesOverlayPath(name)]).toEqual([name, true]);
      expect([name, isAuthoredTransition(name)]).toEqual([name, true]);
      expect([name, xfadeHasPreview(name)]).toEqual([name, true]);
    }
    expect(
      unsupportedTransitions(
        BLURS.map((name, i) => ({ index: i + 1, prevId: 'a', nextId: 'b', name, overlap: 0.5, at: 1 })),
        ['fade'],
      ),
    ).toEqual([]);
  });
});
