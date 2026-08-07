/**
 * The poster frame.
 *
 * Four surfaces want one — a library grid, a batch dashboard, the result screen,
 * and the cover frame every publishing platform asks for — and a render produced
 * none, so each of them was either blank or re-deriving it on the client.
 *
 * Two halves are tested differently, on purpose:
 *
 *   - `thumbnailTime` is pure arithmetic and is tested as such. Where the frame
 *     is grabbed from is the whole quality of a thumbnail, so it is pinned
 *     rather than left to whatever `0` happens to look like.
 *   - The extraction is tested against REAL ffmpeg, gated behind
 *     `ORBIT_FFMPEG_PROBE=1` like the other probe suites. A shim that writes a
 *     file when asked would prove only that we can call our own function; what
 *     needs proving is that these arguments make ffmpeg emit an image.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderProject, thumbnailTime } from '../render';
import type { VideoProject } from '../types';

describe('thumbnailTime', () => {
  /*
   * Not frame zero, which is the obvious choice and usually wrong: a fade-in
   * starts black, and a black thumbnail is indistinguishable from a broken one.
   */
  it('lands a tenth of the way in, clear of a fade', () => {
    expect(thumbnailTime(20)).toBeCloseTo(2, 6);
    expect(thumbnailTime(5)).toBeCloseTo(0.5, 6);
  });

  /*
   * The cap matters more than the fraction. On a ten-minute render a tenth is a
   * minute in, which is nowhere near what the video is about — and for
   * short-form the opening IS the content.
   */
  it('caps how far in it will go on a long render', () => {
    expect(thumbnailTime(600)).toBe(3);
    expect(thumbnailTime(3600)).toBe(3);
  });

  it('takes an explicit time when given one', () => {
    expect(thumbnailTime(20, 7.5)).toBeCloseTo(7.5, 6);
    expect(thumbnailTime(600, 0)).toBe(0);
  });

  /*
   * A seek past the end produces no frame at all, so both the default and an
   * explicit time are held inside the clip. The 0.05 is what keeps a request
   * for exactly the duration from landing on nothing.
   */
  it('never seeks past the end', () => {
    expect(thumbnailTime(2, 99)).toBeLessThan(2);
    expect(thumbnailTime(0.2)).toBeLessThan(0.2);
    expect(thumbnailTime(0.2)).toBeGreaterThanOrEqual(0);
  });

  it('stays at zero for a degenerate duration rather than going negative', () => {
    expect(thumbnailTime(0)).toBe(0);
    expect(thumbnailTime(0, 5)).toBe(0);
  });
});

/*
 * Against real ffmpeg. `ORBIT_FFMPEG_PROBE=1 pnpm --filter @orbit/video test`.
 */
const PROBE = process.env.ORBIT_FFMPEG_PROBE === '1';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';

