/**
 * The plan a brief turns into, and the only thing an LLM is allowed to produce.
 *
 * Everything downstream is deterministic GIVEN a valid ScenePlan, which is what
 * makes the pipeline testable: the model's job ends here, and every step after
 * it is ordinary code over ordinary data. So this is schema-validated and
 * retried on violation rather than parsed hopefully — prose that "looks like"
 * a plan is the one input that can break every stage at once.
 *
 * ## There are no durations here, and that is the design
 *
 * The obvious shape gives each scene a length the model estimated. That length
 * is fiction. What decides how long a scene lasts is how long the voice takes
 * to say the narration — which is not knowable until the audio exists, and
 * which no amount of prompting makes an LLM good at.
 *
 * Worse, the timings that matter most are per-WORD, for captions, and those
 * come from transcribing the audio the voice produced. So the true order is:
 *
 *     plan (no times) → speak → measure → align → compose
 *
 * A `durationSec` on a scene would be a number every later stage had to either
 * ignore or reconcile, and reconciling would mean either stretching audio or
 * cutting narration. Leaving it out makes the dependency explicit.
 */

export type Aspect = '9:16' | '1:1' | '16:9';

export interface Scene {
  /**
   * Spoken aloud. This is what decides the scene's length, so it is the one
   * required field with real weight.
   */
  narration: string;
  /**
   * Burned on screen, if different from the narration.
   *
   * Usually a shortened form: a caption that reproduces a full sentence of
   * speech is unreadable at the pace the speech runs. Absent means the caption
   * track carries the narration itself, word-aligned.
   */
  onScreen?: string;
  /**
   * What the picture should be — a stock search query or a generation prompt,
   * depending on the mode the caller resolves visuals in.
   */
  visual: string;
}

export interface ScenePlan {
  /** One line, for the operator and the library. Never rendered. */
  topic: string;
  /** Which archetype composes it. `@layera-labs/orbit-formats` will own these. */
  format: string;
  aspect: Aspect;
  scenes: Scene[];
}

export class ScenePlanError extends Error {
  /** Where the violation is, e.g. `scenes[2].narration`. */
  path: string;

  /*
   * Written out rather than declared as a constructor parameter property.
   * Node's type STRIPPING removes annotations without rewriting anything, so
   * `constructor(public path: string)` — which has to emit an assignment — is
   * rejected outright. This package is run from source by the spike, so the
   * same constraint applies to it throughout: no parameter properties, no
   * enums, no namespaces.
   */
  constructor(message: string, path: string) {
    super(`${path}: ${message}`);
    this.name = 'ScenePlanError';
    this.path = path;
  }
}

const ASPECTS: readonly Aspect[] = ['9:16', '1:1', '16:9'];

/** Non-empty after trimming — a whitespace-only string is an absent one. */
function str(v: unknown, path: string, required: boolean): string | undefined {
  if (v == null) {
    if (required) throw new ScenePlanError('is required', path);
    return undefined;
  }
  if (typeof v !== 'string') throw new ScenePlanError(`must be a string, got ${typeof v}`, path);
  const t = v.trim();
  if (!t) {
    if (required) throw new ScenePlanError('must not be empty', path);
    return undefined;
  }
  return t;
}

/**
 * Validate, and say exactly what is wrong.
 *
 * The message is the retry prompt: a planner that gets "invalid plan" back can
 * only try the same thing again, while one that gets
 * `scenes[2].narration: is required` can fix it. That is the whole reason this
 * throws a pathed error rather than returning a boolean.
 */
export function parseScenePlan(input: unknown): ScenePlan {
  if (input == null || typeof input !== 'object' || Array.isArray(input))
    throw new ScenePlanError('must be an object', 'plan');
  const o = input as Record<string, unknown>;

  const topic = str(o.topic, 'topic', true)!;
  const format = str(o.format, 'format', true)!;

  const rawAspect = str(o.aspect, 'aspect', true)!;
  if (!ASPECTS.includes(rawAspect as Aspect))
    throw new ScenePlanError(`must be one of ${ASPECTS.join(', ')}`, 'aspect');
  const aspect = rawAspect as Aspect;

  if (!Array.isArray(o.scenes)) throw new ScenePlanError('must be an array', 'scenes');
  if (o.scenes.length === 0) throw new ScenePlanError('must have at least one scene', 'scenes');

  const scenes: Scene[] = o.scenes.map((raw, i) => {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw))
      throw new ScenePlanError('must be an object', `scenes[${i}]`);
    const s = raw as Record<string, unknown>;
    /*
     * `duration` is rejected outright rather than ignored. A model told not to
     * estimate lengths will sometimes do it anyway, and silently dropping the
     * field would leave whoever wrote the prompt believing it was honoured —
     * then wondering why the scene runs for a different time.
     */
    for (const banned of ['duration', 'durationSec', 'seconds', 'length'])
      if (banned in s)
        throw new ScenePlanError(
          'must not carry a duration — the voice decides how long a scene is, and it is measured after TTS',
          `scenes[${i}].${banned}`,
        );
    return {
      narration: str(s.narration, `scenes[${i}].narration`, true)!,
      visual: str(s.visual, `scenes[${i}].visual`, true)!,
      ...(str(s.onScreen, `scenes[${i}].onScreen`, false) !== undefined
        ? { onScreen: str(s.onScreen, `scenes[${i}].onScreen`, false)! }
        : {}),
    };
  });

  return { topic, format, aspect, scenes };
}

/** Output pixels for an aspect, at the resolution short-form platforms want. */
export function frameSize(aspect: Aspect): { width: number; height: number } {
  switch (aspect) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
      return { width: 1920, height: 1080 };
  }
}

/** What the caption should read, which is not always what is said. */
export const captionTextOf = (scene: Scene): string => scene.onScreen ?? scene.narration;
