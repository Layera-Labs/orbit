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
import { createProject, type VideoProject, type VisualTrackClip } from '@orbit/video/browser';

/**
 * Split screen: the subject on top, something to look at underneath.
 *
 * The format built for the way short video is actually watched — with attention
 * that leaves the moment nothing is moving. The lower half runs one continuous
 * clip for the whole video (`ComposeInput.filler`), so there is always motion
 * even while the top half holds a still.
 *
 * **It is a 9:16-only format and says so.** Two stacked halves of a landscape
 * frame are two letterboxes; the whole point is a tall frame divided across its
 * long axis. Validating that here rather than letting it compose into something
 * nobody would ship is the difference between a format and a suggestion.
 */

const scenes = { min: 3, max: 6 };

/*
 * Deliberately the tightest of the four. Half the frame is doing a job the
 * narration is not, and a long beat over a static top half is exactly the dead
 * air this format exists to avoid.
 */
const narrationWords = { min: 8, max: 16 };
const onScreenWords = { min: 2, max: 6 };

const example: ScenePlan = {
  topic: 'Why aeroplane windows have a tiny hole in them',
  format: 'split',
  aspect: '9:16',
  scenes: [
    {
      narration: 'Every aeroplane window has a tiny hole in it, and it is not a flaw.',
      onScreen: 'That tiny hole',
      visual: 'close-up of an aeroplane window from inside the cabin',
    },
    {
      narration: 'There are three panes, and the hole sits in the middle one.',
      onScreen: 'Three panes',
      visual: 'layered glass panels lit from behind',
    },
    {
      narration: 'It lets the outer pane carry the whole pressure difference by itself.',
      onScreen: 'The outer pane holds it',
      visual: 'an aeroplane cruising above clouds',
    },
    {
      narration: 'So if one ever fails, it is the one you are not leaning against.',
      onScreen: 'By design',
      visual: 'a passenger looking out of a plane window',
    },
  ],
};

const instructions = `
One idea, told in short beats, for a frame split across the middle. The top half
shows your scene; the bottom half runs unrelated footage the whole time, so the
narration has to carry the meaning on its own.

Keep every beat short and self-contained. A viewer glancing between two halves
will not follow a sentence that depends on the one before it.

The first scene states the surprising thing outright — there is no room here for
a slow build.

Every scene needs an "onScreen": with half the frame given to something else,
the words on screen are what a muted viewer gets.

Every scene's "visual" is a stock-footage search query, so it has to name
something a camera could have photographed.
`;

export const splitBrief: FormatBrief = {
  instructions,
  scenes,
  narrationWords,
  onScreenWords,
  example,
};

function validate(plan: ScenePlan): void {
  if (plan.format !== 'split')
    throw new ScenePlanError(`must be "split" to be validated as one, got "${plan.format}"`, 'format');

  /*
   * The one structural rule. A 16:9 frame cut in half is two letterboxes and a
   * 1:1 one is two near-squares; neither is the format. Refused at validation
   * so the planner is told, rather than at compose time where the caller has
   * already paid for the voice.
   */
  if (plan.aspect !== '9:16')
    throw new ScenePlanError(
      `only works in a tall frame — needs "9:16", got "${plan.aspect}"`,
      'aspect',
    );

  requireBounds(plan.scenes.length, scenes, 'scenes', 'scenes');

  plan.scenes.forEach((scene, i) => {
    requireBounds(countWords(scene.narration), narrationWords, `scenes[${i}].narration`, 'words');
    if (!scene.onScreen?.trim())
      throw new ScenePlanError(
        'every scene needs an "onScreen" — half the frame is showing something else',
        `scenes[${i}].onScreen`,
      );
    requireBounds(countWords(scene.onScreen), onScreenWords, `scenes[${i}].onScreen`, 'words');
  });

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

/**
 * Where the cut falls, as a fraction of the height.
 *
 * Above the middle, not on it. The top half is the one carrying meaning, and an
 * even split gives equal weight to footage chosen for motion rather than
 * content. It also puts the seam out of the exact centre, which reads as a
 * decision rather than as a default.
 */
export const SPLIT_AT = 0.55;

export function composeSplit(input: ComposeInput): VideoProject {
  const { plan, spoken, visuals } = input;
  assertSceneArrays(input);

  const { width, height } = frameSize(plan.aspect);
  const fps = input.fps ?? 30;
  const { startAt, total } = sceneClock(spoken);

  const top: VisualTrackClip[] = plan.scenes.map((_, i) => ({
    id: `scene-${i}`,
    type: visuals[i].type,
    src: visuals[i].src,
    start: startAt[i],
    duration: spoken[i].durationSec,
    rect: { x: 0, y: 0, w: 1, h: SPLIT_AT },
    motion: { type: i % 2 === 0 ? 'zoomIn' : 'zoomOut', intensity: 0.25 },
  }));

  /*
   * The filler runs the WHOLE video as one clip, and is muted.
   *
   * One clip rather than one per scene because that is what it is — a
   * continuous loop, not a per-beat decision — and because cutting it at every
   * scene boundary would make it read as content, which is the one thing it
   * must not do. Muted because the narration is the point and this footage
   * arrived with whatever audio it happened to have.
   *
   * It is a SECOND visual track, below the top half in array order, so the two
   * never fight over the same rect. A format that placed both on one track
   * would be relying on clip order within a track, which is z-order, to do a
   * job `rect` already does exactly.
   */
  const bottom: VisualTrackClip[] = input.filler
    ? [
        {
          id: 'filler',
          type: 'video',
          src: input.filler,
          start: 0,
          duration: total,
          rect: { x: 0, y: SPLIT_AT, w: 1, h: 1 - SPLIT_AT },
          muted: true,
        },
      ]
    : [];

  /*
   * Captions sit just BELOW the seam, over the filler.
   *
   * Over the filler rather than over the scene because the scene is the picture
   * somebody is meant to look at, and because the filler is deliberately
   * low-information — covering part of it costs nothing. The seam is at 0.55,
   * so 0.66 is comfortably clear of it and still well above the platform UI in
   * the bottom sixth.
   */
  const overlays = captionOverlays(plan, spoken, startAt, {
    fontSize: Math.round(height * 0.04),
    width,
    y: 0.66,
    widthFraction: 0.9,
    highlight: { color: '#ffd400' },
  });

  return createProject({
    width,
    height,
    fps,
    background: { type: 'color', color: '#000000' },
    tracks: [
      ...(bottom.length ? [{ id: 'filler', kind: 'visual' as const, clips: bottom }] : []),
      { id: 'visual', kind: 'visual', clips: top },
      { id: 'voice', kind: 'audio', clips: narrationClips(spoken, startAt) },
      ...musicTracks(input, total),
    ],
    overlays,
  });
}

export const split: Format = {
  /*
   * The top half is footage and the bottom half is the loop the format exists
   * for. The query is deliberately generic and calm — it is under a caption and
   * beside the real subject, so anything with a story of its own competes with
   * the thing somebody is meant to be watching.
   */
  needs: { visualKind: 'video', filler: 'satisfying looping abstract motion background' },
  id: 'split',
  title: 'Split screen',
  description: 'The subject on top, something moving underneath.',
  brief: splitBrief,
  validate,
  compose: composeSplit,
};
