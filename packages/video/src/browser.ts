/**
 * Browser-safe surface of `@orbit/video`.
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
} from './types';
export { FULL_FRAME, FULL_SOURCE, textOverlaysOf } from './types';
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
export { maskToFFmpeg } from './mask';
export { blendToFFmpeg, blendToSkia, blendToCanvas, BLEND_MODES } from './blend';
export { hasVolumeCurve, sampleVolume, volumeCurveExpr } from './curve';
export {
  MAX_FADE,
  MAX_VOLUME,
  fadesOf,
  maxFadeFor,
  withFades,
  withVolume,
} from './audio-fade';
export type { AudioFades } from './audio-fade';
export { hasKeyframes, sampleKeyframes, keyframeExpr, animatesOpacity, animatesPosition } from './keyframes';
export { createProject, projectDuration, transitionDuration } from './project';
export { buildFFmpegArgs, MOSAIC_BLOCK } from './ffmpeg';
export type { BuildFFmpegOptions } from './ffmpeg';
export { overlayBox, overlayToSVG, overlayFontOptions } from './overlay-svg';
export type { FontMap, OverlayRenderOptions } from './overlay-svg';
export { subsetFont, codePointsOf } from './font-subset';
export {
  parseFontMetrics,
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
  slideOffsetAt,
} from './element-anim';
export type { ElementAnimPair } from './element-anim';
export { backgroundToSVG } from './background-svg';
export {
  canvasFramePx,
  canvasFrameToSVG,
  frameOuterPaint,
  hasCanvasFrame,
} from './canvas-frame';
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
  setAutoCaptions,
  hasAutoCaptions,
  clearAutoCaptions,
} from './captions';
export type { CaptionLine } from './captions';

// The same captions as a subtitle file, for a platform that wants one beside
// the video rather than burned into it.
export { toSRT, hasCaptionText, captionCues, captionFileName, srtTime } from './srt';
export type { Cue } from './srt';

// The declarative frame description a canvas renderer executes.
export { frameStateAt } from './frame';
export type { DrawOp, Fit } from './frame';