describe.skipIf(!PROBE)('extraction (real ffmpeg)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-thumb-'));

  /** A red 64x64 clip, made by ffmpeg so the input is real. */
  function sourceClip(name: string, seconds: number): string {
    const path = join(dir, name);
    execFileSync(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', `color=c=red:s=64x64:d=${seconds}:r=10`,
      '-pix_fmt', 'yuv420p', path,
    ]);
    return path;
  }

  const project = (src: string, duration: number): VideoProject =>
    ({
      id: 'p', schemaVersion: 3, width: 64, height: 64, fps: 10,
      background: { type: 'color', color: '#000000' },
      clips: [], overlays: [], audio: [],
      tracks: [{ id: 'v', kind: 'visual', clips: [{ id: 'c', type: 'video', src, start: 0, duration }] }],
    }) as unknown as VideoProject;

  it('writes a real image beside the video', async () => {
    const src = sourceClip('src1.mp4', 2);
    const out = join(dir, 'out1.mp4');
    const thumb = join(dir, 'thumb1.jpg');
    const result = await renderProject(project(src, 2), {
      outputPath: out,
      ffmpegPath: FFMPEG,
      thumbnail: { path: thumb },
    });

    expect(result.thumbnailPath).toBe(thumb);
    expect(existsSync(thumb)).toBe(true);
    expect(statSync(thumb).size).toBeGreaterThan(0);
    // JPEG's magic bytes — proof it is an image, not an empty file ffmpeg
    // touched and abandoned.
    const head = readFileSync(thumb).subarray(0, 3);
    expect([...head]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('produces nothing at all when not asked', async () => {
    const src = sourceClip('src2.mp4', 1);
    const result = await renderProject(project(src, 1), {
      outputPath: join(dir, 'out2.mp4'),
      ffmpegPath: FFMPEG,
    });
    expect(result.thumbnailPath).toBeUndefined();
  });

  /*
   * The render has already succeeded by the time this runs — the encode is
   * done, the file is on disk, the caller is about to be charged for it.
   * Failing the whole thing over a still would be the tail wagging the dog.
   */
  it('keeps the video when the thumbnail cannot be written', async () => {
    const src = sourceClip('src3.mp4', 1);
    const out = join(dir, 'out3.mp4');
    const warnings: { code: string; message: string }[] = [];
    const result = await renderProject(project(src, 1), {
      outputPath: out,
      ffmpegPath: FFMPEG,
      // A directory that does not exist, so ffmpeg cannot open the output.
      thumbnail: { path: join(dir, 'nope', 'deeper', 'thumb.jpg') },
      onWarning: (w) => warnings.push(w as { code: string; message: string }),
    });

    expect(result.path).toBe(out);
    expect(statSync(out).size).toBeGreaterThan(0);
    expect(result.thumbnailPath).toBeUndefined();
    // Absent AND said out loud. A silently missing poster reads as a bug in
    // whichever screen was going to show it.
    expect(warnings.map((w) => w.code)).toContain('thumbnail-failed');
  });

  /*
   * ffmpeg can exit 0 having written nothing — a seek that lands past the last
   * frame is how that happens — and an empty file is not a thumbnail. Real
   * ffmpeg cannot easily be made to do this on demand, so it is driven with a
   * shim: the guard is about what we do with a zero-byte file, not about
   * ffmpeg's exit code.
   */
  it('rejects a zero-byte file that ffmpeg exited 0 on', async () => {
    const src = sourceClip('src5.mp4', 1);
    const out = join(dir, 'out5.mp4');
    const thumb = join(dir, 'thumb5.jpg');

    // Writes the render output, then "succeeds" at the thumbnail without
    // producing one. Also answers the xfade capability probe.
    const fake = join(dir, 'ffmpeg-empty.sh');
    writeFileSync(
      fake,
      [
        '#!/bin/sh',
        'case "$1" in',
        "  -h) printf 'xfade AVOptions:\\n   transition        <int>        ..FV.......\\n     fade            0            ..FV....... fade\\n'; exit 0;;",
        'esac',
        'eval "out=\\${$#}"',
        // The thumbnail pass is the one carrying -frames:v. Touch the file so
        // it EXISTS but is empty — the case a plain existsSync would accept.
        'case "$*" in',
        '  *-frames:v*) : > "$out"; exit 0;;',
        'esac',
        "printf 'video' > \"$out\"",
        'exit 0',
      ].join('\n'),
    );
    chmodSync(fake, 0o755);

    const warnings: { code: string }[] = [];
    const result = await renderProject(project(src, 1), {
      outputPath: out,
      ffmpegPath: fake,
      thumbnail: { path: thumb },
      onWarning: (w) => warnings.push(w as { code: string }),
    });

    expect(statSync(thumb).size).toBe(0); // the shim really did leave it empty
    expect(result.thumbnailPath).toBeUndefined();
    expect(warnings.map((w) => w.code)).toContain('thumbnail-failed');
  });

  it('honours an explicit timestamp', async () => {
    const src = sourceClip('src4.mp4', 3);
    const thumb = join(dir, 'thumb4.png');
    const result = await renderProject(project(src, 3), {
      outputPath: join(dir, 'out4.mp4'),
      ffmpegPath: FFMPEG,
      thumbnail: { path: thumb, atSec: 2 },
    });
    expect(result.thumbnailPath).toBe(thumb);
    // PNG magic, so the extension really did pick the format.
    expect([...readFileSync(thumb).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
