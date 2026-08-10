/**
 * What every archetype must be true of, plus what makes each one itself.
 *
 * The shared block is the valuable half. A format library grows by copying the
 * last format, so a rule that lives only in a comment survives exactly until
 * the next one is written — these run over `FORMATS`, so a fifth archetype is
 * held to them the moment it is registered, without anybody remembering to.
 */
import { describe, expect, it } from 'vitest';
import {
  ScenePlanError,
  formatPrompt,
  type ComposeInput,
  type Format,
  type ScenePlan,
  type SceneVisual,
  type SpokenScene,
} from '@layera-labs/orbit-pipeline';
import { textOverlaysOf } from '@layera-labs/orbit-video/browser';
import { FORMATS, chat, formatById, isOwn, itemNumbers, listicle, split, story } from '../index';

/** Spoken scenes of a known length, so every start is arithmetic we can check. */
const spokenFor = (plan: ScenePlan, secs = 4): SpokenScene[] =>
  plan.scenes.map((_, i) => ({ audioSrc: `vo-${i}.mp3`, durationSec: secs }));

const visualsFor = (plan: ScenePlan): SceneVisual[] =>
  plan.scenes.map((_, i) => ({ src: `pic-${i}.jpg`, type: 'image' as const }));

const inputFor = (f: Format, over: Partial<ComposeInput> = {}): ComposeInput => {
  const plan = f.brief.example;
  return { plan, spoken: spokenFor(plan), visuals: visualsFor(plan), ...over };
};

describe.each(FORMATS.map((f) => [f.id, f] as const))('%s — the rules every format obeys', (_id, f) => {
  it('has an example that passes its own validator', () => {
    /*
     * The most important test in this file. The example is what the planner is
     * SHOWN, and a model shown one thing and told another follows the thing it
     * was shown — so an example that breaks the format's own bounds does not
     * merely document them wrongly, it actively teaches the model to violate
     * them, and every generation then fails validation for a reason nobody can
     * find by reading the prompt.
     */
    expect(() => f.validate(f.brief.example)).not.toThrow();
  });

  it('declares its own id on that example', () => {
    expect(f.brief.example.format).toBe(f.id);
  });

  it('rejects a plan belonging to another format', () => {
    const other = FORMATS.find((g) => g.id !== f.id)!;
    expect(() => f.validate({ ...f.brief.example, format: other.id })).toThrow(ScenePlanError);
  });

  it('generates a prompt carrying its own numbers', () => {
    // `formatPrompt` derives the instructions FROM the brief, so a bound and
    // the sentence stating it cannot drift. Asserted per format because that
    // guarantee is worthless if one of them hand-writes its prompt instead.
    const prompt = formatPrompt(f);
    expect(prompt).toContain(`${f.brief.scenes.min} to ${f.brief.scenes.max} scenes`);
    expect(prompt).toContain(
      `${f.brief.narrationWords.min} to ${f.brief.narrationWords.max} words`,
    );
  });

  it('sets maxWidth on EVERY text overlay it emits', () => {
    /*
     * The trap the engine's own design creates, and the reason this is checked
     * mechanically rather than by convention.
     *
     * Wrapping is opt-in: absent `maxWidth`, only an explicit newline breaks a
     * line. Generated text has no newlines and no upper bound on length, so a
     * format that forgets this renders a long hook off both edges of the frame
     * — and it does so silently, in the export, on somebody else's video.
     */
    const project = f.compose(inputFor(f));
    const texts = textOverlaysOf(project.overlays);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.maxWidth, `${f.id}: overlay "${t.id}" has no maxWidth`).toBeGreaterThan(0);
      expect(t.maxWidth!).toBeLessThanOrEqual(project.width);
    }
  });

  it('keeps every overlay inside the video it belongs to', () => {
    // An overlay running past the end silently extends the render — it counts
    // towards `projectDuration` — so a stray `end` buys frames of black nobody
    // asked for and everybody pays to encode.
    const project = f.compose(inputFor(f));
    const total = project.tracks!
      .filter((t) => t.kind === 'audio' && t.id === 'voice')
      .flatMap((t) => t.clips)
      .reduce((s, c) => s + c.duration, 0);
    for (const o of project.overlays) {
      expect(o.start, `${o.id} starts before zero`).toBeGreaterThanOrEqual(0);
      expect(o.end, `${o.id} outlives the video`).toBeLessThanOrEqual(total + 1e-6);
      expect(o.end, `${o.id} is empty`).toBeGreaterThan(o.start);
    }
  });

  it('gives every overlay a unique id', () => {
    // Two overlays sharing an id collide in `overlayImages`, so one plate's PNG
    // overwrites the other's and a layer draws the wrong picture.
    const ids = f.compose(inputFor(f)).overlays.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('starts scenes from the MEASURED durations, not from the plan', () => {
    /*
     * The rule the whole pipeline rests on, asserted on the scene STARTS.
     *
     * Checking that the video merely gets longer is not enough, and a mutation
     * run proved it: replacing the accumulator with a constant left every
     * overlay's `end` still moving, because an end is computed from its own
     * scene's duration and would shift even with the clock broken. Only the
     * starts — where each depends on every measurement before it — actually
     * pin the rule down.
     */
    const plan = f.brief.example;
    for (const secs of [2, 6]) {
      const project = f.compose(inputFor(f, { spoken: spokenFor(plan, secs) }));
      const scenes = project
        .tracks!.find((t) => t.kind === 'visual' && t.id === 'visual')!
        .clips.filter((c) => c.id.startsWith('scene-'));
      expect(scenes).toHaveLength(plan.scenes.length);
      scenes.forEach((c, i) => {
        expect(c.start, `${f.id}: scene ${i} at ${secs}s each`).toBeCloseTo(i * secs, 6);
        expect(c.duration).toBeCloseTo(secs, 6);
      });
    }
  });

  it('refuses per-scene arrays that do not match the plan', () => {
    const plan = f.brief.example;
    expect(() => f.compose(inputFor(f, { spoken: spokenFor(plan).slice(1) }))).toThrow(/spoken/);
    expect(() => f.compose(inputFor(f, { visuals: visualsFor(plan).slice(1) }))).toThrow(/visuals/);
  });

  it('lays the music bed under the whole video when asked', () => {
    const project = f.compose(inputFor(f, { music: 'bed.mp3' }));
    const music = project.tracks!.find((t) => t.id === 'music');
    expect(music?.clips).toHaveLength(1);
    expect(music!.clips[0].start).toBe(0);
  });
});

