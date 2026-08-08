/**
 * What `renderProject` hands back.
 *
 * It used to resolve with `opts.outputPath` — the string the caller had just
 * passed in. So the return value carried no information at all, and both real
 * callers (`services/render/src/server.ts`, `packages/video-ai/src/agent.ts`)
 * discarded it. `RenderResult` replaces it with the two facts a caller cannot
 * get for free.
 *
 * Driven against a shim binary rather than a mock. The claims are about a
 * FILE — that its size is read after ffmpeg exits, and that a missing one does
 * not take the render down with it — and a mocked `renderProject` would assert
 * only that we can call our own function.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderProject } from '../render';
import { projectDuration } from '../project';
import type { VideoProject } from '../types';

const dir = mkdtempSync(join(tmpdir(), 'orbit-render-result-'));

/**
 * A fake ffmpeg that writes `payload` to whatever output path it is given.
 *
 * The output is the LAST argument the builder emits, which is why the shim digs
 * it out with `eval` rather than being told. It also has to answer the xfade
 * capability probe, since `renderProject` runs that before it renders.
 */
function shim(name: string, payload: string): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      // The capability probe: any `-h` invocation gets a minimal token dump.
      'case "$1" in',
      '  -h) printf \'xfade AVOptions:\\n   transition        <int>        ..FV.......\\n     fade            0            ..FV....... fade transition\\n\'; exit 0;;',
      'esac',
      'eval "out=\\${$#}"',
      payload ? `printf '%s' '${payload}' > "$out"` : ': # write nothing',
      'exit 0',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

const WRITES = shim('ffmpeg-writes', '0123456789');
const WRITES_NOTHING = shim('ffmpeg-silent', '');

/** Two stills end to end — 8 seconds, no transition, no audio to probe. */
const project = (): VideoProject =>
  ({
    width: 320,
    height: 240,
    fps: 30,
    background: { type: 'color', color: '#000000' },
    clips: [],
    audio: [],
    overlays: [],
    tracks: [
      {
        id: 't1',
        kind: 'visual',
        clips: [
          { id: 'a', type: 'image', src: 'a.png', start: 0, duration: 4 },
          { id: 'b', type: 'image', src: 'b.png', start: 4, duration: 4 },
        ],
      },
    ],
  }) as unknown as VideoProject;

// A shell shim needs a POSIX shell; nothing else here is OS-specific.
describe.skipIf(process.platform === 'win32')('renderProject result', () => {
  it('the shim really writes, so a byte count below is not measuring nothing', () => {
    // Guards the harness itself: every assertion under this depends on the
    // shim being executable and reaching its last argument.
    const out = join(dir, 'probe.bin');
    execFileSync(WRITES, ['-y', out]);
    expect(execFileSync('wc', ['-c', out]).toString().trim().startsWith('10')).toBe(true);
  });

  it('reports the path, the timeline length and the file size', async () => {
    const p = project();
    const outputPath = join(dir, 'out.mp4');
    const result = await renderProject(p, { outputPath, ffmpegPath: WRITES });

    expect(result.path).toBe(outputPath);
    // 10 characters written by the shim.
    expect(result.bytes).toBe(10);
    // From the model, not from a re-measurement of the file — which is the
    // whole reason there is no ffprobe of the output in the hot path.
    expect(result.durationSec).toBe(projectDuration(p));
    expect(result.durationSec).toBe(8);
  });

  it('reports zero bytes rather than failing when the file is not there', async () => {
    /*
     * ffmpeg exited 0. Losing a completed render over a size we only REPORT
     * would be the tail wagging the dog — so `stat` failing resolves to 0
     * instead of rejecting. The shim that writes nothing is the case.
     */
    const result = await renderProject(project(), {
      outputPath: join(dir, 'never-written.mp4'),
      ffmpegPath: WRITES_NOTHING,
    });
    expect(result.bytes).toBe(0);
    expect(result.durationSec).toBe(8);
  });
});
