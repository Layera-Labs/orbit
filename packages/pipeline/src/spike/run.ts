/**
 * Phase 0: the wiring spike.
 *
 *   node --experimental-strip-types src/spike/run.ts [plan.json]
 *
 * NOT a render spike — that question was answered long ago, and answered
 * better than the original plan assumed (`renderProject` is a native ffmpeg
 * compositor, not headless Chromium). What is unproven is the WIRING: that a
 * plan with no durations in it can become a real MP4 by way of real provider
 * calls, and what that costs.
 *
 * It runs the true order, which is the one architectural claim worth proving:
 *
 *     plan → speak → MEASURE → align → compose → render
 *
 * The measurement is the deliverable. Every step is timed, every provider call
 * reports what it consumed, and the total prints at the end — because the
 * per-video cost is what sets pricing, and pricing decides whether any of the
 * rest is worth building.
 *
 * ## What this deliberately does NOT do
 *
 * - **No LLM.** The plan is hand-written, which is the point: it isolates the
 *   wiring from the planner's reliability. A model that produces bad plans is a
 *   Phase 1 problem and would only add noise to this number.
 * - **No AI visuals.** Phase 1 excludes them on purpose (slowest, priciest),
 *   and Phase 0 must not price a path the product will not take at launch. The
 *   backgrounds here are generated locally by ffmpeg, so the reported cost is
 *   voice and alignment ONLY — which is the honest recurring cost of a story
 *   video over stock, and the number to compare a stock or AI mode against.
 * - **No job queue, no holds, no idempotency.** All Phase 1. This is a straight
 *   line so that when it breaks, it is obvious where.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderProject } from '@orbit/video/node';
import { ElevenLabsProvider, groupWords } from '@orbit/video-gen';
// Straight at the modules, not through the package index: the index uses
// extensionless imports for the built library, and Node ESM needs explicit ones
// when running from source.
import { composeStory, type SceneVisual, type SpokenScene } from '../compose.ts';
import { frameSize, parseScenePlan } from '../scene-plan.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

// ---------------------------------------------------------------------------
// measurement
// ---------------------------------------------------------------------------

interface Step {
  name: string;
  ms: number;
  /** What a provider billed for, if this step reached one. */
  units?: number;
  unit?: string;
  provider?: string;
  note?: string;
}

const steps: Step[] = [];

async function timed<T>(name: string, fn: () => Promise<T>): Promise<[T, Step]> {
  const t0 = Date.now();
  const out = await fn();
  const step: Step = { name, ms: Date.now() - t0 };
  steps.push(step);
  return [out, step];
}

// ---------------------------------------------------------------------------
// local helpers
// ---------------------------------------------------------------------------

/**
 * How many provider calls may be in flight at once.
 *
 * MEASURED, not chosen. The first run of this spike fanned all five scenes out
 * at once and came back with:
 *
 *   ElevenLabs 429 concurrent_limit_exceeded — "your current subscription is
 *   associated with a maximum of 3 concurrent requests"
 *
 * That is a per-SUBSCRIPTION cap, not a per-key rate limit, so it does not go
 * away under load balancing and it is not something a retry fixes — it is a
 * ceiling on the whole pipeline's parallelism, and it bounds the wall-clock
 * promise directly: a six-scene video is two waves of TTS plus two waves of
 * alignment, not one of each. Raising it is a billing decision.
 *
 * This is exactly what Phase 0 is for. An estimate built on "fan out per scene"
 * would have been wrong by a factor of two on every video longer than three
 * scenes.
 */
const PROVIDER_CONCURRENCY = Number(process.env.ORBIT_PROVIDER_CONCURRENCY ?? 3);

/** `Promise.all` with a ceiling, preserving input order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (c) => (out += String(c)));
    p.stderr.on('data', (c) => (err += String(c)));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${bin} exited ${code}: ${err.slice(-800)}`)),
    );
  });
}

/**
 * How long the audio ACTUALLY is.
 *
 * The whole ordering argument rests on this one call. An estimate from the
 * model, or from a words-per-minute constant, is a number that disagrees with
 * the file — and every scene start after the first is a running sum of these,
 * so an error here does not cancel out, it accumulates down the timeline.
 */
async function audioDuration(path: string): Promise<number> {
  const out = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    path,
  ]);
  const n = Number(out.trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`could not measure ${path}`);
  return n;
}

