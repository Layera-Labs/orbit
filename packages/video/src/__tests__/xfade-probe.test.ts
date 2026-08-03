/**
 * What ffmpeg's `xfade` transitions actually DO, measured.
 *
 * The same method that produced the colour grade's recorded tolerances and the
 * rotation notes in CLAUDE.md: probe ffmpeg with known pixels instead of
 * reasoning about the source. It caught three shipping dual-render bugs there,
 * and the alternative here is worse — a wipe's edge sits at
 * `(int)((1-p)*w)` with A on the `<=` side, which is a rule no amount of
 * reading the filter's C would settle to the pixel.
 *
 * **The inputs encode their own coordinates**, which is the whole trick. A is
 * `(x*4, y*4, 64)` and B is `(64, x*4, y*4)`, so every output pixel says which
 * clip it came from AND which source pixel — a translate, a scale, a clip and a
 * blend are all directly readable off one frame. Flat colours cannot tell
 * `slideleft` from `revealleft` at all, and `squeezeh` is indistinguishable
 * from identity on anything whose rows are the same.
 *
 * Two measurements, answering two different questions:
 *
 * 1. **The bare filter**, rgba end to end with no compositing. This is the
 *    ground truth `xfadeStateAt` has to reproduce, and it goes in the fixture.
 * 2. **The real filtergraph**, built by `buildFFmpegArgs`, to prove the xfade
 *    RUN — its transparent pad, its formats, and above all its `offset`
 *    arithmetic — puts the same picture on screen at the same second. This one
 *    carries a tolerance, because the finished run is composited in 4:2:0 like
 *    every other layer and chroma is half resolution there.
 *
 * Gated on `ORBIT_FFMPEG_PROBE=1` so CI stays hermetic. The fixture it writes
 * is checked in, and the second block below asserts against it on every run
 * with no ffmpeg anywhere — including that `xfadeStateAt` still reproduces the
 * measurements for every family the previews claim to render.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildFFmpegArgs } from '../ffmpeg';
import type { VideoProject } from '../types';
import { isAuthoredTransition, TRANSITIONS, xfadeStateAt, type XfState } from '../xfade';
import {
  FIXTURE_PATH,
  PROBE,
  lineOffsets,
  type ProbeFixture,
} from './xfade-fixture-shape';

const ENABLED = process.env.ORBIT_FFMPEG_PROBE === '1';

/**
 * Every catalogued `xfade` TOKEN.
 *
 * `cut` is the absence of a transition, and the authored families (Shake, and
 * whatever joins it) name no token at all — they are performed by the clips
 * themselves on the ordinary overlay path, so there is no `xfade=transition=`
 * for this file to measure. Note this is NOT `ridesOverlayPath`: `fade` rides
 * that path too and is still a token this file measures.
 */
const FAMILIES = TRANSITIONS.flatMap((f) => f.variants.map((v) => v.type)).filter(
  (t) => t !== 'cut' && !isAuthoredTransition(t),
);

function ffmpeg(args: string[]): Buffer {
  return execFileSync('ffmpeg', ['-v', 'error', ...args], {
    maxBuffer: 1 << 28,
    encoding: 'buffer',
  });
}

/**
 * The bare filter: two coordinate ramps, one `xfade`, rgba in and rgba out.
 *
 * No canvas, no base layer, no encoder — so what comes back is the filter's own
 * arithmetic with nothing else layered on it.
 */
function probeBare(a: string, b: string, name: string): Buffer {
  return ffmpeg([
    '-loop', '1', '-t', String(PROBE.clipSec), '-i', a,
    '-loop', '1', '-t', String(PROBE.clipSec), '-i', b,
    '-filter_complex',
    `[0:v]fps=${PROBE.fps},format=rgba[a];[1:v]fps=${PROBE.fps},format=rgba[b];` +
      `[a][b]xfade=transition=${name}:duration=${PROBE.overlapSec}:offset=${PROBE.clipSec - PROBE.overlapSec}[o]`,
    '-map', '[o]', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ]);
}

/**
 * The real thing: the filtergraph `buildFFmpegArgs` emits for a two-clip
 * project, decoded straight off the filter chain.
 *
 * The encoder tail is cut rather than run. The point of this measurement is the
 * FILTERGRAPH — running it through libx264 and back would fold the encoder's
 * own losses into a number that is supposed to be about the run's geometry.
 */
