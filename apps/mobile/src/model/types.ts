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

/**
 * What every overlay has, whatever it draws.
 *
 * Mirrors `packages/video/src/types.ts`. The split is not tidiness: the preview's
 * overlay pass is almost entirely timing and animation — the window, the fade,
 * the keyframe delta, the slide, the Ken-Burns move — and none of it cares what
 * the layer contains. One place for those fields is what lets a second kind of
 * overlay arrive without a second copy of that arithmetic.
 *
 * `x`/`y` are the ANCHOR, the point a keyframe or a slide displaces the overlay
 * from; what the anchor MEANS is the member's business (for text, where the
 * glyphs sit under `align`; for an image or a shape, the centre of its box).
 */
export interface OverlayBase {
  id: ID;
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
  /** Stacking lane / z-order (higher = on top). Overlays are kept sorted by it. */
  layer?: number;
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
  /** Ken-Burns camera move animated over the overlay's window (preview + export). */
  motion?: Motion;
  /** Keyframes animating opacity + position over the window (≥2 to animate). */
  keyframes?: Keyframe[];
}

export interface TextOverlay extends OverlayBase {
  type: "text";
  text: string;
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
  /**
   * Wrap width in px at the output resolution — the same pixels as `fontSize`,
   * so a caption breaks in the same place however large the preview is.
   *
   * Absent means no wrapping. The preview constrains the text to this width and
   * lets React Native break it; the export measures with the font file and
   * breaks greedily (`linesOf` in `packages/video/src/font-metrics.ts`). Both
   * break on whitespace at the same width, so they agree except where native
   * shaping and the advance-width measurement disagree — the residual already
   * recorded for caption geometry.
   */
  maxWidth?: number;
  /** Drop shadow behind the caption (preview + export). */
  shadow?: TextShadow;
  /** Outline stroke around the glyphs (preview + export). */
  stroke?: TextStroke;
  /** Optional caption background box. */
  box?: { color: string; opacity?: number; padding?: number };
}

/**
 * A picture on the overlay stack — a sticker, a watermark, a logo.
 *
 * `width`/`height` are fractions of the frame and `x`/`y` is the CENTRE of the
 * box, not its corner. Centre because that is the point everything else here
 * displaces: a keyframe, a slide and a Ken-Burns move all move the anchor, and
 * a rotation turns about it.
 */
export interface ImageOverlay extends OverlayBase {
  type: "image";
  /** Media reference, resolved the same way a clip's `src` is. */
  src: string;
  /** Size as a fraction of the frame (1 = full width / full height). */
  width: number;
  height: number;
  /** Clockwise degrees about the anchor. Same convention as `ClipTransform`. */
  rotation?: number;
}

/** Shapes an overlay can draw. Deliberately few; each is exact in all three renderers. */
export type OverlayShape = "rect" | "ellipse";

/** A flat shape on the overlay stack — a scrim, a colour band, a lower-third plate. */
export interface ShapeOverlay extends OverlayBase {
  type: "shape";
  shape: OverlayShape;
  /** Size as a fraction of the frame. */
  width: number;
  height: number;
  rotation?: number;
  fill?: string;
  /** Fill opacity (0..1), multiplied by the layer's own `opacity`. */
  fillOpacity?: number;
  stroke?: string;
  /** Stroke width in px at the output resolution. */
  strokeWidth?: number;
  /** Corner radius in px at the output resolution. Ignored by `ellipse`. */
  cornerRadius?: number;
}

/**
 * Everything that can sit on the overlay stack.
 *
 * Consumers MUST branch on `type` rather than assume text — see the note on the
 * canonical copy. This preview draws captions and skips the rest, which is what
 * the export does too, so the two agree about the absence.
 */
export type Overlay = TextOverlay | ImageOverlay | ShapeOverlay;

/** Narrow an overlay list to captions — the one kind that carries words. */
export function textOverlaysOf(overlays: readonly Overlay[]): TextOverlay[] {
  return overlays.filter((o): o is TextOverlay => o.type === "text");
}

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
 * A mat painted over the FINISHED frame — the vendored twin of `CanvasFrame` in
 * `packages/video/src/types.ts`.
 *
 * "Rounded corners" means the PICTURE's corners are rounded, not the file's: a
 * video frame is opaque, so the corner wedges have to be filled, and they are
 * filled with `color` exactly as the band is. Hence `color` being required —
 * a radius with nothing to fill its wedges with is a state no renderer could
 * honour. `width` and `radius` are fractions of `min(W,H)`.
 */
