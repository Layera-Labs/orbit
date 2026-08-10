/**
 * ScenePlan + what the voice actually did → a renderable `VideoProject`.
 *
 * The handoff. Everything before this is decisions and provider calls; from
 * here on it is `@layera-labs/orbit-video`'s problem, and the SAME project the editor opens
 * and the SAME call the export path already makes. That is the property worth
 * protecting: an automatic video and a hand-made one are the same document, so
 * "edit it afterwards" costs nothing to support and cannot drift.
 *
 * `@layera-labs/orbit-formats` will own one of these per archetype. This is the story
 * format, written out here for the spike so the seam is real before the package
 * that holds a library of them exists.
 */
import {
  createProject,
  type AudioTrackClip,
  type ImageOverlay,
  type CaptionLine,
  type TextOverlay,
  type Track,
  type VideoProject,
  type VisualTrackClip,
  type WordHighlight,
} from '@layera-labs/orbit-video/browser';
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
  /**
   * One continuous video shown alongside the scenes, for formats that split
   * the frame.
   *
   * Deliberately shaped like `music`: a single source for the WHOLE video
   * rather than one per scene. That is what the thing actually is — the
   * gameplay or satisfying-loop footage under a split-screen short is one long
   * clip, not a per-beat decision — and it keeps `visuals` at exactly one entry
   * per scene, which every format and the resolver already depend on.
   *
   * Silent by construction: it is never given an audio clip, so it cannot talk
   * over the narration.
   */
  filler?: string;
  /** The customer's ink, accent, typeface and mark. Absent means the defaults. */
  brand?: BrandKit;
}

/**
 * The caption's vertical position, as a fraction of the frame.
 *
 * Low, but clear of the bottom sixth: every platform puts its own UI there —
 * the caption sits under a username and a row of buttons otherwise, which is
 * invisible in the editor and obvious the moment it is posted.
 */
const CAPTION_Y = 0.78;

/**
 * A brand, as the RENDERER needs it.
 *
 * Deliberately not `OrbitTheme`, which is the editor chrome's CSS variables and
 * has nothing to do with what comes out of ffmpeg. Sharing them would tie the
 * look of somebody's video to the look of the tool they made it in, and the two
 * move for entirely different reasons.
 *
 * Four fields, and the restraint is the point. A brand kit that can set every
 * value in every format is a theme engine, and a format stops being a format
 * once its author cannot predict what it will look like. These are the things
 * that are genuinely the customer's: their ink, their one accent, their
 * typeface, their mark.
 */
export interface BrandKit {
  /** Caption ink. Defaults to white, which is what every format shipped with. */
  ink?: string;
  /**
   * The ONE colour used for emphasis — the lit word, the numeral, your own
   * bubbles. One rather than a palette because a format decides WHERE emphasis
   * goes and a brand decides what colour it is; two accents means the format
   * has to choose between them, and it has no basis to.
   */
  accent?: string;
  /**
   * Typeface for every piece of text a format draws.
   *
   * Resolved by the render service through `google-fonts.ts`, the same path a
   * hand-made project's caption font takes — so a family it cannot fetch warns
   * (`font-missing`) and renders in a substitute rather than failing. A
   * self-hosted face has no path here yet and would need one.
   */
  fontFamily?: string;
  /** A watermark, drawn over everything for the whole video. */
  logo?: BrandLogo;
}

export interface BrandLogo {
  /** Image source, resolved like any other clip `src`. */
  src: string;
  /** Default `'top-right'`: the bottom corners are where platform UI lands. */
  corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Width as a fraction of the frame. Default 0.14. */
  scale?: number;
  /** Default 0.85 — present, not shouting. */
  opacity?: number;
}

/** The brand with every default filled in, so a format never writes `??`. */
export function brandOf(brand?: BrandKit): Required<Omit<BrandKit, 'logo'>> & {
  logo?: BrandLogo;
} {
  return {
    ink: brand?.ink ?? '#ffffff',
    accent: brand?.accent ?? '#ffd400',
    // Empty means "say nothing", which is what every format did before a brand
    // existed: the overlay carries no `fontFamily` and the renderer picks.
    fontFamily: brand?.fontFamily ?? '',
    ...(brand?.logo ? { logo: brand.logo } : {}),
  };
}

