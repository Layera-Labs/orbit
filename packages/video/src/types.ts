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
  /**
   * @deprecated Superseded by `animateIn`/`animateOut`. Still READ, never
   * written: `resolveAnim` maps a stored `"fade"` to the 0.3s fade the export
   * has always applied, so old documents render byte-identically.
   */
  animation?: "none" | "fade";
  /** Entrance animation. See `element-anim.ts`. */
  animateIn?: ElementAnim;
  /** Exit animation. */
  animateOut?: ElementAnim;
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

/**
 * A mat painted over the FINISHED frame: a border band and rounded inner
 * corners, in one colour.
 *
 * "Rounded corners" rounds the OPENING and, concentrically, the mat's own
 * outside — a card rather than a square with a hole in it. A video frame is
 * opaque, so the wedges left outside that card have to be filled with
 * something, and they are filled with the BACKGROUND: `frameOuterPaint` in
 * `canvas-frame.ts` reduces it to a colour or the same gradient the base layer
 * uses, and a photograph (which no rasterized SVG can embed) resolves to black
 * in every renderer alike.
 *
 * `color` is still required, because it is the band, and the UI seeds it from a
 * solid background when the frame is first switched on so a fresh frame reads
 * as rounded corners rather than as a coloured border that appeared.
 *
 * `width` and `radius` are fractions of `min(width, height)` so a frame
 * authored at 1080p survives an export at 4K — the same reason `rect` and
 * `crop` are normalized.
 */
export interface CanvasFrame {
  /** Band and corner-wedge colour. */
  color: string;
  /** Band thickness as a fraction of min(W,H), 0..0.5. 0 = corners only. */
  width: number;
  /** Inner corner radius as a fraction of min(W,H), 0..0.5. */
  radius?: number;
  /**
   * Band opacity, 0..1 (default 1). Below 1 the picture shows through the
   * corner wedges as well as the band — they are one shape and cannot be
   * separated, which is a thing to say in the UI rather than pretend otherwise.
   */
  opacity?: number;
}

/** How an element enters or leaves. No scale: ffmpeg cannot animate one. */
export type AnimKind = "none" | "fade" | "slide";
/** The edge a slide comes FROM on the way in, and goes TO on the way out. */
export type SlideEdge = "left" | "right" | "up" | "down";

/**
 * One end of an element's entrance/exit animation. See `element-anim.ts` for
 * the sampler and its matching ffmpeg expression.
 */
export interface ElementAnim {
  type: AnimKind;
  /** Seconds. Clamped to half the element's window so in and out cannot cross. */
  duration: number;
  /** Which edge a slide travels from / to. Ignored by fade. */
  edge?: SlideEdge;
  /** Travel distance as a fraction of min(W,H). Defaults to `SLIDE_DISTANCE`. */
  distance?: number;
}

export type TransitionType =
  | "cut"
  | "fade"
  | "dissolve"
  | "slide"
  | "wipe"
  | "zoom";

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
export type MaskShape = "rectangle" | "circle";
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
export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "difference"
  | "add";

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

/**
 * A sub-rectangle of the SOURCE media, normalized to its own decoded size.
 *
 * Deliberately not in destination pixels: the export builder never probes the
 * media and `frameStateAt` is synchronous and pure, so neither can know a
 * file's natural dimensions. Fractions are the one representation both can
 * emit blind — ffmpeg resolves them with `iw`/`ih`, the compositors after
 * decode. See `transform.ts`.
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
  /** On-timeline length, seconds. */
  duration: number;
  /** Video source in-point, seconds (default 0). */
  trimIn?: number;
  /** Placement on the canvas (default full-frame). Overlay tracks use a sub-rect for PiP. */
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
  /** Local obscuring effect inside a movable shape. */
  mosaic?: ClipMosaic;
  /** Local magnifying lens inside a movable shape. */
  magnifier?: ClipMagnifier;
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
  /**
   * Entrance animation for this element itself.
   *
   * Distinct from `transitionIn`, which is about the CUT between consecutive
   * main-track clips. Both may be set, and their alphas multiply — honestly,
   * because that is what chained `fade` filters do in the export.
   */
  animateIn?: ElementAnim;
  /** Exit animation. */
  animateOut?: ElementAnim;
  /** Authoring-only storyboard note. Never rendered — the renderer ignores it;
   *  it exists so editor annotations survive a save/load round trip. */
  note?: string;
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

export interface VideoProject {
  id: ID;
  schemaVersion: 1 | 2;
  /** Output resolution, px (e.g. 1080×1920 for reels). */
  width: number;
  height: number;
  /** Output frame rate. */
  fps: number;
  background: Background;
  /** A mat painted over the finished frame — border and rounded corners. */
  frame?: CanvasFrame;
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
