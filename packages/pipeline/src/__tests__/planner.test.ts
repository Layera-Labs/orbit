/**
 * The planner: the one step a language model performs.
 *
 * Two things are being established. That a reply which is nearly right is
 * repaired rather than refused — models wrap JSON in fences and open with
 * "Here's the plan:", and none of that is worth a round trip. And that a reply
 * which is really wrong is sent back with enough to fix it.
 *
 * The brain is a fake throughout, and it has to be: there is no LLM key in this
 * environment. So the replies below are written as the shapes models actually
 * emit, and what is proven is the handling — not that any particular model
 * complies.
 */
import { describe, expect, it, vi } from 'vitest';
import { planScenes, extractJson, type Brain } from '../planner.ts';
import { ScenePlanError, type ScenePlan } from '../scene-plan.ts';
import { countWords, requireBounds, type Format } from '../format.ts';

/*
 * A format defined here rather than imported. `@layera-labs/orbit-formats` depends on this
 * package, so a test here cannot reach for the story without inverting that —
 * and testing the planner against the INTERFACE is the better test anyway.
 */
const example: ScenePlan = {
  topic: 'A test',
  format: 'test',
  aspect: '9:16',
  scenes: [
    { narration: 'One two three four.', visual: 'a red door' },
    { narration: 'Five six seven eight.', visual: 'a blue door' },
  ],
};

const format: Format = {
  id: 'test',
  title: 'Test',
  description: '',
  brief: {
    instructions: 'Be brief.',
    scenes: { min: 2, max: 3 },
    narrationWords: { min: 3, max: 8 },
    onScreenWords: { min: 1, max: 4 },
    example,
  },
  validate(plan) {
    requireBounds(plan.scenes.length, { min: 2, max: 3 }, 'scenes', 'scenes');
    plan.scenes.forEach((s, i) =>
      requireBounds(
        countWords(s.narration),
        { min: 3, max: 8 },
        `scenes[${i}].narration`,
        'words',
      ),
    );
  },
  compose: () => {
    throw new Error('not exercised here');
  },
};

/** Replies in order; the last one repeats if it runs out. */
const brainOf = (...replies: string[]): Brain & { prompts: string[] } => {
  const prompts: string[] = [];
  return {
    prompts,
    async complete(prompt: string) {
      prompts.push(prompt);
      return replies[Math.min(prompts.length - 1, replies.length - 1)];
    },
  };
};

const req = { topic: 'doors', format, aspect: '9:16' as const };
const good = JSON.stringify(example);

describe('planScenes', () => {
  it('returns a validated plan from a clean reply', async () => {
    const brain = brainOf(good);
    const result = await planScenes(brain, req);
    expect(result.plan.scenes).toHaveLength(2);
    expect(result.attempts).toBe(1);
    expect(result.rejected).toEqual([]);
  });

  it('asks with the format prompt and the topic', async () => {
    const brain = brainOf(good);
    await planScenes(brain, { ...req, notes: 'keep it dry' });
    expect(brain.prompts[0]).toContain('Be brief.');
    expect(brain.prompts[0]).toContain('2 to 3 scenes');
    expect(brain.prompts[0]).toContain('doors');
    expect(brain.prompts[0]).toContain('keep it dry');
  });

  it('passes a system instruction', async () => {
    // Typed, or `mock.calls[0][1]` is an index into an inferred empty tuple.
    const complete = vi.fn(async (_prompt: string, _opts?: { system?: string }) => good);
    await planScenes({ complete }, req);
    expect(complete.mock.calls[0][1]).toMatchObject({ system: expect.stringContaining('JSON') });
  });

  /*
   * The caller picked the aspect and the format. A model changing either is not
   * a creative decision, and arguing with it would spend a round trip on
   * something we already know the answer to.
   */
  it('overwrites the format and aspect the model chose', async () => {
    const wrong = JSON.stringify({ ...example, format: 'listicle', aspect: '16:9' });
    const { plan, attempts } = await planScenes(brainOf(wrong), req);
    expect(plan.format).toBe('test');
    expect(plan.aspect).toBe('9:16');
    expect(attempts).toBe(1);
  });

  it('supplies a missing topic but keeps one the model wrote', async () => {
    const { topic: _drop, ...noTopic } = example;
    const a = await planScenes(brainOf(JSON.stringify(noTopic)), req);
    // Never rendered, so failing an attempt over it would be pure waste.
    expect(a.plan.topic).toBe('doors');

    const b = await planScenes(brainOf(good), req);
    expect(b.plan.topic).toBe('A test');
  });
});

