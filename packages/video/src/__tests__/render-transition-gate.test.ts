/**
 * The refusal, end to end, against a binary that really lacks the transition.
 *
 * `xfade-support.test.ts` covers the pure logic. This covers the part that
 * cannot be reasoned about: that `renderProject` actually spawns the binary it
 * was given, reads its help output, and refuses BEFORE doing any work — rather
 * than letting the token reach ffmpeg, where an unknown enum value fails the
 * whole filtergraph and reports an error about an option.
 *
 * The binary is a shim printing a real ffmpeg 5.1 help dump. Simulating the
 * BUILD rather than mocking the probe is the point: it is the spawn, the
 * argument list and the parse that have to work, and a mock would assert only
 * that we can call our own function.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderProject } from '../render';
import type { VideoProject } from '../types';

const dir = mkdtempSync(join(tmpdir(), 'orbit-xfade-gate-'));

/** A fake ffmpeg whose `-h filter=xfade` lists exactly `tokens`. */
function shim(name: string, tokens: string[]): string {
  const lines = tokens
    .map((t, i) => `     ${t.padEnd(16)}${i}            ..FV....... ${t} transition`)
    .join('\\n');
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!/bin/sh\nprintf 'xfade AVOptions:\\n   transition        <int>        ..FV.......\\n${lines}\\n   duration          <duration>   ..FV.......\\n'\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

const FFMPEG_5_1 = shim('ffmpeg51', ['fade', 'wipeleft', 'slideleft', 'fadeslow']);
const FFMPEG_6_1 = shim('ffmpeg61', ['fade', 'wipeleft', 'slideleft', 'coverleft']);

const project = (type: string): VideoProject =>
  ({
    width: 640,
    height: 360,
    fps: 30,
    background: { type: 'solid', color: '#000000' },
    clips: [],
    audio: [],
    overlays: [],
    tracks: [
      {
        id: 't1',
        kind: 'visual',
        clips: [
          { id: 'a', type: 'image', src: 'a.png', start: 0, duration: 4 },
          {
            id: 'b',
            type: 'image',
            src: 'b.png',
            start: 3,
            duration: 4,
            transitionIn: { type, duration: 1 },
          },
        ],
      },
    ],
  }) as unknown as VideoProject;

const render = (p: VideoProject, bin: string) =>
  renderProject(p, { outputPath: join(dir, 'out.mp4'), ffmpegPath: bin });

/**
 * The render's failure message, or `null` if it did not fail.
 *
 * Needed because the shim exits 0 and writes nothing, so a render that gets
 * PAST the gate resolves rather than rejecting — and "did not reject" and "did
 * not reject with the gate's message" are different claims. Only the second one
 * is what these tests mean.
 */
async function failure(p: VideoProject, bin: string): Promise<string | null> {
  try {
    await render(p, bin);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Did the transition gate stop it, as opposed to anything else going wrong? */
const gated = (msg: string | null) => !!msg && /ffmpeg cannot do/.test(msg);

// A shell shim needs a POSIX shell; nothing else in this file is OS-specific.
describe.skipIf(process.platform === 'win32')('renderProject transition gate', () => {
  it('the shim really answers, so a pass below is not a silent no-op', () => {
    const out = execFileSync(FFMPEG_5_1, ['-hide_banner', '-h', 'filter=xfade'], {
      encoding: 'utf8',
    });
    expect(out).toContain('wipeleft');
    expect(out).not.toContain('coverleft');
  });

  it('refuses a Push against an ffmpeg that predates it', async () => {
    const msg = await failure(project('coverleft'), FFMPEG_5_1);
    expect(msg).toMatch(/coverleft/);
    // And says what would fix it. Without the version this reads as "something
    // is broken", which is not something a user or an operator can act on.
    expect(msg).toMatch(/6\.1/);
  });

  it('does not refuse the same project on an ffmpeg that has it', async () => {
    /*
     * The other direction, and the one that keeps the check honest: a gate
     * that refused everything would pass the test above while breaking every
     * export.
     */
    expect(gated(await failure(project('coverleft'), FFMPEG_6_1))).toBe(false);
  });

  it('lets a project with no transition through either way', async () => {
    expect(gated(await failure(project('cut'), FFMPEG_5_1))).toBe(false);
  });

  it('never gates a fade, which needs no xfade filter at all', async () => {
    // `isAlphaOnly`: with the clips overlapping, drawing B over A at alpha p IS
    // the crossfade, so it survives an ffmpeg with no xfade whatsoever.
    expect(gated(await failure(project('fade'), shim('ffmpegBare', [])))).toBe(false);
  });
});
