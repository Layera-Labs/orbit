/**
 * Brief → ScenePlan. The one step an LLM performs.
 *
 * Everything downstream of here is deterministic given a valid plan, which is
 * the property the whole pipeline rests on: the model's job ends at this
 * function, and every stage after it is ordinary code over ordinary data. So
 * this is where a model's output is schema-validated, corrected and retried —
 * and the reason `parseScenePlan` throws pathed errors rather than returning a
 * boolean is that those messages ARE the retry prompt.
 *
 * ## What is retried, and what is not
 *
 * Only a violation of the plan's own rules. A `ScenePlanError` means the model
 * produced something answerable — "scenes[2].narration: must have 10–22 words,
 * got 5" — and re-prompting with that is likely to work.
 *
 * A transport failure is not retried here. A provider 500 is not fixed by
 * rephrasing, and this function has no idea whether it is worth waiting: that
 * judgement belongs to the step runner and the queue above it, which already
 * know how many times the job has been attempted and whether it has been paid
 * for. Retrying in two places would multiply, and the outer one is the one that
 * can see the money.
 *
 * Two things enforce that and they overlap: the brain call sits outside the
 * try, and the catch re-throws anything that is not a `ScenePlanError`. Either
 * alone would be enough for a provider error — that is deliberate, since the
 * cost of the redundancy is nothing and the cost of losing it is a retry loop
 * hammering a failing API.
 *
 * The guard does cover one case the placement cannot: a `validate` that throws
 * something which is not a `ScenePlanError` — a bug in a format, a TypeError.
 * Re-prompting a model with "Cannot read properties of undefined" three times
 * helps nobody, and it buries the bug under a generic give-up message.
 *
 * ## The caller owns the format and the aspect
 *
 * They are overwritten on the model's reply rather than validated. A user
 * picked 9:16 and picked the story format; a model changing either is not a
 * creative decision, it is noise — and rejecting it would spend a whole round
 * trip re-asking for something we already know the answer to. What the model
 * owns is the prose.
 */
import { formatPrompt, type Format } from './format.ts';
import {
  ScenePlanError,
  parseScenePlan,
  type Aspect,
  type ScenePlan,
} from './scene-plan.ts';

/**
 * A text-in, text-out language model.
 *
 * Deliberately the smallest possible surface: a provider that can complete a
 * prompt can back this, and nothing about structured-output APIs, tool calling
 * or token budgets leaks into the pipeline. Those are real and useful, and they
 * are also all different per vendor — an implementation is free to use its own
 * JSON mode, because the only contract here is that what comes back contains
 * the JSON that was asked for.
 *
 * NOTE: `@orbit/video-ai` exports an interface with the same name and a
 * different shape — `plan(prompt) => VideoSpec`, which chooses one of three
 * fixed templates. That is the older, narrower thing this supersedes; it is not
 * interchangeable with this one.
 */
export interface Brain {
  complete(prompt: string, opts?: { system?: string }): Promise<string>;
}

export interface PlanRequest {
  /** What the video should be about, in the user's words. */
  topic: string;
  format: Format;
  aspect: Aspect;
  /** Any extra direction: a tone, an audience, a detail to include. */
  notes?: string;
  /**
   * How many times to ask in total, including the first.
   *
   * Bounded because every attempt costs money and seconds. Three is enough for
   * the realistic case — a model that violates one bound usually fixes it when
   * shown which — and a model that cannot produce a valid plan in three tries
   * is a prompt problem, not a sampling one.
   */
  attempts?: number;
}

export interface PlanResult {
  plan: ScenePlan;
  /** How many completions it took. 1 is the ordinary case. */
  attempts: number;
  /**
   * Every violation that had to be corrected, in order. Empty on a first-try
   * success.
   *
   * Returned rather than swallowed because a model that fails the same rule
   * every single time is telling you the prompt is wrong, and that is invisible
   * if the retry quietly succeeds.
   */
  rejected: string[];
}

const SYSTEM =
  'You plan short-form videos. You reply with JSON and nothing else: no prose, ' +
  'no explanation, no markdown fence.';