/**
 * The watermark, as an overlay, or nothing.
 *
 * An `ImageOverlay` rather than a clip on a track: it belongs to the whole
 * video, not to a scene, and the overlay stack is already the layer that
 * composites last. `layer: 9` puts it over every caption and bubble — a
 * watermark under the content is not a watermark.
 */
export function logoOverlays(
  brand: BrandKit | undefined,
  frame: { width: number; height: number; total: number },
): ImageOverlay[] {
  const logo = brand?.logo;
  if (!logo?.src) return [];
  const w = logo.scale ?? 0.14;
  // Square box: the real aspect is unknown here and `imageOverlayAsClip` fits
  // inside the rect, so a wide mark simply uses less of the height.
  const h = (w * frame.width) / frame.height;
  const inset = 0.06;
  const corner = logo.corner ?? 'top-right';
  const right = corner.endsWith('right');
  const bottom = corner.startsWith('bottom');
  return [
    {
      id: 'brand-logo',
      type: 'image',
      src: logo.src,
      start: 0,
      end: frame.total,
      layer: 9,
      x: right ? 1 - inset - w / 2 : inset + w / 2,
      y: bottom ? 1 - inset - h / 2 : inset + h / 2,
      width: w,
      height: h,
      opacity: logo.opacity ?? 0.85,
    },
  ];
}

/**
 * The parts every archetype needs, so four formats cannot each invent them.
 *
 * `composeStory` was the only composition when this file was written, so its
 * arithmetic lived inline. It is now the shared floor: a format decides what
 * the frame LOOKS like, and everything below decides when things happen, which
 * is the same answer for all of them. A listicle that computed its own scene
 * starts would be a second implementation of the one rule this whole pipeline
 * is built on — that the voice decides the length.
 */

/** Scene starts, accumulated from the MEASURED durations. Never from the plan. */
export function sceneClock(spoken: readonly SpokenScene[]): {
  startAt: number[];
  total: number;
} {
  const startAt: number[] = [];
  let clock = 0;
  for (const s of spoken) {
    startAt.push(clock);
    clock += s.durationSec;
  }
  return { startAt, total: clock };
}

/** Both per-scene arrays must line up with the plan, or the video is silently wrong. */
export function assertSceneArrays(input: ComposeInput): void {
  const n = input.plan.scenes.length;
  if (input.spoken.length !== n)
    throw new Error(`expected ${n} spoken scenes, got ${input.spoken.length}`);
  if (input.visuals.length !== n)
    throw new Error(`expected ${n} visuals, got ${input.visuals.length}`);
}

export function narrationClips(
  spoken: readonly SpokenScene[],
  startAt: readonly number[],
): AudioTrackClip[] {
  return spoken.map((s, i) => ({
    id: `vo-${i}`,
    src: s.audioSrc,
    start: startAt[i],
    duration: s.durationSec,
  }));
}

/** The music bed, or nothing. Returned as a list so it spreads into `tracks`. */
export function musicTracks(input: ComposeInput, total: number): Track[] {
  if (!input.music) return [];
  return [
    {
      id: 'music',
      kind: 'audio',
      clips: [
        {
          id: 'bed',
          src: input.music,
          start: 0,
          duration: total,
          // Under the voice, and faded so it does not start or stop abruptly
          // against narration that already has.
          volume: input.musicVolume ?? 0.18,
          volumeCurve: { fadeIn: 0.8, fadeOut: 1.2 },
        },
      ],
    },
  ];
}

