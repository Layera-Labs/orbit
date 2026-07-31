/**
 * Orbit video timeline model — VENDORED from `packages/video/src/types.ts`.
 *
 * The mobile app is excluded from the pnpm workspace (its RN/React 19 tree would
 * conflict with the web packages' React 18 tree), so it cannot import
 * `@orbit/video`. These types are pure & dependency-free, so we keep a copy here.
 *
 * ⚠️  CANONICAL SOURCE: packages/video/src/types.ts — keep this in sync.
 *     (Post-MVP: extract a shared `@orbit/video-types` package both consume.)
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
  type: "video";
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
  type: "image";
  src: string;
}

export type VisualClip = VideoClip | ImageClip;

export type TextAlign = "left" | "center" | "right";

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
  type: "text";
  text: string;
  /** Appear / disappear time on the timeline, seconds. */
  start: number;
  end: number;
  /** Normalized anchor position (0..1 of width/height). */
  x: number;
  y: number;
  /** Static layer opacity (0..1). Keyframes override it while animated. */
  opacity?: number;
  /** Optional shape mask in normalized project coordinates. */
  mask?: ClipMask;
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
  /** Stacking lane / z-order (higher = on top). Overlays are kept sorted by it. */
  layer?: number;
  /** Drop shadow behind the caption (preview + export). */
  shadow?: TextShadow;
  /** Outline stroke around the glyphs (preview + export). */
  stroke?: TextStroke;
  /** Optional caption background box. */
  box?: { color: string; opacity?: number; padding?: number };
  animation?: "none" | "fade";
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
  | { type: "color"; color: string }
  | { type: "gradient"; from: string; to: string; angle?: number }
  | { type: "image"; src: string }
  | { type: "blur"; amount?: number };

export type TransitionType =
  | "cut"
  | "fade"
  | "dissolve"
  | "slide"
  | "wipe"
  | "zoom";

/** Transition between consecutive clips (legacy: project-wide; multi-track:
 *  per base-clip boundary via `VisualTrackClip.transitionIn`). */
export interface Transition {
  type: TransitionType;
  /** Crossfade duration in seconds (ignored for 'cut'). */
  duration: number;
}

/** Per-clip colour grade (preview + export read the same values). */
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

/** A keyframe snapshot (opacity + normalized position) at a clip-local time. */
export interface Keyframe {
  /** Time within the clip, 0..1 (fraction of duration). */
  t: number;
  /** 0..1 layer opacity. */
  opacity: number;
  /** Normalized top-left position on the canvas (0..1), for PiP/overlay clips. */
  x: number;
  y: number;
}

/** Chroma-key background removal (pixels near `color` become transparent). */
export interface ChromaKey {
  /** Background colour to remove, hex (e.g. '#00d400'). */
  color: string;
  /** Match tolerance, 0..1 (default 0.3). */
  similarity?: number;
  /** Edge blend / feather, 0..1 (default 0.1). */
  smoothness?: number;
}

/** Shape mask revealing only part of a layer (coords normalized within clip). */
export type MaskShape = "rectangle" | "circle";
export interface ClipMask {
  shape: MaskShape;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  invert?: boolean;
}

/** Reusable, normalized region for local visual effects. */
export type EffectRegionShape = "rectangle" | "circle" | "rounded" | "diamond";
export interface EffectRegion {
  shape: EffectRegionShape;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Effect-layer opacity, 0..1. */
  opacity: number;
}

export interface ClipMosaic extends EffectRegion {
  pattern: "mosaic" | "triangle" | "hexagon" | "blur";
  /** Pixel/blur strength, 0..1. */
  amount: number;
}

export interface ClipMagnifier extends EffectRegion {
  /** Lens zoom, 1..4. */
  zoom: number;
  /** Border width relative to the smaller clip dimension, 0..0.05. */
  borderWidth: number;
  borderColor: string;
}

/** Layer blend mode against the layers below (default normal/over). */
export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "difference"
  | "add";

/** A point on a volume envelope: `t` is 0..1 of the clip duration, `v` is gain (0..2). */
export interface VolumePoint {
  t: number;
  v: number;
}

/** Ken-Burns style camera move applied over a clip's duration. */
export type MotionType =
  | "none"
  | "zoomIn"
  | "zoomOut"
  | "panLeft"
  | "panRight"
  | "panUp"
  | "panDown"
  | "kenBurns";

/** Per-clip motion (zoom / pan animated across the clip window). */
export interface Motion {
  type: MotionType;
  /** 0..1 strength of the move (default 0.5). */
  intensity?: number;
}