export async function planScenes(brain: Brain, req: PlanRequest): Promise<PlanResult> {
  const attempts = Math.max(1, req.attempts ?? 3);
  const base = [
    formatPrompt(req.format),
    '',
    `The video is about: ${req.topic}`,
    ...(req.notes ? ['', `Also: ${req.notes}`] : []),
  ].join('\n');

  const rejected: string[] = [];
  let last = '';

  for (let i = 0; i < attempts; i++) {
    const prompt = i === 0 ? base : retryPrompt(base, last, rejected[rejected.length - 1]);
    /*
     * Outside the try, deliberately. A provider failure is not a plan the model
     * got wrong, so it must not be caught, counted as an attempt, and quoted
     * back at whatever answers next.
     */
    last = await brain.complete(prompt, { system: SYSTEM });
    try {
      return { plan: readPlan(last, req), attempts: i + 1, rejected };
    } catch (err) {
      // Only a plan-shaped complaint is worth re-asking about. A `validate`
      // that threw something else has a bug in it, and re-prompting a model
      // with "Cannot read properties of undefined" three times helps nobody.
      if (!(err instanceof ScenePlanError)) throw err;
      rejected.push(err.message);
    }
  }

  throw new ScenePlanError(
    `the planner did not produce a valid plan in ${attempts} attempts: ${rejected.join('; ')}`,
    'plan',
  );
}

/**
 * Show the model what it wrote AND what was wrong with it.
 *
 * Handing back only the error is the common mistake: a model that cannot see
 * its previous answer has to regenerate from scratch and is about as likely to
 * repeat the mistake as to fix it. With both, the correction is an edit.
 */
function retryPrompt(base: string, previous: string, error: string | undefined): string {
  return [
    base,
    '',
    'Your previous reply was rejected. This is what you sent:',
    previous.trim(),
    '',
    `It was rejected because: ${error ?? 'it was not a valid plan'}`,
    '',
    'Send the whole plan again, corrected. Change only what the rejection names.',
  ].join('\n');
}

function readPlan(text: string, req: PlanRequest): ScenePlan {
  const raw = extractJson(text);
  /*
   * Two different fixes here, for two different reasons.
   *
   * `format` and `aspect` are OVERWRITTEN: the caller owns them, so whatever
   * the model said is discarded rather than argued with.
   *
   * `topic` is only FILLED IN when missing. It is a one-line label for the
   * operator and the library, never rendered, so failing an entire attempt over
   * it would be pure waste — but when the model does write one it is a better
   * summary than the raw brief, so it wins.
   */
  const seeded = isPlainObject(raw)
    ? { topic: req.topic, ...raw, format: req.format.id, aspect: req.aspect }
    : raw;
  const plan = parseScenePlan(seeded);
  req.format.validate(plan);
  return plan;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Find the JSON in a model's reply.
 *
 * Told to reply with JSON and nothing else, a model mostly will — and then
 * sometimes wraps it in a markdown fence, or opens with "Here's the plan:", or
 * closes with a paragraph about its choices. None of that is worth a retry, so
 * three strategies in order of confidence: the whole reply, a fenced block, and
 * the widest brace-to-brace span.
 *
 * A failure throws `ScenePlanError`, so it IS retried — a reply with no JSON in
 * it at all is a model that has misunderstood, and showing it what it sent is
 * exactly the correction it needs.
 */
export function extractJson(text: string): unknown {
  const attempt = (s: string): unknown | undefined => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const trimmed = text.trim();
  const whole = attempt(trimmed);
  if (whole !== undefined) return whole;

  /*
   * Fences first, and the LAST one rather than the first: a model that explains
   * itself before answering puts an illustrative snippet up top and the real
   * answer at the end. The language tag is optional — ```json, ``` and ```JSON
   * all occur.
   */
  const fences = [...trimmed.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/g)];
  for (const fence of fences.reverse()) {
    const parsed = attempt(fence[1].trim());
    if (parsed !== undefined) return parsed;
  }

  const open = trimmed.indexOf('{');
  const close = trimmed.lastIndexOf('}');
  if (open !== -1 && close > open) {
    const parsed = attempt(trimmed.slice(open, close + 1));
    if (parsed !== undefined) return parsed;
  }

  throw new ScenePlanError('the reply contained no JSON', 'plan');
}
