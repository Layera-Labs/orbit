/**
 * The generator for `fixtures/xfade-field.json`, gated on `ORBIT_FFMPEG_PROBE=1`.
 *
 * `xfade-field.test.ts` asserts against that fixture on every run with no
 * ffmpeg anywhere, which is the right shape for CI and the wrong shape on its
 * own: for a while the fixture existed and the script that measured it did not,
 * so the numbers could be checked but never re-derived. This is that script.
 *
 * It re-measures EVERY family, including the ones already in the fixture, and
 * the run fails if a previously-measured one does not come back. That is the
 * self-check: a harness that reproduces seventeen known rows is a harness whose
 * new rows can be trusted. Without it, adding a family means measuring it with
 * an instrument nothing has calibrated.
 *
 * Sources are flat black and flat white for the reason `xfade-field.test.ts`
 * gives at length — on grey there is no chroma, so a byte read back IS the
 * incoming clip's weight, with no YUV round trip to hide an error behind.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFFmpegArgs } from '../ffmpeg';
import type { VideoProject } from '../types';
import { TRANSITIONS, xfadeStateAt, xfadeVeilAt } from '../xfade';

const ENABLED = process.env.ORBIT_FFMPEG_PROBE === '1';
const PATH = join(__dirname, 'fixtures', 'xfade-field.json');

interface Field {
  note: string;
  w: number;
  h: number;
  fps: number;
  duration: number;
  offset: number;
  frames: number[];
  points: [number, number][];
  samples: Record<string, number[][]>;
}

const fixture: Field = JSON.parse(readFileSync(PATH, 'utf8'));
const { w: W, h: H, fps, duration: OVERLAP, offset: AT, frames, points } = fixture;
const CLIP = AT + OVERLAP;

/**
 * The families this file measures, derived rather than listed: every
 * previewable one that changes the frame by something OTHER than moving it.
 *
 * The rule is forced by the sources. Flat black and flat white are what make a
 * byte readable as a weight, and a flat field translated is the same flat
 * field — so a displacement family (the shakes, and the edge families
 * `xfade-probe.test.ts` owns with its coordinate ramps) would record a row here
 * that agrees with any implementation at all, including a broken one. Those are
 * covered where they can be seen: `shake.test.ts` against the emitted
 * expression, `xfade-probe.test.ts` against ramp sources.
 *
 * So a family joins by carrying a mask, a hole, a scale, a block or a veil —
 * which is to say by being implemented, not by being named here. `blurX` is
 * deliberately not on that list: `xfade-field.test.ts` predicts the composite
 * from `xfadeStateAt` and has no box filter in it, so an `hblur` row would be a
 * measurement nothing could check.
 */
const FAMILIES = TRANSITIONS.flatMap((f) => f.variants.map((v) => v.type))
  .filter((t) => {
    if (t === 'cut' || t === 'fade') return false;
    if (xfadeVeilAt(t, 0.5)) return true;
    let field = false;
    // Sampled either side of the midpoint and on both sides of the cut, because
    // several families do their whole job in one half: `zoomin` scales only the
    // OUTGOING clip, and only before `p = 0.5`.
    for (const p of [0.35, 0.5, 0.65])
      for (const role of ['from', 'to'] as const) {
        const s = xfadeStateAt(t, p, role, W, H);
        // A `clip` is a moving EDGE, which is the other fixture's subject: it
        // owns those with coordinate ramps that can tell a slide from a wipe.
        if (s.clip) return false;
        if (s.mask || s.hole || s.scale || s.block) field = true;
      }
    return field;
  })
  .sort();

function ffmpeg(args: string[]): Buffer {
  return execFileSync('ffmpeg', ['-v', 'error', ...args], {
    maxBuffer: 1 << 28,
    encoding: 'buffer',
  });
}

function project(type: string): VideoProject {
  return {
    id: 'field',
    schemaVersion: 3,
    width: W,
    height: H,
    fps,
    background: { type: 'color', color: '#000000' },
    clips: [],
    overlays: [],
    audio: [],
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [
          { id: 'a', type: 'image', src: 'a', start: 0, duration: CLIP },
          {
            id: 'b',
            type: 'image',
            src: 'b',
            start: AT,
            duration: CLIP,
            transitionIn: { type, duration: OVERLAP } as never,
          },
        ],
      },
    ],
  } as VideoProject;
}

describe.skipIf(!ENABLED)('xfade field fixture, measured', () => {
  let dir = '';
  let a = '';
  let b = '';
  let base = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-field-'));
    a = join(dir, 'a.png');
    b = join(dir, 'b.png');
    ffmpeg(['-y', '-f', 'lavfi', '-i', `color=black:s=${W}x${H}:d=1`, '-frames:v', '1', a]);
    ffmpeg(['-y', '-f', 'lavfi', '-i', `color=white:s=${W}x${H}:d=1`, '-frames:v', '1', b]);
    base = join(dir, 'base.png');
    ffmpeg(['-y', '-f', 'lavfi', '-i', `color=black:s=${W}x${H}:d=1`, '-frames:v', '1', base]);
  });

  it('re-measures every family and reproduces the ones already recorded', () => {
    const samples: Record<string, number[][]> = {};
    const drift: string[] = [];

    for (const name of FAMILIES) {
      const args = buildFFmpegArgs(project(name), {
        outputPath: '/dev/null',
        baseImage: base,
        resolveSrc: (s) => (s === 'a' ? a : b),
        hasAudio: () => false,
      });
      // Cut the encoder off: the measurement is about the FILTERGRAPH, and
      // running it through libx264 would fold the encoder's losses into it.
      const cut = args.indexOf('-c:v');
      expect(cut).toBeGreaterThan(0);
      const raw = ffmpeg([
        ...args.slice(1, cut),
        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
      ]);

      const stride = W * H * 4;
      samples[name] = frames.map((n) => {
        const off = n * stride;
        expect(raw.length).toBeGreaterThanOrEqual(off + stride);
        // R only: the sources are grey, so the three channels carry the same
        // number and reading one keeps the fixture a third of the size.
        return points.map(([x, y]) => raw[off + (y * W + x) * 4]);
      });

      const was = fixture.samples[name];
      if (!was) continue;
      /*
       * Calibration, to a byte rather than to exact equality. The rows already
       * in the fixture were measured by a different script and come back within
       * 1/255 here — the same tolerance `xfade-field.test.ts` holds the maths
       * to, and the same rounding step that separates reading a grey pixel's R
       * from reading its luma. Anything larger is the engine having changed
       * under a family, not an instrument difference.
       */
      let worst = 0;
      was.forEach((row, fi) =>
        row.forEach((v, pi) => {
          worst = Math.max(worst, Math.abs(v - samples[name][fi][pi]));
        }),
      );
      if (worst > 1) drift.push(`${name}:${worst}`);
      // Keep the original row. It is a measurement, and re-recording it at a
      // byte's difference would churn the fixture on every run for no gain.
      samples[name] = was;
    }

    /*
     * A family that was measured before and does not come back means either the
     * engine changed under it or this harness does not reproduce the one that
     * wrote the fixture. Either way the NEW rows in the same run were taken
     * with an uncalibrated instrument, so nothing is written.
     */
    expect(drift).toEqual([]);

    writeFileSync(PATH, `${JSON.stringify({ ...fixture, samples }, null, 1)}\n`);
  });
});
