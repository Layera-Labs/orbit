import {
  ScenePlanError,
  assertSceneArrays,
  captionOverlays,
  countWords,
  frameSize,
  musicTracks,
  narrationClips,
  requireBounds,
  sceneClock,
  type ComposeInput,
  type Format,
  type FormatBrief,
  type ScenePlan,
} from '@orbit/pipeline';
import { createProject, type Overlay, type VideoProject, type VisualTrackClip } from '@orbit/video/browser';

/**
 * The countdown: N things, numbered, counted down to the best one.
 *
 * The exact opposite bet from `story`, and the reason both exist. A story keeps
 * you watching by withholding how it ends; a countdown tells you at the top
 * that there are five and then makes you wait for number one. Both work. What
 * does not work is a list pretending to be a story — an unnumbered sequence of
 * unrelated tips has neither the pull of the first nor the promise of the
 * second.
 *
 * **Counting DOWN, not up.** Numbering 1..N puts the best item first and gives
 * every later scene a reason to leave. N..1 is the whole mechanism.
 */

const scenes = { min: 3, max: 7 };

/*
 * Shorter than a story's beats. A listicle's pull is the count, not the depth
 * of any one item, and a long item makes the viewer feel the remaining ones as
 * a cost rather than a promise.
 */
const narrationWords = { min: 8, max: 18 };

/*
 * The item's NAME, not a sentence about it. It sits beside a large numeral and
 * has to read in the time it takes to say the first few words of the narration.
 */
const onScreenWords = { min: 1, max: 5 };

const example: ScenePlan = {
  topic: 'Kitchen tools that are actually worth the money',
  format: 'listicle',
  aspect: '9:16',
  scenes: [
    {
      narration: 'Five kitchen tools that earn their drawer space, counting down.',
      onScreen: 'Worth the money',
      visual: 'a tidy kitchen drawer full of utensils',
    },
    {
      narration: 'A bench scraper moves chopped food without bruising it or dulling your knife.',
      onScreen: 'Bench scraper',
      visual: 'a metal bench scraper lifting chopped onion',
    },
    {
      narration: 'A digital thermometer is the difference between guessing and knowing.',
      onScreen: 'Thermometer',
      visual: 'a probe thermometer in a roast chicken',
    },
    {
      narration: 'A heavy cast iron pan holds heat so a steak sears instead of steaming.',
      onScreen: 'Cast iron pan',
      visual: 'a steak searing in a cast iron skillet',
    },
    {
      narration: 'And a sharp knife, because every other tool here assumes you own one.',
      onScreen: 'A sharp knife',
      visual: 'a chef sharpening a kitchen knife on a whetstone',
    },
  ],
};

const instructions = `
Count DOWN a numbered list. The first scene is the title card: say how many
there are and what they are, and give it an "onScreen" that reads as a title.
Every scene after it is one numbered item, counted down, best last.

Each item scene names ONE thing and says why it earns its place. Its "onScreen"
is the item's NAME — two or three words — because it is drawn beside a large
number, not read as a sentence.

Do not number the items in the text yourself. The format draws the numerals; a
narration that also says "number four" says it twice.

The last item is the best one. If the order does not matter, this is the wrong
format.

Every scene's "visual" is a stock-footage search query, so it has to name
something a camera could have photographed.
`;

export const listicleBrief: FormatBrief = {
  instructions,
  scenes,
  narrationWords,
  onScreenWords,
  example,
};