/** How a format wants its captions drawn. */
export interface CaptionStyle {
  fontSize: number;
  /** Project width, for `maxWidth`. */
  width: number;
  /** Vertical anchor, 0..1. */
  y: number;
  /** Fraction of the width a caption may occupy before it wraps. */
  widthFraction?: number;
  color?: string;
  /** Typeface, from the brand. Empty or absent means the renderer decides. */
  fontFamily?: string;
  /** Light the word being spoken. Needs per-word timings to do anything. */
  highlight?: WordHighlight;
  layer?: number;
}

/**
 * One overlay per transcribed line, or one per scene when alignment was skipped.
 *
 * Where the words came from decides what can be drawn: with `lines` the
 * per-word timings are shifted onto the timeline (absolute seconds, which is
 * what `setAutoCaptions` established and what `karaoke.ts` reads), so a
 * word-level effect has what it needs. Without them a scene-level caption reads
 * fine and simply cannot animate per word — which is why `highlight` is safe to
 * set unconditionally: the engine ignores it when the timings are not there.
 */
export function captionOverlays(
  plan: ScenePlan,
  spoken: readonly SpokenScene[],
  startAt: readonly number[],
  style: CaptionStyle,
): TextOverlay[] {
  const out: TextOverlay[] = [];
  plan.scenes.forEach((scene, i) => {
    const base = startAt[i];
    const lines = spoken[i].lines;
    if (lines?.length) {
      lines.forEach((line, j) => {
        out.push(
          caption(`caption-${i}-${j}`, line.text, base + line.start, base + line.end, {
            ...style,
            words: line.words?.map((w: { text: string; start: number; end: number }) => ({
              text: w.text,
              start: base + w.start,
              end: base + w.end,
            })),
          }),
        );
      });
    } else {
      out.push(
        caption(
          `caption-${i}`,
          captionTextOf(scene),
          base,
          base + spoken[i].durationSec,
          style,
        ),
      );
    }
  });
  return out;
}

export function composeStory(input: ComposeInput): VideoProject {
  const { plan, spoken, visuals } = input;
  assertSceneArrays(input);

  const { width, height } = frameSize(plan.aspect);
  const fps = input.fps ?? 30;
  const { startAt, total } = sceneClock(spoken);

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

  const narration = narrationClips(spoken, startAt);

  const brand = brandOf(input.brand);
  const overlays = [
    ...captionOverlays(plan, spoken, startAt, {
      fontSize: Math.round(height * 0.045),
      width,
      y: CAPTION_Y,
      color: brand.ink,
      fontFamily: brand.fontFamily,
      highlight: { color: brand.accent },
    }),
    ...logoOverlays(input.brand, { width, height, total }),
  ];

  return createProject({
    width,
    height,
    fps,
    background: { type: 'color', color: '#000000' },
    tracks: [
      { id: 'visual', kind: 'visual', clips: visualClips },
      { id: 'voice', kind: 'audio', clips: narration },
      ...musicTracks(input, total),
    ],
    overlays,
  });
}

function caption(
  id: string,
  text: string,
  start: number,
  end: number,
  o: CaptionStyle & { words?: { text: string; start: number; end: number }[] },
): TextOverlay {
  return {
    id,
    type: 'text',
    text,
    start,
    end,
    x: 0.5,
    y: o.y,
    ...(o.layer != null ? { layer: o.layer } : {}),
    fontSize: o.fontSize,
    color: o.color ?? '#ffffff',
    ...(o.fontFamily ? { fontFamily: o.fontFamily } : {}),
    ...(o.highlight ? { highlight: o.highlight } : {}),
    align: 'center',
    bold: true,
    /*
     * Wrapping is OPT-IN in the engine: absent `maxWidth`, only an explicit
     * newline breaks a line. A generated caption has no newlines and no upper
     * bound on length, so leaving this off is how a hook renders off both
     * edges. Every format must set it — this is that rule, honoured.
     */
    maxWidth: Math.round(o.width * (o.widthFraction ?? 0.86)),
    // Over footage of unknown brightness, a caption carries its own legibility.
    stroke: { color: '#000000', width: Math.max(2, Math.round(o.fontSize * 0.09)) },
    ...(o.words?.length ? { words: o.words } : {}),
  };
}