export interface CanvasFrame {
  color: string;
  /** Band thickness as a fraction of min(W,H), 0..0.5. 0 = corners only. */
  width: number;
  /** Inner corner radius as a fraction of min(W,H), 0..0.5. */
  radius?: number;
  /** Band opacity, 0..1 (default 1). Applies to the corner wedges too. */
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

/**
 * A transition between two consecutive clips.
 *
 * **The names are ffmpeg `xfade` tokens verbatim**, not a house vocabulary that
 * has to be translated. A translation table is one more thing that can drift
 * from what the export emits, and the UI is where a friendly label belongs —
 * `TRANSITIONS` in `xfade.ts` maps `coverleft` to "Push ←" for the picker.
 *
 * The four legacy names at the end predate this and are still in stored
 * documents. `xfadeName` folds each onto its modern equivalent; nothing writes
 * them any more.
 */
export type TransitionType =
  | "cut"
  | "fade"
  /*
   * The AUTHORED families, below. Every other value here is an ffmpeg `xfade`
   * token verbatim; these are not, because `xfade` has nothing like them — VN
   * and CapCut ship a shake and ffmpeg does not. They are still exact in the
   * export: a shake is a crossfade plus a whole-frame jitter, and the per-clip
   * `overlay=x:y` already takes a time-varying expression, so nothing new has
   * to run. `ridesOverlayPath` is what keeps them off the `xfade` chain, and
   * off the server capability gate — there is no token for a build to lack.
   */
  | "shakeleft"
  | "shakeright"
  | "shakeup"
  | "shakedown"
  | "shake2left"
  | "shake2right"
  | "shake2up"
  | "shake2down"
  | "zoom1in"
  | "zoom1out"
  | "zoom2in"
  | "zoom2out"
  | "blur1"
  | "blur2"
  | "light"
  | "blink"
  | "fadeblack"
  | "fadewhite"
  | "wipeleft"
  | "wiperight"
  | "wipeup"
  | "wipedown"
  | "slideleft"
  | "slideright"
  | "slideup"
  | "slidedown"
  | "coverleft"
  | "coverright"
  | "coverup"
  | "coverdown"
  | "revealleft"
  | "revealright"
  | "revealup"
  | "revealdown"
  | "circleopen"
  | "circleclose"
  | "vertopen"
  | "vertclose"
  | "horzopen"
  | "horzclose"
  | "diagtl"
  | "diagtr"
  | "diagbl"
  | "diagbr"
  | "squeezeh"
  | "squeezev"
  | "zoomin"
  | "pixelize"
  | "radial"
  | "hblur"
  // Legacy, read-only. See above.
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

/**
 * A dip in the level — music stepping back under a voice.
 *
 * `depth` is a FRACTION of the clip's plateau, not an absolute gain, so moving
 * the volume slider moves the duck with it. An absolute value would make a duck
 * that was -12 dB under the music become -12 dB under silence the moment
 * someone turned the clip down.
 */
export interface VolumeDuck {
  /** Start, in seconds from the clip's own start. */
  at: number;
  /** Total length in seconds, both ramps included. */
  dur: number;
  /** Gain during the dip as a fraction of the plateau, 0..1. */
  depth: number;
  /** Seconds of ramp at each end. Defaults to `DUCK_RAMP`, clamped to `dur/2`. */
  ramp?: number;
  /** Who put it there. An automatic pass may replace its own; never a manual one. */
  source?: "manual" | "auto";
}

/**
 * A volume envelope stored as INTENT rather than as the points it becomes.
 *
 * The problem this exists for: there is one envelope slot per clip and a curve
 * OVERRIDES `volume`, so with points alone a duck and a pair of fades cannot
 * coexist — writing a duck makes the shape unrecognisable as fades, the sliders
 * stop reading back, and the UI has to fall to "custom curve" on a clip whose
 * fades the user set thirty seconds ago.
 *
 * Storing what was asked for rather than the result means `fadesOf` reads a
 * number instead of trying to recognise a shape, and the renderers materialize
 * to points at the last moment (`curvePoints`). `points` remains the escape
 * hatch for a genuinely hand-drawn curve, which no combination of fields can
 * describe.
 */
export interface VolumeEnvelope {
  /** Seconds ramping up from silence at the head. */
  fadeIn?: number;
  /** Seconds ramping down to silence at the tail. */
  fadeOut?: number;
  ducks?: VolumeDuck[];
  /** A hand-drawn shape, when the fields above cannot express it. */
  points?: VolumePoint[];
}

/**
 * What a clip's `volumeCurve` may hold.
 *
 * The bare array is the ORIGINAL form and is still written for anything a plain
 * point list can express — which is every fade-only clip, so no existing
 * document changes and no existing filtergraph moves. The object form appears
 * only when something needs the structure, i.e. when there is a duck; a
 * renderer that predates it degrades to the clip's plain `volume` rather than
 * crashing, which is the right way round for a capability it could not have
 * performed anyway.
 */
export type VolumeCurve = VolumePoint[] | VolumeEnvelope;

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
  volumeCurve?: VolumeCurve;
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
  volumeCurve?: VolumeCurve;
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
  /**
   * 1 legacy single-track, 2 `tracks`, 3 transitions as clip OVERLAP
   * (`migrate-overlap.ts`).
   */
  schemaVersion: 1 | 2 | 3;
  /** Output resolution, px (e.g. 1080×1920 for reels). */
  width: number;
  height: number;
  /** Output frame rate. */
  fps: number;
  background: Background;
  /** A mat painted over the finished frame — border and rounded corners. */
  frame?: CanvasFrame;
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
}