/** A background, generated locally. See the note about visuals at the top. */
async function backgroundImage(
  path: string,
  width: number,
  height: number,
  index: number,
): Promise<void> {
  // Distinguishable per scene, so the cut is visible in the output and a
  // mis-ordered timeline would be obvious rather than plausible.
  const hues = ['0x1b2a4a', '0x3a1b4a', '0x1b4a3a', '0x4a3a1b', '0x4a1b2a', '0x2a1b4a'];
  const c = hues[index % hues.length];
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=${c}:s=${width}x${height}`,
    '-frames:v', '1',
    '-update', '1',
    path,
  ]);
}

/** Decode a `data:` URI the TTS provider returned into a file on disk. */
async function writeDataUri(uri: string, path: string): Promise<void> {
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || comma < 0) throw new Error('expected a data: URI from TTS');
  await writeFile(path, Buffer.from(uri.slice(comma + 1), 'base64'));
}

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error(
      'ELEVENLABS_API_KEY is not set. This spike exists to measure REAL provider\n' +
        'calls, so it refuses to run against a mock — a fabricated number is worse\n' +
        'than no number, because pricing would be built on it.\n\n' +
        '  export $(grep -E "^ELEVENLABS_API_KEY=" apps/render-service/.env | xargs)\n',
    );
    process.exit(2);
  }

  const planPath = process.argv[2] ?? join(HERE, '..', '..', 'fixtures', 'example-plan.json');
  const plan = parseScenePlan(JSON.parse(await readFile(planPath, 'utf8')));
  const { width, height } = frameSize(plan.aspect);

  const dir = join(tmpdir(), `orbit-spike-${Date.now().toString(36)}`);
  await mkdir(dir, { recursive: true });

  console.log(`\n  ${plan.topic}`);
  console.log(`  ${plan.scenes.length} scenes · ${plan.aspect} · ${width}x${height}`);
  console.log(`  working in ${dir}\n`);

  const tts = new ElevenLabsProvider({ apiKey: key });

  // -- 1. SPEAK ------------------------------------------------------------
  //
  // Fanned out to PROVIDER_CONCURRENCY, which the vendor sets, not us. See the
  // note on that constant: fanning out per scene is what the plan assumed and
  // what the provider refuses.
  const [spokenRaw] = await timed('speak', () =>
    mapLimit(plan.scenes, PROVIDER_CONCURRENCY, async (scene, i) => {
      const out = await tts.tts({ text: scene.narration });
      const path = join(dir, `vo-${i}.mp3`);
      await writeDataUri(out.url, path);
      return { path, usage: out.usage, chars: scene.narration.length };
    }),
  );
  const ttsChars = spokenRaw.reduce((n, s) => n + (s.usage?.units ?? s.chars), 0);
  Object.assign(steps[steps.length - 1], {
    provider: 'elevenlabs',
    units: ttsChars,
    unit: 'characters',
  });

  // -- 2. MEASURE ----------------------------------------------------------
  const [durations] = await timed('measure', async () =>
    // Local ffprobe, so no provider ceiling applies.
    Promise.all(spokenRaw.map((s) => audioDuration(s.path))),
  );

  // -- 3. ALIGN ------------------------------------------------------------
  //
  // Transcribe the audio we just produced, to find out where the words landed.
  // This is the step that surprises people: the timings come from the OUTPUT,
  // not from the input text, so alignment costs a second provider call.
  let alignBytes = 0;
  let alignSkipped: string | undefined;
  const [lines] = await timed('align', async () => {
    try {
      return await mapLimit(spokenRaw, PROVIDER_CONCURRENCY, async (s) => {
        const buf = await readFile(s.path);
        alignBytes += buf.byteLength;
        const words = await tts.transcribe({
          audio: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        });
        return groupWords(words);
      });
    } catch (e) {
      /*
       * Alignment is the only OPTIONAL provider step: without it the captions
       * are per-scene rather than per-word, which reads fine and simply cannot
       * animate. So a failure here degrades instead of ending the run — a spike
       * that produces four fifths of a measurement is worth far more than one
       * that produces none, and the missing fifth is named below.
       *
       * The common cause is not an outage. An ElevenLabs key carries per-scope
       * permissions and `speech_to_text` is off by default, so a key that does
       * TTS perfectly well answers 401 here.
       */
      alignSkipped = e instanceof Error ? e.message : String(e);
      return spokenRaw.map(() => undefined);
    }
  });
  Object.assign(steps[steps.length - 1], {
    provider: 'elevenlabs',
    ...(alignSkipped ? { note: 'SKIPPED — see below' } : { units: alignBytes, unit: 'audio-bytes' }),
  });

  // -- 4. VISUALS ----------------------------------------------------------
  const [visuals] = await timed('visuals', async () => {
    const out: SceneVisual[] = [];
    for (let i = 0; i < plan.scenes.length; i += 1) {
      const path = join(dir, `bg-${i}.png`);
      await backgroundImage(path, width, height, i);
      out.push({ src: path, type: 'image' });
    }
    return out;
  });
  Object.assign(steps[steps.length - 1], { note: 'generated locally — no provider' });

  // -- 5. COMPOSE ----------------------------------------------------------
  const spoken: SpokenScene[] = spokenRaw.map((s, i) => ({
    audioSrc: s.path,
    durationSec: durations[i],
    ...(lines[i] ? { lines: lines[i] } : {}),
  }));
  const [project] = await timed('compose', async () =>
    composeStory({ plan, spoken, visuals }),
  );

  await writeFile(join(dir, 'project.json'), JSON.stringify(project, null, 2));

  // -- 6. RENDER -----------------------------------------------------------
  const outputPath = join(dir, 'out.mp4');
  const [result] = await timed('render', () =>
    renderProject(project, {
      outputPath,
      ffmpegPath: FFMPEG,
      ffprobePath: FFPROBE,
      thumbnail: { path: join(dir, 'poster.jpg') },
      onWarning: (w) => console.warn(`  ! ${w.code}: ${w.message}`),
    }),
  );

  // -- report --------------------------------------------------------------
  report(result, dir, durations, outputPath);
  if (alignSkipped) {
    console.log('  ⚠ ALIGNMENT WAS SKIPPED, so this run has no word timings and the');
    console.log('    cost below excludes transcription.');
    console.log(`    ${alignSkipped.slice(0, 300)}`);
    console.log(
      '\n    If that is the `speech_to_text` permission: it is a per-key scope in\n' +
        '    the ElevenLabs dashboard, off by default, and turning it on needs no\n' +
        '    code change. Re-run for the complete number.\n',
    );
  }
}

function report(
  result: { durationSec: number; bytes: number; thumbnailPath?: string },
  dir: string,
  durations: number[],
  outputPath: string,
): void {
  const totalMs = steps.reduce((n, s) => n + s.ms, 0);
  const pad = (s: string, n: number) => s.padEnd(n);

  console.log('  step        wall     provider     units');
  console.log('  ─────────────────────────────────────────────────────────────');
  for (const s of steps) {
    console.log(
      `  ${pad(s.name, 10)}  ${pad(`${(s.ms / 1000).toFixed(1)}s`, 7)}  ` +
        `${pad(s.provider ?? '—', 11)}  ` +
        `${s.units != null ? `${s.units.toLocaleString()} ${s.unit}` : (s.note ?? '—')}`,
    );
  }
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log(`  ${pad('TOTAL', 10)}  ${(totalMs / 1000).toFixed(1)}s\n`);

  console.log(`  video      ${result.durationSec.toFixed(2)}s, ${(result.bytes / 1e6).toFixed(2)} MB`);
  console.log(`  scenes     ${durations.map((d) => d.toFixed(2)).join('s, ')}s`);
  console.log(`  mp4        ${outputPath}`);
  if (result.thumbnailPath) console.log(`  poster     ${result.thumbnailPath}`);
  console.log(`  project    ${join(dir, 'project.json')}\n`);

  /*
   * Units, not money. A price belongs to the operator's contract — it differs
   * per plan and changes without notice — and the same reasoning that keeps
   * rates out of `@orbit/video-gen` keeps them out of here. What is printed is
   * what was consumed, so it can be multiplied by a real invoice afterwards.
   */
  const chars = steps.find((s) => s.name === 'speak')?.units ?? 0;
  const bytes = steps.find((s) => s.name === 'align')?.units ?? 0;
  console.log('  To price this run, multiply by YOUR contracted rates:');
  console.log(`    ElevenLabs TTS        ${chars.toLocaleString()} characters`);
  console.log(`    ElevenLabs Scribe     ${(bytes / 1e6).toFixed(2)} MB of audio ` +
    `(~${result.durationSec.toFixed(0)}s — Scribe bills by duration)`);
  console.log('    Visuals               0 — generated locally, see the header note\n');
}

main().catch((e: unknown) => {
  console.error(`\n  spike failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
