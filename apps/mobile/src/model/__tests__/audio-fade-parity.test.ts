/**
 * Mobile's fade helpers against the canonical ones in `packages/video`.
 *
 * The canonical copy now lives in `packages/video/src/audio-fade.ts` because
 * the web imports it — mobile installs outside the pnpm workspace and cannot,
 * so it keeps this vendored copy, exactly like `canvasFrame.ts` and the rest of
 * the mirrored engine. Nothing about mobile's behaviour changed when the copy
 * was promoted; this test is what keeps that true.
 *
 * What is asserted is that the two are the same FUNCTION over the inputs that
 * actually differ between implementations of "a curve overrides volume":
 * the clamp at the ceiling, the removal of a curve when both fades reach zero,
 * a duck (which is not a fade pair and must come back null), and a clip too
 * short to hold the fade it is asked for.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_FADE,
  MAX_VOLUME,
  fadesOf,
  maxFadeFor,
  withFades,
  withVolume,
} from "../audio-fade";
import type { VolumePoint } from "../types";

// By path, not package name: mobile installs outside the pnpm workspace.
const load = () => import("../../../../../packages/video/src/audio-fade");

const DUCK: VolumePoint[] = [
  { t: 0, v: 1 },
  { t: 0.4, v: 0.2 },
  { t: 0.6, v: 0.2 },
  { t: 1, v: 1 },
];

const CLIPS: { duration: number; volume?: number; volumeCurve?: VolumePoint[] }[] = [
  { duration: 10 },
  { duration: 10, volume: 0.5 },
  { duration: 10, volume: 3 },
  { duration: 0.4 },
  { duration: 10, volumeCurve: DUCK },
  {
    duration: 10,
    volumeCurve: [
      { t: 0, v: 0 },
      { t: 0.1, v: 1 },
      { t: 0.9, v: 1 },
      { t: 1, v: 0 },
    ],
  },
  { duration: 10, volumeCurve: [{ t: 0, v: 0 }, { t: 1, v: 0 }] },
];

const FADES = [0, 0.5, 2, MAX_FADE, MAX_FADE + 10];
const LEVELS = [0, 0.5, 1, 2, MAX_VOLUME, MAX_VOLUME + 3, -1];

describe("mobile mirrors packages/video", () => {
  it("agrees on the constants", async () => {
    const shared = await load();
    expect(MAX_FADE).toBe(shared.MAX_FADE);
    expect(MAX_VOLUME).toBe(shared.MAX_VOLUME);
  });

  it("reads the same fades back out of every clip", async () => {
    const shared = await load();
    for (const c of CLIPS) expect(fadesOf(c)).toEqual(shared.fadesOf(c as never));
  });

  it("caps a fade at the same length", async () => {
    const shared = await load();
    for (const d of [0, 0.4, 3, 10, 120])
      expect(maxFadeFor(d)).toBe(shared.maxFadeFor(d));
  });

  it("writes the same envelope for every level and fade pair", async () => {
    const shared = await load();
    for (const c of CLIPS)
      for (const volume of LEVELS)
        for (const fadeIn of FADES)
          for (const fadeOut of FADES) {
            const args = { volume, fadeIn, fadeOut };
            expect(withFades(c.duration, args)).toEqual(
              shared.withFades(c.duration, args),
            );
          }
  });

  it("scales or moves a level the same way", async () => {
    const shared = await load();
    for (const c of CLIPS)
      for (const v of LEVELS)
        expect(withVolume(c, v)).toEqual(shared.withVolume(c as never, v));
  });
});