function probePipeline(a: string, b: string, base: string, name: string): Buffer {
  const project = twoClipProject(name);
  const args = buildFFmpegArgs(project, {
    outputPath: '/dev/null',
    baseImage: base,
    resolveSrc: (s) => (s === 'a' ? a : b),
    hasAudio: () => false,
  });
  const cut = args.indexOf('-c:v');
  expect(cut).toBeGreaterThan(0);
  return ffmpeg([
    ...args.slice(1, cut), // drop the leading -y; /dev/null is never written
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ]);
}

function twoClipProject(type: string): VideoProject {
  const { size, fps, clipSec, overlapSec } = PROBE;
  return {
    id: 'probe',
    schemaVersion: 3,
    width: size,
    height: size,
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
          { id: 'a', type: 'image', src: 'a', start: 0, duration: clipSec },
          {
            id: 'b',
            type: 'image',
            src: 'b',
            start: clipSec - overlapSec,
            duration: clipSec,
            transitionIn: { type, duration: overlapSec } as never,
          },
        ],
      },
    ],
  } as VideoProject;
}

/** Pull the three sample lines out of the requested frames, as packed RGB. */
function sampleLines(raw: Buffer, firstFrame: number): Buffer {
  const { size, frames } = PROBE;
  const stride = size * size * 4;
  const out = Buffer.alloc(frames.length * 3 * size * 3);
  let w = 0;
  for (const f of frames) {
    const base = (firstFrame + f) * stride;
    expect(raw.length).toBeGreaterThanOrEqual(base + stride);
    for (const o of lineOffsets(size)) {
      for (const px of o) {
        const at = base + px * 4;
        out[w++] = raw[at];
        out[w++] = raw[at + 1];
        out[w++] = raw[at + 2];
      }
    }
  }
  return out;
}

function delta(x: Buffer, y: Buffer): { max: number; mean: number } {
  const n = Math.min(x.length, y.length);
  let max = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(x[i] - y[i]);
    max = Math.max(max, d);
    sum += d;
  }
  return { max, mean: Math.round((sum / n) * 100) / 100 };
}