/** Per-export output overrides (resolution / fps / bitrate / audio-only). */
export interface ExportOutput {
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  audioOnly?: boolean;
  /** Encode HDR10: 10-bit HEVC tagged BT.2020 + PQ. */
  hdr?: boolean;
}

// ---- Multi-track (v2) model — mirror of packages/video/src/types.ts ----

/** Normalized rectangle on the output canvas (fractions of width/height, 0..1). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_FRAME: Rect = { x: 0, y: 0, w: 1, h: 1 };

/**
 * A sub-rectangle of the SOURCE media, normalized to its own decoded size.
 *
 * Deliberately not in destination pixels: the export builder never probes the
 * media and `frameStateAt` is synchronous and pure, so neither can know a
 * file's natural dimensions. Fractions are the one representation both can
 * emit blind. See `preview/transform.ts`.
 */
export interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole frame — what an absent `crop` means. */
export const FULL_SOURCE: SourceRect = { x: 0, y: 0, w: 1, h: 1 };

export interface VisualTrackClip {
  id: ID;
  type: "video" | "image";
  src: string;
  /** ABSOLUTE start on the timeline, seconds. */
  start: number;
  duration: number;
  trimIn?: number;
  /** Placement on the canvas (default full-frame). */
  rect?: Rect;
  /**
   * CLOCKWISE rotation in DEGREES about the centre of `rect` (default 0).
   *
   * Clockwise because that is what ffmpeg's `rotate` does, and what Skia and
   * canvas do, so no renderer flips the sign. Degrees so 90 round-trips
   * through JSON exactly.
   */
  rotation?: number;
  /** Which part of the source to show (default all of it). See `SourceRect`. */
  crop?: SourceRect;
  volume?: number;
  /** Volume envelope over the clip (≥2 points; overrides `volume`). */
  volumeCurve?: VolumePoint[];
  muted?: boolean;
  /** Colour grade (preview + export). */
  filter?: ClipFilter;
  /** Gaussian blur amount, 0..1 (FX). */
  blur?: number;
  /** Static layer opacity, 0..1 (default 1). */
  opacity?: number;
  /** Shape mask revealing only part of the layer (preview + export). */
  mask?: ClipMask;
  /** Local obscuring effect inside a movable shape. */
  mosaic?: ClipMosaic;
  /** Local magnifying lens inside a movable shape. */
  magnifier?: ClipMagnifier;
  /** Layer blend mode against the layers below (default normal/over). */
  blend?: BlendMode;
  /** Playback speed multiplier (1 = normal). */
  speed?: number;
  /** Ken-Burns camera move animated over the clip (preview + export). */
  motion?: Motion;
  /** Chroma-key background removal (green-screen / solid colour). */
  cutout?: ChromaKey;
  /** Keyframes animating opacity + position over the clip (≥2 to animate). */
  keyframes?: Keyframe[];
  /** Transition INTO this clip from the previous base-track clip. */
  transitionIn?: Transition;
  /** Authoring-only storyboard note. Never rendered — carried so the Story
   *  panel's per-clip notes survive save/load. */
  note?: string;
}

export interface AudioTrackClip {
  id: ID;
  src: string;
  /** ABSOLUTE start on the timeline, seconds. */
  start: number;
  duration: number;
  trimIn?: number;
  volume?: number;
  /** Volume envelope over the clip (≥2 points; overrides `volume`). */
  volumeCurve?: VolumePoint[];
}

export interface VisualTrack {
  id: ID;
  kind: "visual";
  name?: string;
  clips: VisualTrackClip[];
}

export interface AudioTrack {
  id: ID;
  kind: "audio";
  name?: string;
  clips: AudioTrackClip[];
}

export type Track = VisualTrack | AudioTrack;

export type TrackClip = VisualTrackClip | AudioTrackClip;

export interface VideoProject {
  id: ID;
  schemaVersion: 1 | 2;
  /** Output resolution, px (e.g. 1080×1920 for reels). */
  width: number;
  height: number;
  /** Output frame rate. */
  fps: number;
  background: Background;
  /** Legacy single visual track. */
  clips: VisualClip[];
  /** Legacy crossfade/cut. */
  transition?: Transition;
  /** Time-ranged text overlays drawn on top. */
  overlays: Overlay[];
  /** Legacy audio tracks. */
  audio: AudioClip[];
  /** Multi-track layers (v2). The editor always uses this. */
  tracks?: Track[];
  /** Author in HDR — glows the editor preview and defaults HDR10 on export. */
  hdr?: boolean;
}