describe('the library', () => {
  it('offers four distinct archetypes, story first', () => {
    expect(FORMATS.map((f) => f.id)).toEqual(['story', 'listicle', 'split', 'chat']);
  });

  it('looks one up, and refuses to guess', () => {
    expect(formatById('listicle')).toBe(listicle);
    // Not a fallback to story: a plan naming a format that does not exist is a
    // wiring error, and composing it as something else produces a video that is
    // fine on its own terms and not the one that was asked for.
    expect(formatById('nope')).toBeUndefined();
  });

  it('gives each format its own instructions', () => {
    const briefs = FORMATS.map((f) => f.brief.instructions.trim());
    expect(new Set(briefs).size).toBe(briefs.length);
  });
});

describe('listicle', () => {
  it('counts DOWN, with the title card unnumbered', () => {
    // Numbering up puts the best item first and gives every later scene a
    // reason to leave. The count is the entire mechanism.
    expect(itemNumbers(5)).toEqual([null, 4, 3, 2, 1]);
  });

  it('draws a numbered badge for every item and none for the title', () => {
    const project = listicle.compose(inputFor(listicle));
    const numbers = textOverlaysOf(project.overlays).filter((o) => o.id.startsWith('num-'));
    expect(numbers.map((o) => o.text)).toEqual(['4', '3', '2', '1']);
    expect(project.overlays.filter((o) => o.id === 'badge-0')).toHaveLength(0);
  });

  it('puts the badge plate UNDER the captions', () => {
    /*
     * One number decides this, and getting it backwards hides the words behind
     * an opaque plate — which is worse than hiding the number, because the
     * caption is the thing a muted viewer is reading.
     */
    const project = listicle.compose(inputFor(listicle));
    const badge = project.overlays.find((o) => o.id === 'badge-1')!;
    const caption = project.overlays.find((o) => o.id.startsWith('caption-'))!;
    expect(badge.layer!).toBeLessThan(caption.layer!);
  });

  it('requires a name for every item, because it draws one', () => {
    const plan = listicle.brief.example;
    const noName: ScenePlan = {
      ...plan,
      scenes: plan.scenes.map((s, i) => (i === 2 ? { ...s, onScreen: undefined } : s)),
    };
    expect(() => listicle.validate(noName)).toThrow(/scenes\[2\]\.onScreen/);
  });
});

