/**
 * The story archetype.
 *
 * Two kinds of assertion here, and the second is the one that matters. The
 * ordinary kind checks that `validate` rejects what it should. The other checks
 * that the format does not CONTRADICT ITSELF — that the prompt the planner is
 * given, the example it is shown, and the validator it is judged by are all
 * saying the same thing. A format that fails those is worse than a strict one:
 * the model is corrected for something it was never told, or shown an example
 * that breaks the rule it is about to be held to.
 */
import { describe, expect, it } from 'vitest';
import { ScenePlanError, countWords, formatPrompt, parseScenePlan } from '@layera-labs/orbit-pipeline';
import type { Scene, ScenePlan } from '@layera-labs/orbit-pipeline';
import { FORMATS, formatById, story } from '../index';

const plan = (over: Partial<ScenePlan> = {}): ScenePlan => ({
  ...story.brief.example,
  ...over,
});

/** A plan of `n` scenes, each legal, each with a different visual. */
const scenes = (n: number): Scene[] =>
  Array.from({ length: n }, (_, i) => ({
    narration: `This is a perfectly ordinary sentence of narration for scene number ${i}.`,
    visual: `a photograph of subject number ${i}`,
  }));

describe('the format does not contradict itself', () => {
  /*
   * The example is what a model actually copies. Shown one thing and told
   * another, it follows the thing it was shown — so an example that breaks the
   * format's own rules teaches every generated plan to break them.
   */
  it('its own example passes its own validation', () => {
    expect(() => story.validate(story.brief.example)).not.toThrow();
  });

  it('its own example is a valid ScenePlan', () => {
    // Including the rule that a scene may not carry a duration — the example is
    // the one place a stray `durationSec` would be copied into every plan.
    expect(() => parseScenePlan(story.brief.example)).not.toThrow();
  });

  /*
   * The prompt's numbers come from the brief, which is also what `validate`
   * reads. This is what stops a prompt saying "4 to 7" beside a validator that
   * accepts 3 to 10 — there is only one pair of numbers.
   */
  it('states in the prompt exactly the bounds it enforces', () => {
    const prompt = formatPrompt(story);
    const b = story.brief;
    expect(prompt).toContain(`${b.scenes.min} to ${b.scenes.max} scenes`);
    expect(prompt).toContain(
      `${b.narrationWords.min} to ${b.narrationWords.max} words`,
    );

    // And the numbers it states are the ones that actually bite.
    expect(() => story.validate(plan({ scenes: scenes(b.scenes.max) }))).not.toThrow();
    expect(() => story.validate(plan({ scenes: scenes(b.scenes.max + 1) }))).toThrow();
    expect(() => story.validate(plan({ scenes: scenes(b.scenes.min) }))).not.toThrow();
    expect(() => story.validate(plan({ scenes: scenes(b.scenes.min - 1) }))).toThrow();
  });

  it('shows an example that obeys its own word counts', () => {
    const b = story.brief;
    for (const scene of b.example.scenes) {
      const n = countWords(scene.narration);
      expect(n).toBeGreaterThanOrEqual(b.narrationWords.min);
      expect(n).toBeLessThanOrEqual(b.narrationWords.max);
      if (scene.onScreen) {
        const m = countWords(scene.onScreen);
        expect(m).toBeGreaterThanOrEqual(b.onScreenWords.min);
        expect(m).toBeLessThanOrEqual(b.onScreenWords.max);
      }
    }
  });

  /* The rule the planner breaks most confidently, so it is said as well as caught. */
  it('tells the planner not to invent a duration', () => {
    expect(formatPrompt(story)).toMatch(/never give a scene a duration/i);
  });
});

describe('validate', () => {
  /* The message IS the retry prompt, so it has to name the scene. */
  it('says which scene is wrong and what the number was', () => {
    const bad = plan({
      scenes: [...scenes(3), { narration: 'Too short.', visual: 'a short thing' }],
    });
    expect(() => story.validate(bad)).toThrow(ScenePlanError);
    expect(() => story.validate(bad)).toThrow(/scenes\[3\]\.narration/);
    expect(() => story.validate(bad)).toThrow(/got 2/);
  });

  it('holds on-screen text to its own, shorter bound', () => {
    const four = scenes(4);
    four[0] = {
      ...four[0],
      onScreen: 'this on screen line is very considerably too long to read',
    };
    const long = plan({ scenes: four });
    expect(() => story.validate(long)).toThrow(/scenes\[0\]\.onScreen/);
  });

  it('allows a scene with no on-screen text at all', () => {
    expect(() => story.validate(plan({ scenes: scenes(4) }))).not.toThrow();
  });

  /*
   * Two scenes showing the same picture does not read as a stylistic choice, it
   * reads as a bug in the renderer — and a planner asked for five queries about
   * one subject will happily repeat one.
   */
  it('refuses a repeated visual, and names the scene it repeats', () => {
    const dup = scenes(4);
    dup[3].visual = `  A Photograph Of Subject   Number 1 `;
    expect(() => story.validate(plan({ scenes: dup }))).toThrow(/scenes\[3\]\.visual/);
    // Case and spacing differ; it is still the same search query.
    expect(() => story.validate(plan({ scenes: dup }))).toThrow(/scenes\[1\]/);
  });

  /*
   * A plan naming another archetype is a wiring error. Composing it as a story
   * anyway would produce a video that is fine on its own terms and not the one
   * that was asked for, which is the hardest kind of wrong to notice.
   */
  it('refuses a plan that is not a story', () => {
    expect(() => story.validate(plan({ format: 'listicle' }))).toThrow(/format/);
  });
});

describe('the registry', () => {
  it('finds a format by the id a plan carries', () => {
    expect(formatById('story')).toBe(story);
  });

  /* Not a fallback to the default: see the note on `formatById`. */
  it('returns nothing for an id it does not have', () => {
    // Deliberately a name no archetype will ever take. It used to be
    // 'listicle', which passed only until the countdown format existed — a
    // negative test aimed at something on the roadmap expires without warning.
    expect(formatById('not-a-format')).toBeUndefined();
  });

  it('gives every format a distinct id', () => {
    expect(new Set(FORMATS.map((f) => f.id)).size).toBe(FORMATS.length);
  });

  /* Every format is held to the two rules above, not just the story. */
  it.each(FORMATS.map((f) => [f.id, f] as const))(
    '%s: its example passes its own validation and schema',
    (_id, format) => {
      expect(() => parseScenePlan(format.brief.example)).not.toThrow();
      expect(() => format.validate(format.brief.example)).not.toThrow();
      expect(format.brief.example.format).toBe(format.id);
    },
  );
});
