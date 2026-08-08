import {
  ScenePlanError,
  brandOf,
  logoOverlays,
  assertSceneArrays,
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
 * The message thread: a conversation, arriving one bubble at a time.
 *
 * The only one of the four with no captions. The bubbles ARE the text, they
 * accumulate rather than replace, and a caption underneath would be the same
 * words twice. That is also what makes it the format that needed the shape
 * renderer: every bubble is a rounded plate with a line of text on it.
 *
 * **Scenes alternate speakers, starting with the other person.** A thread that
 * opens with your own message has nobody to be replying to.
 */

const scenes = { min: 4, max: 8 };

/*
 * A message, not a paragraph. This is the tightest bound in the library and it
 * is the whole texture of the format — real messages are short, and a bubble
 * carrying twenty words stops looking like one.
 */
const narrationWords = { min: 3, max: 14 };

/** Unused: the bubble draws the narration itself. Kept in range for the schema. */
const onScreenWords = { min: 1, max: 14 };

const example: ScenePlan = {
  topic: 'A landlord who did not expect the tenant to read the lease',
  format: 'chat',
  aspect: '9:16',
  scenes: [
    {
      narration: 'Just a heads up, rent is going up by four hundred next month.',
      visual: 'a plain apartment kitchen in the evening',
    },
    { narration: 'That is a lot. Is that allowed mid-lease?', visual: 'a person reading on a sofa' },
    { narration: 'It is standard. Everyone in the building is getting the same.', visual: 'an apartment block stairwell' },
    { narration: 'My lease says rent is fixed for twelve months. Clause nine.', visual: 'close-up of a printed contract' },
    { narration: 'Let me check with the office and get back to you.', visual: 'an empty office desk at night' },
    { narration: 'No rush. I have got until March.', visual: 'a calendar on a kitchen wall' },
  ],
};

const instructions = `
Write a text-message conversation between two people, one message per scene,
alternating. Scene 1 is the OTHER person; scene 2 is you; and so on.

Every "narration" is the message itself, exactly as it would be typed. Short.
No quotation marks, no "he said", no narrator. What you write is what appears
in the bubble and what is read aloud.

The conversation needs a turn: something the second person knows, or has, that
changes it. Put it about two thirds of the way through, and let the last
message be the quiet one after it rather than a summary.

Do not use "onScreen" — the bubbles are the text.

Every scene's "visual" is a stock-footage search query for the BACKGROUND
behind the thread, so it should be calm and nearly empty. It is dimmed and sits
under the bubbles; a busy shot makes them unreadable.
`;

export const chatBrief: FormatBrief = {
  instructions,
  scenes,
  narrationWords,
  onScreenWords,
  example,
};

function validate(plan: ScenePlan): void {
  if (plan.format !== 'chat')
    throw new ScenePlanError(`must be "chat" to be validated as one, got "${plan.format}"`, 'format');

  requireBounds(plan.scenes.length, scenes, 'scenes', 'scenes');

  plan.scenes.forEach((scene, i) => {
    requireBounds(countWords(scene.narration), narrationWords, `scenes[${i}].narration`, 'words');
    /*
     * A bubble carrying a quoted line reads as a message about a message. The
     * planner reaches for this constantly when asked to write dialogue, so it
     * is refused with a message that says what to do instead.
     */
    if (/^["'“‘]/.test(scene.narration.trim()))
      throw new ScenePlanError(
        'is the message itself, so it takes no quotation marks',
        `scenes[${i}].narration`,
      );
  });

  /*
   * Visuals are NOT required to be unique here, unlike every other format.
   *
   * They are dimmed backgrounds behind an accumulating thread, and a
   * conversation that stays in one room is a conversation, not a bug. The rule
   * that a repeat "looks like a broken renderer" is true when the picture is
   * the content and false when it is the wall behind it.
   */
}

/** Whose message a scene is. Even scenes are the other person; the thread opens with them. */
export const isOwn = (i: number): boolean => i % 2 === 1;

/** How many bubbles are on screen at once before the thread scrolls. */
export const VISIBLE_BUBBLES = 5;

export function composeChat(input: ComposeInput): VideoProject {
  const { plan, spoken, visuals } = input;
  assertSceneArrays(input);

  const { width, height } = frameSize(plan.aspect);
  const fps = input.fps ?? 30;
  const { startAt, total } = sceneClock(spoken);
  const brand = brandOf(input.brand);

  // Dimmed, and held still. The background is not the subject and a Ken-Burns
  // move under a block of text is what makes the text hard to read.
  const visualClips: VisualTrackClip[] = plan.scenes.map((_, i) => ({
    id: `scene-${i}`,
    type: visuals[i].type,
    src: visuals[i].src,
    start: startAt[i],
    duration: spoken[i].durationSec,
    // Desaturated and dimmed: a background, not a subject.
    filter: { preset: 'mono' },
    opacity: 0.45,
  }));

  const fontSize = Math.round(height * 0.032);
  const lineH = fontSize * 1.35;
  const padY = Math.round(fontSize * 0.55);

  /*
   * Bubbles ACCUMULATE: each is drawn from the moment its message arrives until
   * the end of the video, so the thread builds rather than replaces. That is
   * the one thing that makes it read as a conversation.
   *
   * The stack is anchored to the BOTTOM and grows upward, like a real thread,
   * so the newest message is always in the same place. `VISIBLE_BUBBLES` caps
   * how far back it draws — beyond that the oldest are dropped rather than
   * running off the top of the frame, which is the same "clear the cut" rule a
   * layout follows anywhere else.
   */
  const overlays: Overlay[] = [];
  plan.scenes.forEach((_, i) => {
    const appears = startAt[i];
    // Dropped once it is `VISIBLE_BUBBLES` messages old, or at the end.
    const retires = i + VISIBLE_BUBBLES < plan.scenes.length ? startAt[i + VISIBLE_BUBBLES] : total;
    if (retires <= appears) return;

    const own = isOwn(i);
    const text = plan.scenes[i].narration.trim();

    /*
     * The bubble's height is estimated from the character count rather than
     * measured, because measuring needs the font and this package has none.
     * It errs GENEROUS: a plate slightly too tall reads as padding, whereas one
     * too short crops the words — the asymmetry decides the rounding.
     */
    const perLine = 26;
    const rows = Math.max(1, Math.ceil(text.length / perLine));
    const bubbleH = rows * lineH + padY * 2;

    /*
     * Position within the stack, counted from the newest.
     *
     * A bubble's slot changes as newer ones arrive, so a single overlay cannot
     * hold a fixed y — it would sit still while the thread moved around it.
     * Each message therefore gets one overlay PER SLOT it occupies, each with
     * its own window. That is more overlays than a naive layout, and it is what
     * makes the thread actually move.
     */
    for (let k = i; k < Math.min(plan.scenes.length, i + VISIBLE_BUBBLES); k++) {
      const from = startAt[k];
      const to = k + 1 < plan.scenes.length ? startAt[k + 1] : total;
      if (to <= from) continue;
      const slot = k - i; // 0 = newest
      const y = 0.86 - (slot * (lineH * 2.1)) / height;
      if (y < 0.1) continue; // off the top: drop it rather than crop it

      const id = `${i}-${slot}`;
      overlays.push({
        id: `bubble-${id}`,
        type: 'shape',
        shape: 'rect',
        start: from,
        end: to,
        layer: 1,
        x: own ? 0.68 : 0.32,
        y,
        width: 0.58,
        height: bubbleH / height,
        // Your own bubbles carry the brand; theirs stay neutral, because a
        // thread where both sides are branded reads as one person talking.
        fill: own ? brand.accent : '#2a2a2e',
        fillOpacity: 0.96,
        cornerRadius: Math.round(bubbleH * 0.32),
        // Only the NEWEST bubble animates in. An older one re-entering every
        // time the stack shifts would make the whole thread twitch on every
        // message. `SlideEdge` is up/down/left/right, so a message rising into
        // place travels `up`.
        ...(slot === 0
          ? { animateIn: { type: 'slide', duration: 0.28, edge: 'up' } as const }
          : {}),
      });
      overlays.push({
        id: `msg-${id}`,
        type: 'text',
        text,
        start: from,
        end: to,
        layer: 2,
        x: own ? 0.68 : 0.32,
        y,
        fontSize,
        color: brand.ink,
        ...(brand.fontFamily ? { fontFamily: brand.fontFamily } : {}),
        align: 'center',
        maxWidth: Math.round(width * 0.52),
        ...(slot === 0
          ? { animateIn: { type: 'slide', duration: 0.28, edge: 'up' } as const }
          : {}),
      });
    }
  });

  overlays.push(...logoOverlays(input.brand, { width, height, total }));

  return createProject({
    width,
    height,
    fps,
    background: { type: 'color', color: '#0b0b0d' },
    tracks: [
      { id: 'visual', kind: 'visual', clips: visualClips },
      { id: 'voice', kind: 'audio', clips: narrationClips(spoken, startAt) },
      ...musicTracks(input, total),
    ],
    overlays,
  });
}

export const chat: Format = {
  // Stills, deliberately. The background is dimmed to 45% and desaturated
  // behind a wall of bubbles; paying to fetch and encode footage nobody can
  // make out is cost with no picture to show for it.
  needs: { visualKind: 'image' },
  id: 'chat',
  title: 'Message thread',
  description: 'A conversation, arriving one bubble at a time.',
  brief: chatBrief,
  validate,
  compose: composeChat,
};