describe('split', () => {
  it('refuses anything but a tall frame', () => {
    // Two stacked halves of a landscape frame are two letterboxes. Caught at
    // validation, before the caller has paid for a voice.
    for (const aspect of ['16:9', '1:1'] as const) {
      expect(() => split.validate({ ...split.brief.example, aspect })).toThrow(/9:16/);
    }
  });

  it('puts the scene above the seam and the filler below it', () => {
    const project = split.compose(inputFor(split, { filler: 'loop.mp4' }));
    const scene = project.tracks!.find((t) => t.id === 'visual')!.clips[0] as {
      rect: { y: number; h: number };
    };
    const filler = project.tracks!.find((t) => t.id === 'filler')!.clips[0] as {
      rect: { y: number; h: number };
      muted?: boolean;
      duration: number;
    };
    expect(scene.rect.y).toBe(0);
    expect(scene.rect.h + filler.rect.h).toBeCloseTo(1, 6);
    expect(filler.rect.y).toBeCloseTo(scene.rect.h, 6);
  });

  it('mutes the filler and runs it as ONE clip for the whole video', () => {
    // Cutting it per scene would make it read as content, which is the one
    // thing it must not do; leaving its audio in would talk over the narration.
    const project = split.compose(inputFor(split, { filler: 'loop.mp4' }));
    const filler = project.tracks!.find((t) => t.id === 'filler')!;
    expect(filler.clips).toHaveLength(1);
    expect((filler.clips[0] as { muted?: boolean }).muted).toBe(true);
    expect(filler.clips[0].duration).toBe(split.brief.example.scenes.length * 4);
  });

  it('composes without a filler rather than failing', () => {
    // The format is still the format with the lower half empty; a missing
    // optional input must not lose a video somebody has already paid for.
    const project = split.compose(inputFor(split));
    expect(project.tracks!.some((t) => t.id === 'filler')).toBe(false);
    expect(project.tracks!.find((t) => t.id === 'visual')!.clips).toHaveLength(
      split.brief.example.scenes.length,
    );
  });

  it('keeps the captions clear of the seam', () => {
    const project = split.compose(inputFor(split));
    for (const t of textOverlaysOf(project.overlays)) expect(t.y).toBeGreaterThan(0.55);
  });
});

describe('chat', () => {
  it('opens with the other person and alternates', () => {
    expect([0, 1, 2, 3].map(isOwn)).toEqual([false, true, false, true]);
  });

  it('accumulates the thread rather than replacing it', () => {
    /*
     * The property that makes it read as a conversation. Part-way through, more
     * than one message must be on screen — a format that showed one bubble at a
     * time would pass every other test in this file and look nothing like a
     * chat.
     */
    const project = chat.compose(inputFor(chat));
    const at = 10; // inside the third scene, at 4s each
    const live = project.overlays.filter((o) => o.start <= at && o.end > at && o.id.startsWith('bubble-'));
    expect(live.length).toBeGreaterThan(1);
  });

  it('pairs every bubble with exactly one message', () => {
    const project = chat.compose(inputFor(chat));
    const bubbles = project.overlays.filter((o) => o.id.startsWith('bubble-')).map((o) => o.id.slice(7));
    const msgs = project.overlays.filter((o) => o.id.startsWith('msg-')).map((o) => o.id.slice(4));
    expect(msgs.sort()).toEqual(bubbles.sort());
  });

  it('draws the text over its own bubble', () => {
    const project = chat.compose(inputFor(chat));
    const bubble = project.overlays.find((o) => o.id.startsWith('bubble-'))!;
    const msg = project.overlays.find((o) => o.id === `msg-${bubble.id.slice(7)}`)!;
    expect(msg.layer!).toBeGreaterThan(bubble.layer!);
    expect(msg.x).toBe(bubble.x);
    expect(msg.y).toBe(bubble.y);
  });

  it('sides the two speakers oppositely', () => {
    const project = chat.compose(inputFor(chat));
    const theirs = project.overlays.find((o) => o.id === 'bubble-0-0')!;
    const mine = project.overlays.find((o) => o.id === 'bubble-1-0')!;
    expect(theirs.x).toBeLessThan(0.5);
    expect(mine.x).toBeGreaterThan(0.5);
  });

  it('writes no caption, because the bubbles are the text', () => {
    const project = chat.compose(inputFor(chat));
    expect(project.overlays.some((o) => o.id.startsWith('caption-'))).toBe(false);
  });

  it('refuses a quoted message', () => {
    const plan = chat.brief.example;
    const quoted: ScenePlan = {
      ...plan,
      scenes: plan.scenes.map((s, i) => (i === 1 ? { ...s, narration: `"${s.narration}"` } : s)),
    };
    expect(() => chat.validate(quoted)).toThrow(/scenes\[1\]\.narration/);
  });

  it('allows a repeated visual, unlike every other format', () => {
    // They are dimmed walls behind a thread. A conversation that stays in one
    // room is a conversation, not a bug.
    const plan = chat.brief.example;
    const same: ScenePlan = { ...plan, scenes: plan.scenes.map((s) => ({ ...s, visual: 'a kitchen' })) };
    expect(() => chat.validate(same)).not.toThrow();
    expect(() => story.validate({ ...story.brief.example, scenes: story.brief.example.scenes.map((s) => ({ ...s, visual: 'a kitchen' })) })).toThrow();
  });
});

