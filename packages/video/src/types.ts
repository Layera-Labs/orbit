/**
 * Orbit video timeline model — headless, JSON-serializable.
 *
 * This is the video counterpart to `@orbit/model`: a project is plain data that
 * a UI edits, an agent mutates, and the server render pipeline turns into an
 * MP4. v1 is intentionally minimal (a single visual track + text overlays +
 * audio) — the seed of a fuller NLE, not a CapCut-depth multi-track engine.
 */
export type ID = string;

export interface BaseClip {
  id: ID;
  /** Start time on the project timeline, in seconds. */
  start: number;
  /** Duration on the timeline, in seconds. */
  duration: number;
}

export interface VideoClip extends BaseClip {
  type: 'video';
  src: string;
  /** Source-media in-point, seconds (default 0). */
  trimIn?: number;
  /** Source-media out-point, seconds (default = start + duration). */
  trimOut?: number;
  /** 0..1 gain on the clip's own audio. */
  volume?: number;
  muted?: boolean;
}

export interface ImageClip extends BaseClip {
  type: 'image';
  src: string;
}

export type VisualClip = VideoClip | ImageClip;

export type TextAlign = 'left' | 'center' | 'right';

/** Drop shadow behind a caption. Offsets/blur are px at the output resolution. */
export interface TextShadow {
  color: string;
  blur?: number;
  dx?: number;
  dy?: number;
  opacity?: number;
}

/** Outline stroke around caption glyphs. Width is px at the output resolution. */
export interface TextStroke {
  color: string;
  width: number;
}

export interface TextOverlay {
  id: ID;
  type: 'text';
  text: string;
  /** Appear / disappear time on the timeline, seconds. */
  start: number;
  end: number;
  /** Normalized anchor position (0..1 of width/height). */
  x: number;
  y: number;
  /** Font size in px at the output resolution. */
  fontSize: number;
  color: string;
  fontFamily?: string;
  align?: TextAlign;
  bold?: boolean;
  /** Letter spacing (tracking) in px at the output resolution. */
  letterSpacing?: number;
  /** Line height as a multiple of the font size (default 1.25). */
  lineHeight?: number;
  /** Drop shadow behind the caption (preview + export). */
  shadow?: TextShadow;
  /** Outline stroke around the glyphs (preview + export). */
  stroke?: TextStroke;
  /** Optional caption background box. */
  box?: { color: string; opacity?: number; padding?: number };
  animation?: 'none' | 'fade';
  /** Ken-Burns camera move animated over the caption window (preview + export). */
  motion?: Motion;
  /** Keyframes animating opacity + position over the caption (≥2 to animate). */
  keyframes?: Keyframe[];
}

export type Overlay = TextOverlay;

export interface AudioClip {
  id: ID;
  src: string;
  /** Start time on the timeline, seconds (v1 mixes from 0). */
  start: number;
  /** Source-media in-point, seconds. */
  trimIn?: number;
  trimOut?: number;
  /** Duration to use, seconds (default = project duration). */
  duration?: number;
  /** 0..1 gain. */
  volume?: number;
}

export type Background =
  | { type: 'color'; color: string }
  | { type: 'gradient'; from: string; to: string; angle?: number }
  | { type: 'image'; src: string }
  | { type: 'blur'; amount?: number };

export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'slide' | 'wipe' | 'zoom';

/** Transition between consecutive clips (legacy: one project-wide setting;
 *  multi-track: per base-clip boundary via `VisualTrackClip.transitionIn`). */
export interface Transition {
  type: TransitionType;
  /** Crossfade duration in seconds (ignored for 'cut'). */
  duration: number;
}

/**
 * Per-clip colour grade. `preset` names a look (resolved via FILTER_PRESETS in
 * `filters.ts`); the explicit fields override the preset's params. `intensity`
 * (0..1) lerps the whole grade toward neutral. The mobile Skia preview and the
 * server ffmpeg render read the SAME values (kept in lock-step).
 */
export interface ClipFilter {
  preset?: string;
  /** eq brightness, -1..1 (0 = neutral). */
  brightness?: number;
  /** eq contrast, 0..2 (1 = neutral). */
  contrast?: number;
  /** eq saturation, 0..3 (1 = neutral). */
  saturation?: number;
  /** warm(+) / cool(-) tint, -1..1 (0 = neutral). */
  temperature?: number;
  /** overall strength, 0..1 (default 1). */
  intensity?: number;
}

/**
 * Chroma-key background removal: pixels close to `color` become transparent so
 * lower layers show through. Preview (Skia runtime shader) and export (ffmpeg
 * `colorkey`) read the SAME color + tolerances.
 */
export interface ChromaKey {
  /** Background colour to remove, hex (e.g. '#00d400'). */
  color: string;
  /** Match tolerance, 0..1 (default 0.3). */
  similarity?: number;
  /** Edge blend / feather, 0..1 (default 0.1). */
  smoothness?: number;
}

/**
 * A keyframe on a visual clip: a full snapshot of animatable values at a point
 * in the clip's local time. With ≥2 keyframes the renderer interpolates linearly
 * between adjacent ones. Preview (Skia opacity + rect override) and export
 * (ffmpeg overlay x/y expressions + alpha geq) read the SAME keyframes.
 */
export interface Keyframe {
  /** Time within the clip, 0..1 (fraction of duration). */
  t: number;
  /** 0..1 layer opacity. */
  opacity: number;
  /** Normalized top-left position on the canvas (0..1), for PiP/overlay clips. */
  x: number;
  y: number;
}

/**
 * Shape mask: reveals only the part of a layer inside the shape (or outside, if
 * inverted). Coordinates are normalized within the clip's own frame (0..1).
 * Preview clips the Skia layer to the shape; export keys the alpha via `geq`.
 */