describe('correcting a bad plan', () => {
  const short = JSON.stringify({
    ...example,
    scenes: [{ narration: 'Too short.', visual: 'a door' }, example.scenes[1]],
  });

  it('retries a rule violation and reports what was wrong', async () => {
    const brain = brainOf(short, good);
    const result = await planScenes(brain, req);
    expect(result.attempts).toBe(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatch(/scenes\[0\]\.narration/);
  });

  /*
   * Both halves. A model handed only the error has to regenerate from scratch
   * and is about as likely to repeat the mistake as to fix it; handed its own
   * previous answer as well, the correction is an edit.
   */
  it('shows the model what it sent as well as why it was rejected', async () => {
    const brain = brainOf(short, good);
    await planScenes(brain, req);
    const retry = brain.prompts[1];
    expect(retry).toContain('Too short.');
    expect(retry).toMatch(/scenes\[0\]\.narration/);
  });

  /*
   * The one rule the whole ordering rests on. A model told not to estimate
   * lengths will sometimes do it anyway, and this is where it gets told again —
   * rather than the number being dropped silently and the operator believing it
   * was honoured.
   */
  it('sends back a scene that carried a duration', async () => {
    const withDuration = JSON.stringify({
      ...example,
      scenes: [{ ...example.scenes[0], durationSec: 4 }, example.scenes[1]],
    });
    const brain = brainOf(withDuration, good);
    const result = await planScenes(brain, req);
    expect(result.attempts).toBe(2);
    expect(brain.prompts[1]).toMatch(/voice decides/);
  });

  it('gives up after the attempt budget and names every violation', async () => {
    const brain = brainOf(short);
    await expect(planScenes(brain, { ...req, attempts: 2 })).rejects.toThrow(/2 attempts/);
    expect(brain.prompts).toHaveLength(2);
  });

  /*
   * A provider 500 is not fixed by rephrasing, and this function cannot see
   * whether the job has already been paid for. That judgement is the step
   * runner's; retrying in both places would multiply.
   *
   * Two things independently prevent it — the brain call sitting outside the
   * try, and the catch re-throwing a non-`ScenePlanError` — so neither can be
   * mutated away on its own and caught here. That redundancy is deliberate;
   * what this pins down is the BEHAVIOUR. The call count is the assertion that
   * does it: matching only the message would pass even when the error had been
   * retried three times and concatenated into the give-up message.
   */
  it('does not retry a transport failure', async () => {
    const complete = vi.fn(async () => {
      throw new Error('provider 503');
    });
    await expect(planScenes({ complete }, req)).rejects.toThrow('provider 503');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  /*
   * The guard's actual job. A format whose `validate` has a bug throws
   * something that is not a plan complaint, and quoting "Cannot read properties
   * of undefined" back at a model three times helps nobody — it also hides the
   * bug behind a generic "did not produce a valid plan" at the end.
   */
  it('does not retry a format whose validate is broken', async () => {
    const broken: Format = {
      ...format,
      validate() {
        throw new TypeError('cannot read properties of undefined');
      },
    };
    const brain = brainOf(good);
    await expect(planScenes(brain, { ...req, format: broken })).rejects.toThrow(TypeError);
    expect(brain.prompts).toHaveLength(1);
  });
});

describe('extractJson', () => {
  const obj = { a: 1 };
  const json = JSON.stringify(obj);

  it('reads a bare reply', () => {
    expect(extractJson(json)).toEqual(obj);
    expect(extractJson(`\n  ${json}\n `)).toEqual(obj);
  });

  it('reads a fenced reply, tagged or not', () => {
    expect(extractJson('```json\n' + json + '\n```')).toEqual(obj);
    expect(extractJson('```\n' + json + '\n```')).toEqual(obj);
    expect(extractJson('```JSON\n' + json + '\n```')).toEqual(obj);
  });

  it('reads through prose on either side', () => {
    expect(extractJson(`Here's the plan:\n${json}\n\nLet me know!`)).toEqual(obj);
    expect(extractJson("Sure. ```json\n" + json + '\n```\nI kept it short.')).toEqual(obj);
  });

  /*
   * The LAST fence, not the first. A model that explains itself before
   * answering puts an illustrative snippet at the top and the real answer at
   * the bottom.
   */
  it('takes the last fenced block when there are several', () => {
    const text = '```json\n{"a":0}\n```\nOn reflection:\n```json\n{"a":1}\n```';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('handles a nested object without stopping at the first brace', () => {
    const nested = { scenes: [{ narration: 'x' }], topic: 't' };
    expect(extractJson(`Plan:\n${JSON.stringify(nested)}\nDone.`)).toEqual(nested);
  });

  /* Retryable, because a reply with no JSON is a model that misunderstood. */
  it('throws a plan error when there is no JSON at all', () => {
    expect(() => extractJson('I cannot help with that.')).toThrow(ScenePlanError);
  });

  it('is retried like any other plan error', async () => {
    const brain = brainOf('I cannot help with that.', good);
    const result = await planScenes(brain, req);
    expect(result.attempts).toBe(2);
    expect(result.rejected[0]).toMatch(/no JSON/);
  });
});