describe.each(FORMATS.map((f) => [f.id, f] as const))('%s — the brand', (_id, f) => {
  const BRAND = {
    ink: '#f5f0e8',
    accent: '#e2574c',
    fontFamily: 'Bricolage Grotesque',
    logo: { src: 'logo.png' },
  } as const;

  it('treats an explicit undefined brand exactly as an absent one', () => {
    expect(f.compose(inputFor(f, { brand: undefined }))).toEqual(f.compose(inputFor(f)));
  });

  it('keeps the exact look it shipped with when there is no brand', () => {
    /*
     * The guarantee that makes this safe to add, and it has to name the
     * VALUES. Comparing `brand: undefined` against an absent brand — which is
     * what this test used to do — only proves those two paths agree; both go
     * through the same defaults, so a changed default passes it. A mutation
     * run proved exactly that. Every generation ever run passes no brand at
     * all, so a default that drifts silently re-styles the back catalogue.
     */
    const texts = textOverlaysOf(f.compose(inputFor(f)).overlays);
    for (const o of texts) {
      // The accent is a legitimate ink for a numeral; nothing else may drift.
      expect(['#ffffff', '#ffd400'], `${o.id} is no longer a shipped colour`).toContain(o.color);
      expect(o.fontFamily, `${o.id} gained a face nobody asked for`).toBeUndefined();
    }
    // The shipped accent, wherever a format puts its emphasis.
    expect(JSON.stringify(f.compose(inputFor(f)).overlays)).toContain('#ffd400');
  });

  it('puts the brand ink and typeface on every piece of text it draws', () => {
    const texts = textOverlaysOf(f.compose(inputFor(f, { brand: BRAND })).overlays);
    expect(texts.length).toBeGreaterThan(0);
    for (const o of texts) {
      expect(o.fontFamily, `${o.id} has no brand face`).toBe(BRAND.fontFamily);
      // The accent is allowed on a numeral; nothing may be left on the old
      // hardcoded white.
      expect([BRAND.ink, BRAND.accent]).toContain(o.color);
    }
  });

  it('uses the brand accent for emphasis rather than a literal', () => {
    // Every format emphasises SOMETHING — a lit word, a numeral, your own
    // bubble. Whichever it is, the colour has to come from the brand, and the
    // shipped default must be gone.
    const project = f.compose(inputFor(f, { brand: BRAND }));
    const json = JSON.stringify(project.overlays);
    expect(json).toContain(BRAND.accent);
    expect(json).not.toContain('#ffd400');
  });

  it('draws the logo over everything, for the whole video', () => {
    const project = f.compose(inputFor(f, { brand: BRAND }));
    const logo = project.overlays.find((o) => o.id === 'brand-logo')!;
    expect(logo.type).toBe('image');
    expect(logo.start).toBe(0);
    expect(logo.end).toBe(f.brief.example.scenes.length * 4);
    // Above every caption and bubble: a watermark under the content is not one.
    const highest = Math.max(...project.overlays.filter((o) => o.id !== 'brand-logo').map((o) => o.layer ?? 0));
    expect(logo.layer!).toBeGreaterThan(highest);
  });

  it('keeps the logo clear of the frame edge and out of the bottom corners', () => {
    // The bottom sixth is where every platform puts its own UI.
    const logo = f
      .compose(inputFor(f, { brand: BRAND }))
      .overlays.find((o) => o.id === 'brand-logo')! as { x: number; y: number };
    expect(logo.y).toBeLessThan(0.3);
    expect(logo.x).toBeGreaterThan(0.5);
  });

  it('draws no logo when the brand has no mark', () => {
    const project = f.compose(inputFor(f, { brand: { accent: '#123456' } }));
    expect(project.overlays.some((o) => o.id === 'brand-logo')).toBe(false);
  });
});

