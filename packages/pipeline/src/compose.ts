/**
 * ScenePlan + what the voice actually did → a renderable `VideoProject`.
 *
 * The handoff. Everything before this is decisions and provider calls; from
 * here on it is `@orbit/video`'s problem, and the SAME project the editor opens
 * and the SAME call the export path already makes. That is the property worth
 * protecting: an automatic video and a hand-made one are the same document, so
 * "edit it afterwards" costs nothing to support and cannot drift.
 *
 * `@orbit/formats` will own one of these per archetype. This is the story
 * format, written out here for the spike so the seam is real before the package
 * that holds a library of them exists.
 */
import { createProject, type CaptionLine, type TextOverlay, type VideoProject, type VisualTrackClip, type AudioTrackClip } from '@orbit/video/browser';
import { captionTextOf, frameSize, type ScenePlan } from './scene-plan.ts';

/** What one scene turned into once the voice had said it. */
export interface SpokenScene {
  /** The narration audio. A path or an `upload:` token — a clip `src`. */
  audioSrc: string;
  /** MEASURED, never estimated. See the note in `scene-plan.ts`. */
  durationSec: number;
  /**
   * The narration transcribed back, grouped into caption lines with per-word
   * timings, relative to THIS scene's audio.
   *
   * Optional because a run may skip alignment — a plain scene-level caption
   * still works, it just cannot animate per word.
   */
  lines?: CaptionLine[];
}

/** The picture for a scene, already normalized to the output aspect. */
export interface SceneVisual {
  /** Image or video source. */
  src: string;
  type: 'image' | 'video';
}

export interface ComposeInput {
  plan: ScenePlan;
  /** One per scene, in order. Length must match `plan.scenes`. */
  spoken: SpokenScene[];
  /** One per scene, in order. */
  visuals: SceneVisual[];
  fps?: number;
  /** Music under the whole thing. */
  music?: string;
  musicVolume?: number;
}

/**
 * The caption's vertical position, as a fraction of the frame.
 *
 * Low, but clear of the bottom sixth: every platform puts its own UI there —
 * the caption sits under a username and a row of buttons otherwise, which is
 * invisible in the editor and obvious the moment it is posted.
 */
const CAPTION_Y = 0.78;

export function composeStory(input: ComposeInput): VideoProject {
  const { plan, spoken, visuals } = input;
  if (spoken.length !== plan.scenes.length)
    throw new Error(`expected ${plan.scenes.length} spoken scenes, got ${spoken.length}`);
  if (visuals.length !== plan.scenes.length)
    throw new Error(`expected ${plan.scenes.length} visuals, got ${visuals.length}`);

  const { width, height } = frameSize(plan.aspect);
  const fps = input.fps ?? 30;

  /*
   * Scene starts come from the MEASURED durations, accumulated. Not from a
   * per-scene number in the plan, and not from a nominal length — this is the
   * one place the "voice decides the length" rule becomes arithmetic, and
   * every start after the first depends on every measurement before it.
   */
  const startAt: number[] = [];
  let clock = 0;
  for (const s of spoken) {
    startAt.push(clock);
    clock += s.durationSec;
  }
  const total = clock;

  const visualClips: VisualTrackClip[] = plan.scenes.map((_, i) => ({
    id: `scene-${i}`,
    type: visuals[i].type,
    src: visuals[i].src,
    start: startAt[i],
    duration: spoken[i].durationSec,
    // A still held for eight seconds is the thing that makes an automatic video
    // look automatic. A slow push keeps it alive and costs nothing to render.
    motion: { type: i % 2 === 0 ? 'zoomIn' : 'zoomOut', intensity: 0.35 },
  }));

  const narration: AudioTrackClip[] = plan.scenes.map((_, i) => ({
    id: `vo-${i}`,
    src: spoken[i].audioSrc,
    start: startAt[i],
    duration: spoken[i].durationSec,
  }));

  /*
   * Captions. Where the words came from decides what we can draw:
   *
   *  - with `lines`, one overlay per transcribed line, its per-word timings
   *    shifted onto the timeline by `setAutoCaptions`' own rule (absolute
   *    seconds), so a word-level effect has what it needs later;
   *  - without, one overlay for the whole scene, which reads fine and simply
   *    cannot animate per word.
   */
  const overlays: TextOverlay[] = [];
  const fontSize = Math.round(height * 0.045);
  plan.scenes.forEach((scene, i) => {
    const base = startAt[i];
    const lines = spoken[i].lines;
    if (lines?.length) {
      lines.forEach((line, j) => {
        overlays.push(caption(`caption-${i}-${j}`, line.text, base + line.start, base + line.end, {
          fontSize,
          width,
          words: line.words?.map((w: { text: string; start: number; end: number }) => ({
            text: w.text,
            start: base + w.start,
            end: base + w.end,
          })),
        }));
      });
    } else {
      overlays.push(
        caption(`caption-${i}`, captionTextOf(scene), base, base + spoken[i].durationSec, {
          fontSize,
          width,
        }),
      );
    }
  });

  return createProject({
    width,
    height,
    fps,
    background: { type: 'color', color: '#000000' },
    tracks: [
      { id: 'visual', kind: 'visual', clips: visualClips },
      { id: 'voice', kind: 'audio', clips: narration },
      ...(input.music
        ? [
            {
              id: 'music',
              kind: 'audio' as const,
              clips: [
                {
                  id: 'bed',
                  src: input.music,
                  start: 0,
                  duration: total,
                  // Under the voice, and faded so it does not start or stop
                  // abruptly against narration that already has.
                  volume: input.musicVolume ?? 0.18,
                  volumeCurve: { fadeIn: 0.8, fadeOut: 1.2 },
                } as AudioTrackClip,
              ],
            },
          ]
        : []),
    ],
    overlays,
  });
}

function caption(
  id: string,
  text: string,
  start: number,
  end: number,
  o: { fontSize: number; width: number; words?: { text: string; start: number; end: number }[] },
): TextOverlay {
  return {
    id,
    type: 'text',
    text,
    start,
    end,
    x: 0.5,
    y: CAPTION_Y,
    fontSize: o.fontSize,
    color: '#ffffff',
    align: 'center',
    bold: true,
    /*
     * Wrapping is OPT-IN in the engine: absent `maxWidth`, only an explicit
     * newline breaks a line. A generated caption has no newlines and no upper
     * bound on length, so leaving this off is how a hook renders off both
     * edges. Every format must set it — this is that rule, honoured.
     */
    maxWidth: Math.round(o.width * 0.86),
    // Over footage of unknown brightness, a caption carries its own legibility.
    stroke: { color: '#000000', width: Math.max(2, Math.round(o.fontSize * 0.09)) },
    ...(o.words?.length ? { words: o.words } : {}),
  };
}