function validate(plan: ScenePlan): void {
  if (plan.format !== 'listicle')
    throw new ScenePlanError(
      `must be "listicle" to be validated as one, got "${plan.format}"`,
      'format',
    );

  requireBounds(plan.scenes.length, scenes, 'scenes', 'scenes');

  plan.scenes.forEach((scene, i) => {
    requireBounds(countWords(scene.narration), narrationWords, `scenes[${i}].narration`, 'words');
    if (scene.onScreen !== undefined)
      requireBounds(countWords(scene.onScreen), onScreenWords, `scenes[${i}].onScreen`, 'words');
  });

  /*
   * Every item needs a name, because the format DRAWS it beside the numeral.
   * `onScreen` is optional on the schema and optional for a story, where a
   * scene without one simply captions its narration. Here its absence leaves a
   * number floating next to nothing, so it is required from the second scene
   * on — and the message says which scene, because the message is the retry.
   */
  plan.scenes.forEach((scene, i) => {
    if (i > 0 && !scene.onScreen?.trim())
      throw new ScenePlanError(
        'every item needs an "onScreen" name — it is drawn beside the number',
        `scenes[${i}].onScreen`,
      );
  });

  // Same rule as `story`, same reason: two scenes showing one picture reads as
  // a broken renderer, not as a choice.
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

/** Item numbers count DOWN from the item count, so the last scene is number one. */
export function itemNumbers(sceneCount: number): (number | null)[] {
  const items = sceneCount - 1; // scene 0 is the title card
  return Array.from({ length: sceneCount }, (_, i) => (i === 0 ? null : items - i + 1));
}

const CAPTION_Y = 0.8;

export function composeListicle(input: ComposeInput): VideoProject {
  const { plan, spoken, visuals } = input;
  assertSceneArrays(input);

  const { width, height } = frameSize(plan.aspect);
  const fps = input.fps ?? 30;
  const { startAt, total } = sceneClock(spoken);
  const numbers = itemNumbers(plan.scenes.length);

  const visualClips: VisualTrackClip[] = plan.scenes.map((_, i) => ({
    id: `scene-${i}`,
    type: visuals[i].type,
    src: visuals[i].src,
    start: startAt[i],
    duration: spoken[i].durationSec,
    motion: { type: i % 2 === 0 ? 'zoomIn' : 'zoomOut', intensity: 0.3 },
  }));

  /*
   * The numeral and its plate, per item.
   *
   * Layered UNDER the captions (`layer: 1` against the captions' 2) so a long
   * caption that wraps upward passes over the badge rather than being covered
   * by it. Layer order is one number and it is the only thing deciding this;
   * getting it wrong hides the words, which is worse than hiding the number.
   */
  const numeral = Math.round(height * 0.075);
  const badgeH = numeral * 1.5;
  const overlays: Overlay[] = [];
  plan.scenes.forEach((scene, i) => {
    const n = numbers[i];
    if (n == null) return;
    const start = startAt[i];
    const end = start + spoken[i].durationSec;
    const label = scene.onScreen!.trim();

    overlays.push({
      id: `badge-${i}`,
      type: 'shape',
      shape: 'rect',
      start,
      end,
      layer: 1,
      x: 0.5,
      y: 0.2,
      width: 0.62,
      height: badgeH / height,
      fill: '#000000',
      fillOpacity: 0.55,
      cornerRadius: Math.round(badgeH * 0.28),
      animateIn: { type: 'slide', duration: 0.35, edge: 'left' },
    });
    overlays.push({
      id: `num-${i}`,
      type: 'text',
      text: `${n}`,
      start,
      end,
      layer: 1,
      x: 0.24,
      y: 0.2,
      fontSize: numeral,
      color: '#ffd400',
      bold: true,
      align: 'center',
      maxWidth: Math.round(width * 0.2),
      animateIn: { type: 'slide', duration: 0.35, edge: 'left' },
    });
    overlays.push({
      id: `item-${i}`,
      type: 'text',
      text: label,
      start,
      end,
      layer: 1,
      x: 0.56,
      y: 0.2,
      fontSize: Math.round(numeral * 0.5),
      color: '#ffffff',
      bold: true,
      align: 'center',
      maxWidth: Math.round(width * 0.42),
      animateIn: { type: 'slide', duration: 0.35, edge: 'left' },
    });
  });

  overlays.push(
    ...captionOverlays(plan, spoken, startAt, {
      fontSize: Math.round(height * 0.042),
      width,
      y: CAPTION_Y,
      layer: 2,
      highlight: { color: '#ffd400' },
    }),
  );

  return createProject({
    width,
    height,
    fps,
    background: { type: 'color', color: '#000000' },
    tracks: [
      { id: 'visual', kind: 'visual', clips: visualClips },
      { id: 'voice', kind: 'audio', clips: narrationClips(spoken, startAt) },
      ...musicTracks(input, total),
    ],
    overlays,
  });
}

export const listicle: Format = {
  needs: { visualKind: 'video' },
  id: 'listicle',
  title: 'Countdown',
  description: 'A numbered list, counted down to the best one.',
  brief: listicleBrief,
  validate,
  compose: composeListicle,
};
