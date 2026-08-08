/**
 * What an archetype is.
 *
 * A format is the editorial half of a generation: what shape the video takes,
 * what the planner is told to write, and what counts as a plan that obeyed. The
 * mechanical half — turning a plan plus measured audio into a timeline — is
 * `compose.ts`, and the line between them is that anything depending on the
 * format's EDITORIAL shape lives in a format, anything that is timeline
 * arithmetic lives here.
 *
 * ## The interface is here and the formats are not, deliberately
 *
 * Same seam as `StepLog` and `GenerationQueue`. `@orbit/formats` depends on
 * this package; this package must never depend on it, or the runner ends up
 * coupled to the library of archetypes it is supposed to be indifferent to. The
 * package boundary is what makes that structural rather than a convention
 * somebody remembers.
 *
 * ## One object drives both the prompt and the validation
 *
 * The failure this is built to prevent: a prompt that says "4 to 7 scenes" and
 * a validator that accepts 3 to 10. The model is then corrected for something
 * it was never told, or told something that is not enforced — and either way
 * the retry message and the instruction contradict each other, which is the
 * worst possible thing to hand a model that is trying to comply.
 *
 * So the numbers live in `brief`, `formatPrompt` generates the instructions
 * FROM them, and `validate` is written against the same fields. They cannot
 * drift, because there is only one of them.
 */
import { ScenePlanError, type ScenePlan } from './scene-plan.ts';
import type { ComposeInput } from './compose.ts';
import type { VideoProject } from '@orbit/video/browser';

/** Inclusive on both ends. */
export interface Bounds {
  min: number;
  max: number;
}

export interface FormatBrief {
  /**
   * The editorial shape, in prose, for the planner.
   *
   * Only what a number cannot say: the arc, what the first scene has to do,
   * what makes a good `visual`. Never repeat a bound here in words — that is
   * what the bounds are for, and a sentence saying "about five scenes" beside a
   * field saying 4–7 is exactly the contradiction this design exists to avoid.
   */
  instructions: string;
  scenes: Bounds;
  /**
   * Words of narration per scene.
   *
   * Words, not seconds, because a plan carries no durations — the voice decides
   * how long a scene is and it is measured after TTS. Words are the one handle
   * on pacing the planner can actually control, and at ordinary TTS pace (~2.5
   * a second) they convert well enough to reason about.
   */
  narrationWords: Bounds;
  /** Words of on-screen text, when a scene carries any. */
  onScreenWords: Bounds;
  /**
   * A worked example.
   *
   * The part that actually makes a model comply — a schema plus an example
   * beats a schema plus more adjectives. It is held to the format's own rules
   * by its own tests: an example that breaks them teaches the model to.
   */
  example: ScenePlan;
}

export interface Format {
  id: string;
  /** For a picker. */
  title: string;
  description: string;
  brief: FormatBrief;
  /**
   * The rules beyond the ScenePlan schema. Throws `ScenePlanError`, whose
   * message is what gets handed back to the planner on a retry — so it must say
   * which scene and what was wrong with it.
   */
  validate(plan: ScenePlan): void;
  compose(input: ComposeInput): VideoProject;
}

/**
 * Words, counted the one way.
 *
 * Every format needs this and three of them would count it three ways, so a
 * plan that passed one validator would fail another for reasons nobody could
 * see. Whitespace-separated runs: a hyphenated compound is one word, which
 * matches how a narrator reads it.
 */
export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Throws with the path and the actual number, so a retry can act on it. */
export function requireBounds(n: number, b: Bounds, path: string, unit: string): void {
  if (n < b.min || n > b.max)
    throw new ScenePlanError(`must have ${b.min}–${b.max} ${unit}, got ${n}`, path);
}

/**
 * The planner's instructions, generated from the brief.
 *
 * Not a hand-written prompt string sitting beside the numbers. This is the
 * whole point of the brief: change `scenes.max` and the prompt says the new
 * number, because there is nowhere else for it to come from.
 */
export function formatPrompt(format: Format): string {
  const b = format.brief;
  return [
    `Write a plan for a short video in the "${format.id}" format.`,
    '',
    b.instructions.trim(),
    '',
    'Rules:',
    `- ${b.scenes.min} to ${b.scenes.max} scenes.`,
    `- Each scene's narration is ${b.narrationWords.min} to ${b.narrationWords.max} words.`,
    `- When a scene has onScreen text it is ${b.onScreenWords.min} to ${b.onScreenWords.max} words.`,
    '- Every scene needs a different visual. Repeating one makes the video look broken.',
    /*
     * Stated to the model as well as enforced, because it is the rule a planner
     * breaks most confidently. Asked for a length it will invent one, and a
     * number it invented is a number something downstream has to either ignore
     * or reconcile.
     */
    '- Never give a scene a duration, length or time. The voice decides how long a scene runs,',
    '  and it is measured after the narration is spoken.',
    '',
    'Reply with JSON in exactly this shape, and nothing else:',
    JSON.stringify(b.example, null, 2),
  ].join('\n');
}
