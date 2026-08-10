import {
  ScenePlanError,
  composeStory,
  countWords,
  requireBounds,
  type ComposeInput,
  type Format,
  type FormatBrief,
  type ScenePlan,
} from '@layera-labs/orbit-pipeline';
import type { VideoProject } from '@layera-labs/orbit-video/browser';

/**
 * The story: one idea, told from a hook to a resolution.
 *
 * The default archetype, and the one most short-form video actually is — a
 * surprising claim, the mechanism behind it, and a close that pays the claim
 * off. It is deliberately NOT a listicle: no numbering, no "here are five
 * things", because the shape that keeps someone watching is wanting to know how
 * it ends, and a list tells you at the top how much is left.
 */

const scenes = { min: 4, max: 7 };

/*
 * Words, not seconds. At ordinary TTS pace (~2.5 words a second) 10–22 words is
 * roughly 4–9 seconds a scene, so the format lands somewhere near 20–60 seconds
 * without anything ever asserting a duration. The floor matters as much as the
 * ceiling: a four-word scene is a caption, not a beat, and a run of them makes
 * the cutting feel nervous.
 */
const narrationWords = { min: 10, max: 22 };

/*
 * On-screen text is the phrase you would remember, not the sentence you heard.
 * Reproducing the full narration is the commonest failure — at the pace speech
 * runs, a caption of the same length is unreadable, and the eye stops trying.
 */
const onScreenWords = { min: 2, max: 7 };

/**
 * The worked example.
 *
 * Held to this format's own rules by its own tests. An example that breaks them
 * is worse than no example at all: a model shown one thing and told another
 * follows the thing it was shown.
 */
const example: ScenePlan = {
  topic: 'Why the Eiffel Tower is taller in summer',
  format: 'story',
  aspect: '9:16',
  scenes: [
    {
      narration: 'The Eiffel Tower is taller in summer than it is in winter.',
      onScreen: 'Taller in summer',
      visual: 'the Eiffel Tower against a clear blue sky',
    },
    {
      narration: 'Iron expands when it heats up, and Paris gets genuinely hot.',
      onScreen: 'Iron expands with heat',
      visual: 'heat shimmering over a hot metal surface',
    },
    {
      narration: 'On a warm day the tower stretches upward by about fifteen centimetres.',
      onScreen: 'About 15 centimetres',
      visual: 'close-up of riveted iron girders',
    },
    {
      narration: 'It leans away from the sun as well, because one side warms first.',
      onScreen: 'And it leans',
      visual: 'the Eiffel Tower in low afternoon sunlight',
    },
    {
      narration: 'So the tower somebody photographs in July is not quite the January one.',
      onScreen: 'A different tower',
      visual: 'the Eiffel Tower in winter fog',
    },
  ],
};

const instructions = `
Tell ONE idea, from a hook to a resolution. Not a list.

The first scene has a single job: make someone want the second one. A claim
that sounds wrong until it is explained, or a question with a real answer
coming. Do not open by announcing the subject.

The middle scenes each move the idea one step. One step each — a scene that
carries two loses both.

The last scene resolves the hook. It is not a call to action: no "follow for
more", no "let me know what you think". Those date the video, and every
platform already has its own buttons for it.

Every scene's "visual" is a stock-footage search query, so it has to name
something a camera could have photographed. "a glass of water on a windowsill"
finds a shot; "the concept of clarity" finds nothing, and the scene ends up
with whatever the search fell back to.
`;

export const storyBrief: FormatBrief = {
  instructions,
  scenes,
  narrationWords,
  onScreenWords,
  example,
};

/**
 * The rules beyond the schema.
 *
 * Every message names its scene and the actual number, because the message IS
 * the retry prompt — this is what the planner gets handed to fix, and "invalid
 * plan" leaves it nothing to do but try the same thing again.
 */
function validate(plan: ScenePlan): void {
  if (plan.format !== 'story')
    throw new ScenePlanError(`must be "story" to be validated as one, got "${plan.format}"`, 'format');

  requireBounds(plan.scenes.length, scenes, 'scenes', 'scenes');

  plan.scenes.forEach((scene, i) => {
    requireBounds(
      countWords(scene.narration),
      narrationWords,
      `scenes[${i}].narration`,
      'words',
    );
    if (scene.onScreen !== undefined)
      requireBounds(
        countWords(scene.onScreen),
        onScreenWords,
        `scenes[${i}].onScreen`,
        'words',
      );
  });

  /*
   * Repeated visuals are rejected, not tolerated. A planner asked for five
   * search queries about one subject will happily give the same one twice, and
   * the result is two scenes showing the identical picture — which does not
   * read as a stylistic choice, it reads as a bug in the renderer. Compared
   * case- and whitespace-insensitively, since that is a repeat too.
   */
  const seen = new Map<string, number>();
  plan.scenes.forEach((scene, i) => {
    const key = scene.visual.toLowerCase().replace(/\s+/g, ' ').trim();
    const first = seen.get(key);
    if (first !== undefined)
      throw new ScenePlanError(
        `repeats the visual from scenes[${first}] — every scene needs a different picture`,
        `scenes[${i}].visual`,
      );
    seen.set(key, i);
  });
}

export const story: Format = {
  // Moving footage where it exists: a story is carried by its pictures, and a
  // run of stills is the thing that makes a generated video look generated.
  needs: { visualKind: 'video' },
  id: 'story',
  title: 'Story',
  description: 'One idea, from a hook to a resolution.',
  brief: storyBrief,
  validate,
  compose: (input: ComposeInput): VideoProject => composeStory(input),
};
