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
  /** Optional caption background box. */
  box?: { color: string; opacity?: number; padding?: number };
  animation?: 'none' | 'fade';
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

// ---------------------------------------------------------------------------
// Multi-track (v2) model — CapCut-style layers. When `VideoProject.tracks` is
// present the renderer COMPOSITES: visual tracks stack bottom→top (array order),
// each clip placed at an ABSOLUTE timeline `start` and a normalized `rect` on
// the canvas (picture-in-picture); audio tracks mix, positioned by `start`.
// The legacy single-track `clips`/`audio`/`transition` fields still work (the
// renderer keeps a separate concat/xfade path for them).
// ---------------------------------------------------------------------------

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
  muted?: boolean;
  /** Colour grade applied to this clip (preview + export). */
  filter?: ClipFilter;
  /** Playback speed multiplier (1 = normal; 2 = 2× faster). */
  speed?: number;
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
