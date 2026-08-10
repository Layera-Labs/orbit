/**
 * Browser-safe surface of `@layera-labs/video`.
 *
 * Everything re-exported here is pure TypeScript over plain data — no `node:`
 * builtins, no native addons — so a web bundle can import the timeline model and
 * the effect math without dragging in ffmpeg, resvg or the filesystem.
 *
 * `ffmpeg.ts` is included even though it is useless client-side: it is a pure
 * argv builder, and the dual-render test compares its output against
 * `frameStateAt`, so the two must be importable together.
 *
 * `__tests__/browser-safety.test.ts` asserts this entry's built import graph
 * stays clean. Do not add a re-export without checking it there.
 */
export type {
  ID,
  BaseClip,
  VideoClip,
  ImageClip,
  VisualClip,
  TextAlign,
  TextShadow,
  TextStroke,
  TextOverlay,
  ImageOverlay,
  ShapeOverlay,
  OverlayBase,
  OverlayShape,
  Overlay,
  AudioClip,
  Background,
  CanvasFrame,
  AnimKind,
  ElementAnim,
  SlideEdge,
  Transition,
  TransitionType,
  ClipFilter,
  ChromaKey,
  ClipMask,
  ClipMosaic,
  ClipMagnifier,
  MaskShape,
  BlendMode,
  VolumePoint,
  VolumeCurve,
  VolumeDuck,
  VolumeEnvelope,
  Keyframe,
  Motion,
  MotionType,
  ExportOutput,
  Rect,
  SourceRect,
  VisualTrackClip,
  AudioTrackClip,
  VisualTrack,
  AudioTrack,
  Track,
  VideoProject,
  WordHighlight,
  WordTiming,
  // A plate is a text or shape overlay — the two kinds that rasterize to their
  // own picture. `PlateOverlay` is the argument type of everything in
  // `./karaoke` below, and `EffectRegion` is the argument type of the already
  // exported `regionBoxPx`, so a consumer could call them but not name them.
  PlateOverlay,
  EffectRegion,
  EffectRegionShape,
} from './types';
export { FULL_FRAME, FULL_SOURCE, plateOverlaysOf, textOverlaysOf } from './types';
export {
  FILTER_PRESETS,
  NEUTRAL,
  resolveFilter,
  filterToFFmpeg,
  atempoChain,
  isNeutral,
  temperatureKelvin,
  temperatureGains,
  gradeMatrix,
} from './filters';
export type { FilterParams } from './filters';
export { hasMotion, motionStateAt, motionToZoompan, motionIntensity, ZOOM_DELTA, PAN_ZOOM } from './motion';
export { chromaToFFmpeg, chromaParams, chromaAlphaAt, hexToRgb } from './cutout';
export type { ChromaParams } from './cutout';
// Both targets, as `blend` already ships. The canvas half used to live in the
// web app, where nothing compared it to the filter it is supposed to match.
export { maskToFFmpeg, maskToCanvas } from './mask';
export type { CanvasMask } from './mask';
export { blendToFFmpeg, blendToSkia, blendToCanvas, BLEND_MODES } from './blend';
export {
  DUCK_RAMP,
  curvePoints,
  duckRamp,
  hasVolumeCurve,
  isEnvelope,
  sampleVolume,
  volumeCurveExpr,
} from './curve';
export {
  MAX_FADE,
  MAX_VOLUME,
  ducksOf,
  fadesOf,
  maxFadeFor,
  withDucks,
  withFades,
  withVolume,
} from './audio-fade';
export type { AudioFades } from './audio-fade';
export { hasKeyframes, sampleKeyframes, keyframeExpr, animatesOpacity, animatesPosition } from './keyframes';
export { createProject, projectDuration, transitionDuration } from './project';
/*
 * Timeline editing. `createProject` used to be the only thing here that touched
 * a project, so every editor built on this package had to reinvent the rest —
 * and the rules are not guessable from the types. See `edit.ts`.
 */
export {
  addOverlay,
  addOverlayClip,
  addVisualTrack,
  appendAudio,
  appendVisual,
  byStart,
  duplicateClip,
  duplicateOverlay,
  findClip,
  findOverlay,
  findTextOverlay,
  mainTrack,
  moveClip,
  nextOverlayLayer,
  overlayLabel,
  patchClip,
  removeClip,
  removeOverlay,
  removeTrackGap,
  reorderClip,
  rippleDeleteClip,
  rippleDeleteOverlay,
  setClipRect,
  setClipTrack,
  setClipTransform,
  setElementAnim,
  setFrame,
  setTransition,
  splitAt,
  trimClip,
  updateOverlay,
} from './edit';
export type { IdFactory } from './edit';
export { buildFFmpegArgs, MOSAIC_BLOCK } from './ffmpeg';
export type { BuildFFmpegOptions } from './ffmpeg';
// `shapeToSVG` and `shapeBox` are the shape half of this pair. `overlayToSVG`
// takes text only, so without them an outside renderer draws no shapes, and
// `overlayBox` — which exists so a caller can hit-test a click or draw a
// selection outline — had no counterpart for the kind you can also click.
export { overlayBox, overlayToSVG, overlayFontOptions, shapeBox, shapeToSVG } from './overlay-svg';
export type { FontMap, OverlayRenderOptions } from './overlay-svg';
export { subsetFont, subsetFontCached, codePointsOf } from './font-subset';
export {
  parseFontMetrics,
  metricsFor,
  measureLine,
  measurerFor,
  approximateMeasurer,
  wrapLines,
  linesOf,
  APPROX_EM_PER_CHAR,
} from './font-metrics';
export type { FontMetrics, TextMeasurer } from './font-metrics';
export {
  LEGACY_FADE_D,
  SLIDE_DISTANCE,
  animWindows,
  elementFadeAt,
  hasAnim,
  hasFade,
  hasSlide,
  resolveAnim,
  slideExpr,
  slideIsIdentity,
  slideOffsetAt,
} from './element-anim';
export type { ElementAnimPair } from './element-anim';
// `gradientEnds` travels with `backgroundToSVG` because a second surface
// painting the same gradient — the canvas frame here, a Skia preview outside —
// must derive its endpoints from this arithmetic rather than re-deriving them.
export { backgroundToSVG, gradientEnds } from './background-svg';
export {
  canvasFramePx,
  canvasFrameToSVG,
  frameOuterPaint,
  hasCanvasFrame,
} from './canvas-frame';
export type { FrameOuterPaint } from './canvas-frame';
export { captionReel, lyricVideo, quoteCard, TEMPLATE_LIST } from './templates';
export type { CaptionReelInput, LyricVideoInput, QuoteCardInput, TemplateId } from './templates';

