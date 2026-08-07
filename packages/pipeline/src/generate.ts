/**
 * The whole generation, as one resumable sequence.
 *
 * Every expensive call goes through `runStep`, so a job that dies after the
 * voice and before the render does not pay for the voice again. The keys are
 * PER SCENE — `speak:2`, not `speak` — because that is where the granularity
 * actually matters: a provider that fails on the fourth of five narrations
 * should cost one retry, not five.
 *
 * ## The order is forced, not chosen
 *
 *     plan → speak → measure → align → visuals → compose → render
 *
 * Measurement has to follow speech because the length of a scene IS how long
 * the voice took, and alignment has to follow measurement because the word
 * timings come from transcribing the audio that was produced rather than from
 * the text that produced it. Visuals come after measurement too, but for a
 * smaller reason: a video clip has to be at least as long as the scene it
 * fills, and that is not known until the scene has a length.
 *
 * ## Injected, all of it
 *
 * No provider, no filesystem, no ffmpeg. Everything arrives as a dependency,
 * which is what lets the sequencing above — the part with the reasoning in it —
 * be tested without a key, a network or an encoder. The service supplies the
 * real ones.
 */
import type { CaptionLine, VideoProject } from '@orbit/video/browser';
import { composeStory, type SceneVisual, type SpokenScene } from './compose.ts';
import type { Format } from './format.ts';
import { planScenes, type Brain } from './planner.ts';
import { captionTextOf, frameSize, type Aspect, type ScenePlan } from './scene-plan.ts';
import { runStep, type StepLog } from './steps.ts';
import { resolveVisual, type AssetStore, type Compromise } from './visual.ts';
import type { AssetProvider } from '@orbit/shared';

export interface Spoken {
  /** An audio src the renderer understands — a path or an `upload:` token. */
  src: string;
  /** MEASURED. The provider owns the measurement; nothing here estimates. */
  durationSec: number;
}

export interface VoiceProvider {
  speak(text: string): Promise<Spoken>;
  /**
   * Word timings, by transcribing what was said.
   *
   * Optional in two senses: an implementation may not offer it at all, and one
   * that does may fail per-call — an ElevenLabs key carries per-scope
   * permissions and `speech_to_text` is off by default, so a key that speaks
   * perfectly well answers 401 here. Both cases DEGRADE: the captions become
   * per-scene instead of per-word, which reads fine and simply cannot animate.
   */
  align?(src: string): Promise<CaptionLine[]>;
}

export interface GenerateDeps {
  brain: Brain;
  voice: VoiceProvider;
  provider: AssetProvider;
  store: AssetStore;
  render(project: VideoProject): Promise<string>;
  log: StepLog;
  /**
   * How many provider calls at once.
   *
   * Three by default, and that is MEASURED rather than chosen: ElevenLabs
   * answered the Phase 0 spike with `concurrent_limit_exceeded` at four, and it
   * is a per-SUBSCRIPTION cap rather than a rate limit a retry gets around.
   */
  concurrency?: number;
  /** Told which step is running, for the job row and anything watching it. */
  onStep?(step: string): void;
}

export interface GenerateRequest {
  topic: string;
  format: Format;
  aspect: Aspect;
  notes?: string;
  /** An audio src for the bed, already resolved. */
  music?: string;
}

export interface GenerateResult {
  url: string;
  plan: ScenePlan;
  project: VideoProject;
  /** Everything the visual search had to give up, per scene. */
  compromises: { scene: number; gave: Compromise[] }[];
  /** Absent when alignment ran; a reason when it did not. */
  alignmentSkipped?: string;
}

/** `Promise.all` with a ceiling, preserving input order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export async function generate(
  deps: GenerateDeps,
  job: string,
  req: GenerateRequest,
): Promise<GenerateResult> {
  const { log } = deps;
  const limit = deps.concurrency ?? 3;
  const step = (name: string) => deps.onStep?.(name);

  step('plan');
  const planned = await runStep(log, job, 'plan', () =>
    planScenes(deps.brain, {
      topic: req.topic,
      format: req.format,
      aspect: req.aspect,
      ...(req.notes ? { notes: req.notes } : {}),
    }),
  );
  const plan = planned.plan;

  step('speak');
  const spoken = await mapLimit(plan.scenes, limit, (scene, i) =>
    runStep(log, job, `speak:${i}`, () => deps.voice.speak(scene.narration)),
  );

  /*
   * Alignment is the one optional provider step, so its failure is caught HERE
   * rather than left to the step runner. A job that cannot animate its captions
   * is a job that still produces a video; failing it would throw away four
   * fifths of a generation that has already been paid for.
   */
  step('align');
  let alignmentSkipped: string | undefined;
  let lines: (CaptionLine[] | undefined)[] = plan.scenes.map(() => undefined);
  if (deps.voice.align) {
    const align = deps.voice.align.bind(deps.voice);
    try {
      lines = await mapLimit(spoken, limit, (s, i) =>
        runStep(log, job, `align:${i}`, () => align(s.src)),
      );
    } catch (err) {
      alignmentSkipped = err instanceof Error ? err.message : String(err);
    }
  } else {
    alignmentSkipped = 'the voice provider does not transcribe';
  }

  step('visuals');
  const { width, height } = frameSize(req.aspect);
  const resolved = await mapLimit(plan.scenes, limit, (scene, i) =>
    runStep(log, job, `visual:${i}`, () =>
      resolveVisual({ provider: deps.provider, store: deps.store }, scene.visual, {
        width,
        height,
        kind: 'image',
        minDurationSec: spoken[i].durationSec,
      }),
    ),
  );

  step('compose');
  const project = composeStory({
    plan,
    spoken: spoken.map((s, i): SpokenScene => ({
      audioSrc: s.src,
      durationSec: s.durationSec,
      ...(lines[i]?.length ? { lines: lines[i]! } : {}),
    })),
    visuals: resolved.map((r): SceneVisual => ({ src: r.src, type: r.type })),
    ...(req.music ? { music: req.music } : {}),
  });

  step('render');
  const url = await runStep(log, job, 'render', () => deps.render(project));

  return {
    url,
    plan,
    project,
    compromises: resolved
      .map((r, scene) => ({ scene, gave: r.compromises }))
      .filter((c) => c.gave.length > 0),
    ...(alignmentSkipped ? { alignmentSkipped } : {}),
  };
}

/** What a scene's caption will read, for a caller that wants to show the plan. */
export const previewCaptions = (plan: ScenePlan): string[] =>
  plan.scenes.map(captionTextOf);
