/**
 * Render the hero's reference frame with the REAL export path.
 *
 *   node scripts/gen-hero-frame.mjs
 *
 * The landing page claims that Orbit draws every effect twice — canvas in the
 * browser, ffmpeg on the server — and that the two agree. It would be a poor
 * page that asserted this over a screenshot. So the browser half runs live, and
 * this produces the half it is compared against: an actual MP4, encoded by
 * actual ffmpeg from `src/hero/project.json`, with one frame pulled back out.
 *
 * **Both halves read that same JSON.** The browser imports it; this parses it.
 * A project defined twice would drift, and the first thing to go would be the
 * agreement the page exists to demonstrate — which would still *look* fine,
 * because the delta is computed from whatever the two sides actually drew.
 *
 * ## Why the frame holds no text
 *
 * The ≤2/255 figure covers geometry, alpha and ungraded colour. It does not
 * cover type, and cannot: captions are rasterised by resvg on the server and by
 * the browser's own SVG renderer in preview, which hint and antialias
 * differently. A hero frame with a headline in it would measure a large delta
 * and the page would be advertising a weakness while claiming a strength.
 * Shapes, a gradient and a rotation are the honest subject.
 */
import { renderProject } from '@layera-labs/orbit-video/node';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The instant sampled. Must match `AT_SEC` in the hero component. */
const AT_SEC = 1;

const project = JSON.parse(
  readFileSync(join(ROOT, 'src/hero/project.json'), 'utf8'),
);

const tmp = join(ROOT, '.hero-tmp');
mkdirSync(tmp, { recursive: true });
mkdirSync(join(ROOT, 'public/hero'), { recursive: true });

const mp4 = join(tmp, 'hero.mp4');
const result = await renderProject(project, {
  outputPath: mp4,
  // Nothing in this project references media, so a src can only be itself.
  resolveSrc: (s) => s,
});

/*
 * `-ss` AFTER `-i` so ffmpeg decodes to the timestamp rather than seeking to
 * the nearest keyframe before it. On a 3-second clip the difference is the
 * whole point: an input-side seek would land on frame 0 and the page would be
 * comparing the browser's t=1 against the encoder's t=0.
 */
execFileSync(
  'ffmpeg',
  ['-y', '-i', mp4, '-ss', String(AT_SEC), '-frames:v', '1',
   join(ROOT, 'public/hero/export.png')],
  { stdio: 'pipe' },
);

rmSync(tmp, { recursive: true, force: true });
console.log(
  `public/hero/export.png  <-  ${result.durationSec}s / ${result.bytes} bytes, sampled at ${AT_SEC}s`,
);