describe.skipIf(!ENABLED)('xfade, measured against real ffmpeg', () => {
  let dir = '';
  let a = '';
  let b = '';
  let base = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-xfade-'));
    const { size } = PROBE;
    a = join(dir, 'a.png');
    b = join(dir, 'b.png');
    base = join(dir, 'base.png');
    ffmpeg(['-y', '-f', 'lavfi', '-i',
      `color=black:s=${size}x${size}:d=1,format=gbrp,geq=r='X*4':g='Y*4':b=64`,
      '-frames:v', '1', a]);
    ffmpeg(['-y', '-f', 'lavfi', '-i',
      `color=black:s=${size}x${size}:d=1,format=gbrp,geq=r=64:g='X*4':b='Y*4'`,
      '-frames:v', '1', b]);
    ffmpeg(['-y', '-f', 'lavfi', '-i', `color=black:s=${size}x${size}:d=1`,
      '-frames:v', '1', base]);
  });

  it('writes the fixture, and the real filtergraph agrees with the bare filter', () => {
    const { size, fps, clipSec, overlapSec } = PROBE;
    const transitionFrame = Math.round((clipSec - overlapSec) * fps);
    const samples: Record<string, string> = {};
    const tolerance: ProbeFixture['tolerance'] = {};

    for (const name of FAMILIES) {
      const bare = probeBare(a, b, name);
      /*
       * Length is an assertion in itself: `xfade` output is
       * `sum(durations) - sum(overlaps)`, which is what the overlap model in
       * `xfade.ts` claims the timeline does. If this drifts, so has the model.
       */
      expect(bare.length / (size * size * 4)).toBe(
        Math.round((2 * clipSec - overlapSec) * fps),
      );
      const bareLines = sampleLines(bare, transitionFrame);
      samples[name] = bareLines.toString('base64');

      const pipe = probePipeline(a, b, base, name);
      tolerance[name] = delta(bareLines, sampleLines(pipe, transitionFrame));
    }

    const fixture: ProbeFixture = {
      ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' })
        .split('\n')[0]
        .split(' ')[2],
      ...PROBE,
      samples,
      tolerance,
    };
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 1)}\n`);

    /*
     * A run that composited at the wrong second, or padded to the wrong size,
     * or lost its alpha, does not miss by a few counts on a few pixels — it
     * puts a different picture on the screen, and the MEAN is what says so.
     * Asserting on the max instead would mean picking a threshold above the
     * ~108 that 4:2:0 chroma legitimately costs at a hard edge, which is high
     * enough to hide a genuinely wrong frame.
     *
     * Measured: every family sits under 4. The one real mistake this caught —
     * ramping the incoming clip's alpha as well as wiping it, so `xfade` was
     * handed a half-transparent picture — read 60 and over.
     */
    for (const [name, d] of Object.entries(tolerance))
      expect([name, d.mean < 8]).toEqual([name, true]);
  });

  it('renders a run at the right second, and leaves the rest of the canvas alone', () => {
    /*
     * The timing claim on its own, where a wrong `offset` is unmissable: before
     * the transition the frame must be exactly clip A, after it exactly clip B.
     * A geometric family is used because a fade would pass this even if the run
     * machinery were bypassed entirely.
     */
    const { size, fps, clipSec, overlapSec } = PROBE;
    const stride = size * size * 4;
    const pipe = probePipeline(a, b, base, 'wipeleft');
    const px = (buf: Buffer, f: number, x: number, y: number) =>
      [...buf.subarray(f * stride + (y * size + x) * 4, f * stride + (y * size + x) * 4 + 3)];

    const last = Math.round((clipSec - overlapSec) * fps) - 1;
    const first = Math.round(clipSec * fps);
    /*
     * A is (x*4, y*4, 64) and B is (64, x*4, y*4), give or take a couple of
     * counts: the finished run is composited onto the canvas in yuv420p like
     * every other layer, and a limited-range RGB round trip is not free. That
     * is pre-existing engine behaviour, not something the run introduced —
     * `near` is deliberately far too tight to let a wrong frame through.
     */
    const near = (got: number[], want: number[]) =>
      got.forEach((v, k) => expect(Math.abs(v - want[k])).toBeLessThanOrEqual(4));
    near(px(pipe, last, 20, 10), [80, 40, 64]);
    near(px(pipe, first, 20, 10), [64, 80, 40]);
  });
});

describe('the probe fixture', () => {
  const fixture: ProbeFixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

  it('covers every transition the catalogue offers', () => {
    expect(Object.keys(fixture.samples).sort()).toEqual([...FAMILIES].sort());
  });

  it('holds one full sample block per family', () => {
    const want = PROBE.frames.length * 3 * PROBE.size * 3;
    for (const [name, b64] of Object.entries(fixture.samples))
      expect([name, Buffer.from(b64, 'base64').length]).toEqual([name, want]);
  });

  it('reproduces the fade the previews draw, from the measurement', () => {
    /*
     * The link the whole exercise exists for: what ffmpeg measured and what
     * `xfadeStateAt` tells a compositor to do have to be the same thing, and
     * this asserts it against real numbers rather than against a second
     * derivation of the same formula.
     *
     * `fade` is the only family the previews render for now. As each geometric
     * one lands, its case joins this test — that is the gate, not a code
     * review.
     */
    const { size, fps, overlapSec, frames } = PROBE;
    const got = Buffer.from(fixture.samples.fade, 'base64');
    const span = overlapSec * fps;
    let worst = 0;
    frames.forEach((f, fi) => {
      const p = f / span;
      const { alpha } = xfadeStateAt('fade', p, 'to');
      lineOffsets(size).forEach((line, li) => {
        line.forEach((_, k) => {
          const mid = size >> 1;
          // A is (x*4, y*4, 64); B is (64, x*4, y*4).
          const [x, y] = li === 0 ? [k, mid] : li === 1 ? [mid, k] : [k, k];
          const A = [x * 4, y * 4, 64];
          const B = [64, x * 4, y * 4];
          const at = ((fi * 3 + li) * size + k) * 3;
          for (let ch = 0; ch < 3; ch++)
            worst = Math.max(
              worst,
              Math.abs(
                got[at + ch] - Math.round(A[ch] * (1 - alpha) + B[ch] * alpha),
              ),
            );
        });
      });
    });
    // A linear blend is space-independent, so ffmpeg's mix and a compositor's
    // `globalAlpha` differ only by where each rounds. Measured: 1/255.
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('puts every geometric edge exactly where ffmpeg put it', () => {
    /*
     * The strongest assertion in the file, and the reason these families were
     * done before the blending ones: none of them resamples, so there is no
     * tolerance to hide in. Every output pixel is one source pixel, and the
     * model either names the right clip AND the right pixel of it, or it does
     * not.
     *
     * The check is the compositing rule itself, run in reverse. The incoming
     * clip is drawn over the outgoing one, so a pixel belongs to whichever
     * side's `clip` rect contains it; `dx`/`dy` then say which source pixel it
     * came from. If the two rects also tile the canvas with no overlap and no
     * gap, the whole frame is accounted for — asserted, because a pair that
     * overlapped would satisfy the first check while double-drawing the seam.
     */
    const { size, fps, overlapSec, frames } = PROBE;
    const span = overlapSec * fps;
    const inside = (r: XfState['clip'], x: number, y: number) =>
      !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

    const GEOMETRIC = [
      'wipeleft', 'wiperight', 'wipeup', 'wipedown',
      'slideleft', 'slideright', 'slideup', 'slidedown',
      'coverleft', 'coverright', 'coverup', 'coverdown',
      'revealleft', 'revealright', 'revealup', 'revealdown',
    ];

    for (const name of GEOMETRIC) {
      const got = Buffer.from(fixture.samples[name], 'base64');
      frames.forEach((f, fi) => {
        const p = f / span;
        const to = xfadeStateAt(name, p, 'to', size, size);
        const from = xfadeStateAt(name, p, 'from', size, size);
        const area = (r?: XfState['clip']) => (r ? r.w * r.h : size * size);
        expect([name, f, area(to.clip) + area(from.clip)]).toEqual([
          name, f, size * size,
        ]);

        lineOffsets(size).forEach((line, li) => {
          line.forEach((_, k) => {
            const mid = size >> 1;
            const [x, y] = li === 0 ? [k, mid] : li === 1 ? [mid, k] : [k, k];
            const at = ((fi * 3 + li) * size + k) * 3;
            const px = [got[at], got[at + 1], got[at + 2]].join();

            /*
             * ffmpeg's own edge case, and the only one in this whole family.
             * At p = 0 the travel is zero, and its guard on the shifted index
             * is `> 0` rather than `>= 0`, so the leading row and column take a
             * wrapped value — the next row over, or black. It is a one-pixel
             * line, on the single frame where nothing has moved yet, in the
             * variants where the OUTGOING clip is the one that travels.
             * Reproducing it would mean porting a modulo wrap whose only effect
             * is that stray line; it is named here instead of skipped quietly.
             */
            if (p === 0 && k === 0) return;

            const side = inside(to.clip, x, y) ? to : from;
            const sx = x - (side.dx ?? 0);
            const sy = y - (side.dy ?? 0);
            // A source pixel off the edge cannot be predicted from the ramps.
            if (sx < 0 || sx >= size || sy < 0 || sy >= size) return;
            // A is (x*4, y*4, 64); B is (64, x*4, y*4) — except where the two
            // ramps cross, at x = y = 16, where both are (64,64,64) and the
            // pixel cannot say which clip drew it.
            const A = [sx * 4, sy * 4, 64].join();
            const B = [64, sx * 4, sy * 4].join();
            if (A === B) return;
            expect([name, f, x, y, px]).toEqual([
              name, f, x, y, side === to ? B : A,
            ]);
          });
        });
      });
    }
  });

  it('was measured at the geometry the model still uses', () => {
    // A fixture recorded at a different size or overlap is not evidence about
    // this code, and reading it as if it were is worse than having none.
    expect(fixture.size).toBe(PROBE.size);
    expect(fixture.overlapSec).toBe(PROBE.overlapSec);
    expect(fixture.frames).toEqual(PROBE.frames);
  });
});
