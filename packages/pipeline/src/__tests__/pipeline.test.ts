/**
 * The two pure halves of the pipeline: what a plan may say, and what a plan
 * plus measured audio becomes.
 *
 * Everything between them is provider calls, which the spike exercises for
 * real. What is worth pinning down here is the contract — because the whole
 * design rests on one claim, that the VOICE decides how long a scene is, and
 * that claim is only true if nothing upstream is allowed to assert otherwise.
 */
import { describe, expect, it } from 'vitest';
import { parseScenePlan, ScenePlanError, frameSize, captionTextOf } from '../scene-plan.ts';
import { composeStory } from '../compose.ts';
import type { ScenePlan } from '../scene-plan.ts';
import type { SceneVisual, SpokenScene } from '../compose.ts';

const valid = {
  topic: 'Why the sky is blue',
  format: 'story',
  aspect: '9:16',
  scenes: [
    { narration: 'Sunlight is white.', visual: 'the sun' },
    { narration: 'Air scatters the blue out of it.', onScreen: 'Air scatters blue', visual: 'sky' },
  ],
};

describe('parseScenePlan', () => {
  it('accepts a well-formed plan', () => {
    const p = parseScenePlan(valid);
    expect(p.scenes).toHaveLength(2);
    expect(p.scenes[1].onScreen).toBe('Air scatters blue');
  });

  /*
   * The rule the whole ordering rests on. A model told not to estimate lengths
   * will sometimes do it anyway; silently dropping the field would leave
   * whoever wrote the prompt believing it was honoured, then wondering why the
   * scene runs for a different time.
   */
  it('REFUSES a duration rather than ignoring one', () => {
    for (const key of ['duration', 'durationSec', 'seconds', 'length']) {
      const bad = {
        ...valid,
        scenes: [{ ...valid.scenes[0], [key]: 4 }],
      };
      expect(() => parseScenePlan(bad)).toThrow(ScenePlanError);
      expect(() => parseScenePlan(bad)).toThrow(/voice decides/);
    }
  });

  /*
   * The message IS the retry prompt. A planner handed "invalid plan" can only
   * try the same thing again; one handed a path can fix it.
   */
  it('says where the violation is', () => {
    const bad = { ...valid, scenes: [valid.scenes[0], { visual: 'x' }] };
    expect(() => parseScenePlan(bad)).toThrow(/scenes\[1\]\.narration/);
  });

  it('rejects the shapes an LLM actually produces when it goes wrong', () => {
    expect(() => parseScenePlan('here is your plan!')).toThrow(/must be an object/);
    expect(() => parseScenePlan({ ...valid, scenes: [] })).toThrow(/at least one scene/);
    expect(() => parseScenePlan({ ...valid, aspect: 'vertical' })).toThrow(/9:16/);
    expect(() => parseScenePlan({ ...valid, topic: '   ' })).toThrow(/must not be empty/);
  });

  it('trims, so whitespace does not become a caption', () => {
    const p = parseScenePlan({
      ...valid,
      scenes: [{ narration: '  spoken  ', visual: ' pic ', onScreen: '   ' }],
    });
    expect(p.scenes[0].narration).toBe('spoken');
    // Whitespace-only is absent, not an empty caption.
    expect(p.scenes[0].onScreen).toBeUndefined();
    expect(captionTextOf(p.scenes[0])).toBe('spoken');
  });

  it('sizes the frame for the platform', () => {
    expect(frameSize('9:16')).toEqual({ width: 1080, height: 1920 });
    expect(frameSize('16:9')).toEqual({ width: 1920, height: 1080 });
  });
});

