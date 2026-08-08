/**
 * Does THIS ffmpeg do what `xfade-probe.json` says ffmpeg does?
 *
 * The fixture was measured on one machine (ffmpeg 8.1.2) and every transition
 * the previews draw is written against it. The render server runs whatever its
 * base image ships — Debian bookworm gives 5.1 — so the two are not the same
 * build, and "xfade has been there since 4.3" is a statement about the filter
 * existing, not about it splitting the frame on the same pixel.
 *
 * So: re-measure here, compare there. Dependency-free on purpose — it runs
 * inside the service's own container, where there is node and ffmpeg and
 * nothing else:
 *
 *   docker compose -f services/render/compose.vps.yaml \
 *     exec render node packages/video/scripts/xfade-verify.mjs
 *
 * It measures the BARE filter, not a render. That is deliberate: a difference
 * here is a difference in ffmpeg, with none of the engine's own compositing
 * folded in to argue about.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'src', '__tests__', 'fixtures', 'xfade-probe.json');

const ffmpeg = (args) =>
  execFileSync('ffmpeg', ['-v', 'error', ...args], {
    maxBuffer: 1 << 28,
    encoding: 'buffer',
  });

/** The three lines sampled out of each frame — must match `xfade-fixture-shape.ts`. */
function lineOffsets(size) {
  const mid = size >> 1;
  const row = [];
  const col = [];
  const diag = [];
  for (let k = 0; k < size; k++) {
    row.push(mid * size + k);
    col.push(k * size + mid);
    diag.push(k * size + k);
  }
  return [row, col, diag];
}

function sampleLines(raw, firstFrame, size, frames) {
  const stride = size * size * 4;
  const out = Buffer.alloc(frames.length * 3 * size * 3);
  let w = 0;
  for (const f of frames) {
    const base = (firstFrame + f) * stride;
    if (raw.length < base + stride) throw new Error('short output');
    for (const line of lineOffsets(size))
      for (const px of line) {
        out[w++] = raw[base + px * 4];
        out[w++] = raw[base + px * 4 + 1];
        out[w++] = raw[base + px * 4 + 2];
      }
  }
  return out;
}

const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const { size, fps, clipSec, overlapSec, frames } = fx;

const version = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  .split('\n')[0]
  .split(' ')[2];
console.log(`fixture recorded on ffmpeg ${fx.ffmpeg}`);
console.log(`this machine runs      ffmpeg ${version}\n`);

const dir = mkdtempSync(join(tmpdir(), 'xfade-verify-'));
const a = join(dir, 'a.png');
const b = join(dir, 'b.png');
ffmpeg(['-y', '-f', 'lavfi', '-i',
  `color=black:s=${size}x${size}:d=1,format=gbrp,geq=r='X*4':g='Y*4':b=64`,
  '-frames:v', '1', a]);
ffmpeg(['-y', '-f', 'lavfi', '-i',
  `color=black:s=${size}x${size}:d=1,format=gbrp,geq=r=64:g='X*4':b='Y*4'`,
  '-frames:v', '1', b]);

const transitionFrame = Math.round((clipSec - overlapSec) * fps);
const bad = [];
let worst = 0;

for (const [name, want64] of Object.entries(fx.samples)) {
  let got;
  try {
    const raw = ffmpeg([
      '-loop', '1', '-t', String(clipSec), '-i', a,
      '-loop', '1', '-t', String(clipSec), '-i', b,
      '-filter_complex',
      `[0:v]fps=${fps},format=rgba[a];[1:v]fps=${fps},format=rgba[b];` +
        `[a][b]xfade=transition=${name}:duration=${overlapSec}:offset=${clipSec - overlapSec}[o]`,
      '-map', '[o]', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
    ]);
    got = sampleLines(raw, transitionFrame, size, frames);
  } catch (e) {
    /*
     * The one failure that is not a difference of degree. If this build's
     * `xfade` refuses rgba, the run path in `ffmpeg.ts` cannot work at all and
     * every geometric transition fails the render outright rather than looking
     * slightly wrong.
     */
    console.log(`FAIL ${name}: ${String(e.stderr ?? e.message).trim().split('\n').pop()}`);
    bad.push(name);
    continue;
  }
  const want = Buffer.from(want64, 'base64');
  let max = 0;
  for (let i = 0; i < Math.min(want.length, got.length); i++)
    max = Math.max(max, Math.abs(want[i] - got[i]));
  worst = Math.max(worst, max);
  if (max > 0) {
    console.log(`DIFF ${name}: up to ${max}/255 away from the fixture`);
    bad.push(name);
  }
}

console.log(
  bad.length === 0
    ? `\nOK — all ${Object.keys(fx.samples).length} transitions match the fixture exactly.`
    : `\n${bad.length} of ${Object.keys(fx.samples).length} differ (worst ${worst}/255): ${bad.join(', ')}\n` +
      `The previews are written against the fixture, so anything listed here renders\n` +
      `differently on this machine than it previews. Re-run the probe on THIS ffmpeg\n` +
      `(ORBIT_FFMPEG_PROBE=1 npx vitest run xfade-probe) before trusting the numbers.`,
);
process.exit(bad.length === 0 ? 0 : 1);