export type MaskShape = 'rectangle' | 'circle';
export interface ClipMask {
  shape: MaskShape;
  /** Shape centre, normalized (0..1). */
  cx: number;
  cy: number;
  /** Half-width / half-height (rectangle) or radii (circle), normalized (0..1). */
  rx: number;
  ry: number;
  /** Keep OUTSIDE the shape instead of inside. */
  invert?: boolean;
}

/** A point on a volume envelope: `t` is 0..1 of the clip duration, `v` is gain (0..2). */
export interface VolumePoint {
  t: number;
  v: number;
}

/**
 * Layer blend mode. Composited by blending the clip with the layer(s) below it
 * within its rect + time window. Preview uses the Skia blend mode; export blends
 * the base region under the clip via ffmpeg `blend=all_mode` then overlays it
 * back. `'normal'` = plain alpha-over (the default).
 */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference' | 'add';

/** Ken-Burns style camera move applied over a clip's duration. */
export type MotionType =
  | 'none'
  | 'zoomIn'
  | 'zoomOut'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown'
  | 'kenBurns';

/**
 * Per-clip motion (zoom / pan animated across the clip window). Preview (Skia
 * `<Group transform>` interpolated by playhead) and export (ffmpeg `zoompan`
 * driven by output-frame `on`) read the SAME preset + intensity.
 */
export interface Motion {
  type: MotionType;
  /** 0..1 strength of the move (default 0.5). */
  intensity?: number;
}

// ---------------------------------------------------------------------------
// Multi-track (v2) model — CapCut-style layers. When `VideoProject.tracks` is
// present the renderer COMPOSITES: visual tracks stack bottom→top (array order),
// each clip placed at an ABSOLUTE timeline `start` and a normalized `rect` on
// the canvas (picture-in-picture); audio tracks mix, positioned by `start`.
// The legacy single-track `clips`/`audio`/`transition` fields still work (the
// renderer keeps a separate concat/xfade path for them).
// ---------------------------------------------------------------------------

/** Per-export output overrides (resolution / fps / bitrate / audio-only). */
export interface ExportOutput {
  width?: number;
  height?: number;
  fps?: number;
  /** target video bitrate, Mbps. */
  bitrate?: number;
  audioOnly?: boolean;
  /** Encode HDR10: 10-bit HEVC tagged BT.2020 + PQ (SMPTE-2084). */
  hdr?: boolean;
}

/** Normalized rectangle on the output canvas (fractions of width/height, 0..1). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Full-frame placement default. */
export const FULL_FRAME: Rect = { x: 0, y: 0, w: 1, h: 1 };

export interface VisualTrackClip {
  id: ID;
  type: 'video' | 'image';
  src: string;
  /** ABSOLUTE start on the timeline, seconds. */
  start: number;
  /** On-timeline length, seconds. */
  duration: number;
  /** Video source in-point, seconds (default 0). */
  trimIn?: number;
  /** Placement on the canvas (default full-frame). Overlay tracks use a sub-rect for PiP. */
  rect?: Rect;
  /** 0..1 gain on the clip's own audio. */
  volume?: number;
  /** Volume envelope over the clip (≥2 points; overrides `volume` when set). */
  volumeCurve?: VolumePoint[];
  muted?: boolean;
  /** Colour grade applied to this clip (preview + export). */
  filter?: ClipFilter;
  /** Gaussian blur amount, 0..1 (FX). */
  blur?: number;
  /** Static layer opacity, 0..1 (default 1). Keyframes override when present. */
  opacity?: number;
  /** Shape mask revealing only part of the layer (preview + export). */
  mask?: ClipMask;
  /** Layer blend mode against the layers below (default normal/over). */
  blend?: BlendMode;
  /** Playback speed multiplier (1 = normal; 2 = 2× faster). */
  speed?: number;
  /** Ken-Burns camera move animated over the clip (preview + export). */
  motion?: Motion;
  /** Chroma-key background removal (green-screen / solid colour). */
  cutout?: ChromaKey;
  /** Keyframes animating opacity + position over the clip (≥2 to animate). */
  keyframes?: Keyframe[];
  /** Transition INTO this clip from the previous base-track clip (crossfade etc.). */
  transitionIn?: Transition;
}

export interface AudioTrackClip {
  id: ID;
  src: string;
  /** ABSOLUTE start on the timeline, seconds. */
  start: number;
  /** On-timeline length, seconds (default: to end of source). */
  duration: number;
  trimIn?: number;
  volume?: number;
  /** Volume envelope over the clip (≥2 points; overrides `volume` when set). */
  volumeCurve?: VolumePoint[];
}

export interface VisualTrack {
  id: ID;
  kind: 'visual';
  name?: string;
  clips: VisualTrackClip[];
}

export interface AudioTrack {
  id: ID;
  kind: 'audio';
  name?: string;
  clips: AudioTrackClip[];
}

export type Track = VisualTrack | AudioTrack;

export interface VideoProject {
  id: ID;
  schemaVersion: 1 | 2;
  /** Output resolution, px (e.g. 1080×1920 for reels). */
  width: number;
  height: number;
  /** Output frame rate. */
  fps: number;
  background: Background;
  /** Visual clips, played in array order (legacy single-track). */
  clips: VisualClip[];
  /** Optional crossfade/cut applied between consecutive clips (legacy). */
  transition?: Transition;
  /** Time-ranged overlays drawn on top (captions, stickers later). */
  overlays: Overlay[];
  /** Audio tracks (music / voice), mixed together (legacy). */
  audio: AudioClip[];
  /** Multi-track layers (v2). When present, the renderer composites these. */
  tracks?: Track[];
}