describe('composeStory', () => {
  const plan = parseScenePlan(valid) as ScenePlan;
  const visuals: SceneVisual[] = [
    { src: 'a.png', type: 'image' },
    { src: 'b.png', type: 'image' },
  ];
  const spoken = (d: number[]): SpokenScene[] =>
    d.map((durationSec, i) => ({ audioSrc: `vo-${i}.mp3`, durationSec }));

  /*
   * The arithmetic that makes "the voice decides" real: every start after the
   * first is a running sum of MEASURED durations, so nothing in the timeline
   * can disagree with the audio.
   */
  it('lays scenes out from the measured durations', () => {
    const p = composeStory({ plan, spoken: spoken([4.2, 5.1]), visuals });
    const visual = p.tracks!.find((t) => t.kind === 'visual')!;
    expect(visual.clips.map((c) => c.start)).toEqual([0, 4.2]);
    expect(visual.clips.map((c) => c.duration)).toEqual([4.2, 5.1]);
  });

  it('puts the narration under its own scene', () => {
    const p = composeStory({ plan, spoken: spoken([4.2, 5.1]), visuals });
    const voice = p.tracks!.find((t) => t.kind === 'audio')!;
    expect(voice.clips.map((c) => c.start)).toEqual([0, 4.2]);
  });

  /*
   * The regression that cost this spike a run. `createProject` silently dropped
   * `tracks`, so the project came back with no clips and no audio — and it
   * still RENDERED, as captions over a background for the right duration. The
   * output was plausible enough to blame on the media.
   */
  it('produces a project that actually contains its media', () => {
    const p = composeStory({ plan, spoken: spoken([4, 5]), visuals });
    expect(p.tracks?.length).toBe(2);
    expect(p.tracks!.flatMap((t) => t.clips).length).toBe(4);
  });

  it('captions each scene, wrapped', () => {
    const p = composeStory({ plan, spoken: spoken([4, 5]), visuals });
    expect(p.overlays).toHaveLength(2);
    // Every format must set `maxWidth`: wrapping is opt-in in the engine, so
    // leaving it off is how a generated hook renders off both edges.
    expect(p.overlays.every((o) => (o as { maxWidth?: number }).maxWidth! > 0)).toBe(true);
  });

  it('prefers the on-screen text to the narration where they differ', () => {
    const p = composeStory({ plan, spoken: spoken([4, 5]), visuals });
    expect((p.overlays[1] as { text: string }).text).toBe('Air scatters blue');
  });

  /* With word timings, one overlay per transcribed LINE, shifted onto the
     timeline — so a word-level effect has absolute seconds to work from. */
  it('shifts word timings onto the timeline when alignment ran', () => {
    const withLines: SpokenScene[] = [
      { audioSrc: 'a.mp3', durationSec: 4, lines: [{ text: 'one two', start: 0, end: 1, words: [
        { text: 'one', start: 0, end: 0.4 },
        { text: 'two', start: 0.5, end: 1 },
      ] }] },
      { audioSrc: 'b.mp3', durationSec: 5, lines: [{ text: 'three', start: 0.2, end: 1.2, words: [
        { text: 'three', start: 0.2, end: 1.2 },
      ] }] },
    ];
    const p = composeStory({ plan, spoken: withLines, visuals });
    const second = p.overlays[1] as { start: number; words?: { start: number }[] };
    // Scene 2 starts at 4, so its line at 0.2 lands at 4.2 and so do its words.
    expect(second.start).toBeCloseTo(4.2, 6);
    expect(second.words![0].start).toBeCloseTo(4.2, 6);
  });

  it('falls back to a scene-level caption when alignment was skipped', () => {
    const p = composeStory({ plan, spoken: spoken([4, 5]), visuals });
    expect((p.overlays[0] as { words?: unknown[] }).words).toBeUndefined();
    expect(p.overlays).toHaveLength(2);
  });

  it('refuses a mismatched count rather than composing a short video', () => {
    expect(() => composeStory({ plan, spoken: spoken([4]), visuals })).toThrow(/expected 2/);
    expect(() =>
      composeStory({ plan, spoken: spoken([4, 5]), visuals: [visuals[0]] }),
    ).toThrow(/expected 2/);
  });
});