// Geometry + transition resolution, extracted from the ffmpeg builder so the
// preview and the export share one implementation rather than two that agree.
export {
  even,
  r3,
  clipRectPx,
  coverCrop,
  srcTimeAt,
  progressAt,
  // Local-effect geometry, shared with the ffmpeg filtergraph so a mosaic or a
  // lens lands on the same pixels in the preview and in the exported file.
  regionBoxPx,
  mosaicStepPx,
  mosaicBlurSigma,
  magnifierCropPx,
  ROUNDED_R,
} from './layout';
// Rotation + source-crop geometry. Same contract as `layout`: the export, the
// canvas compositor and the Skia preview all size a rotated box from here, so
// they cannot round it three different ways.
export {
  evenUp,
  normalizeRotation,
  isRightAngle,
  rotatedBoxPx,
  isFullSource,
  clampSourceRect,
  sourceCropPx,
  snapAngle,
  SNAP_ANGLES,
} from './transform';
export { buildEdgeFadeMap, projectEdgeFadeMap, fadeFactorAt } from './transitions';
export { migrateTransitionOverlap, OVERLAP_SCHEMA } from './migrate-overlap';
export type { ClipFade } from './transitions';
export {
  MAX_OVERLAP_FRAC,
  TRANSITIONS,
  isAlphaOnly,
  blurCommands,
  blurSigmaAt,
  flashAlphaAt,
  flashColor,
  flashExpr,
  isAuthoredTransition,
  ridesOverlayPath,
  shakeExpr,
  shakeOffsetAt,
  parseXfadeTokens,
  planMainRuns,
  previewableTransitions,
  resolveTransitions,
  xfadeHasPreview,
  xfadeMapOf,
  xfadeName,
  xfadeProgressAt,
  requestedOverlap,
  transitionUnsupportedMessage,
  unsupportedTransitions,
  xfadeMaskAt,
  xfadeMaskGrid,
  xfadeStateAt,
  xfadeStateFor,
  xfadeVeilAt,
  zoomExpr,
  // `zoomExpr` is the ffmpeg half; this is the scalar the preview multiplies by.
  // Shipping one without the other is what forces a second surface to re-derive
  // the curve, which is the divergence the pair exists to prevent.
  zoomScaleAt,
} from './xfade';
export type {
  ClipXfades,
  EdgeFade,
  MainRun,
  ResolvedTransitions,
  TransitionBoundary,
  TransitionDowngrade,
  TransitionFamily,
  TransitionVariant,
  XfMask,
  XfMaskField,
  XfRole,
  XfState,
  XfVeil,
} from './xfade';

// Auto-captions. Pure layout over a transcript the service produced.
export {
  CAPTION_ID_PREFIX,
  captionWordsValid,
  setAutoCaptions,
  hasAutoCaptions,
  clearAutoCaptions,
} from './captions';
export type { CaptionLine } from './captions';

// The same captions as a subtitle file, for a platform that wants one beside
// the video rather than burned into it.
export { toSRT, hasCaptionText, captionCues, captionFileName, srtTime } from './srt';
export type { Cue } from './srt';

// A picture on the overlay stack, as the clip every renderer already draws.
// The export and both previews go through this one conversion rather than
// implementing an image-overlay path each; a consumer drawing overlays itself
// needs the same door, and until now there was no specifier that opened it.
export { imageOverlayAsClip, imageOverlaysOf } from './overlay-clip';

// The declarative frame description a canvas renderer executes. `FrameOptions`
// and `XfDraw` are the signature types of `frameStateAt` and of `DrawOp.xf`:
// inference reaches them, a typed wrapper or a helper taking `op.xf` does not.
export { frameStateAt } from './frame';
export type { DrawOp, Fit, FrameOptions, XfDraw } from './frame';

/*
 * Word-by-word caption slicing.
 *
 * This is not a convenience re-export. `BuildFFmpegOptions.overlayImages` is
 * keyed by `PlateSegment.key`, and for a karaoke caption that key is
 * `${overlay.id}#${n}` — one entry per word window, not one per overlay. A
 * consumer calling `buildFFmpegArgs` cannot compute those keys without this
 * module, so every highlighted caption silently falls out of its filtergraph.
 *
 * `activeWordAt` is the preview's half of the same boundary. Both surfaces
 * slice here or they do not agree, which is the whole reason `karaoke.ts` reads
 * the way it does — and an outside surface could not reach it at all.
 */
export {
  activeWordAt,
  karaokeWords,
  plateSegmentsOf,
  segmentsOf,
  MAX_WORD_SEGMENTS,
  NO_WORD,
} from './karaoke';
export type { PlateSegment } from './karaoke';
