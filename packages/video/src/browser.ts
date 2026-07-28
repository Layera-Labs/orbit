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
  Overlay,
  AudioClip,
  Background,
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
  VisualTrackClip,
  AudioTrackClip,
  VisualTrack,
  AudioTrack,
  Track,
  VideoProject,
} from './types';
export { FULL_FRAME } from './types';
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
export { hasKeyframes, sampleKeyframes, keyframeExpr, animatesOpacity, animatesPosition } from './keyframes';
export { createProject, projectDuration, transitionDuration } from './project';
export { buildFFmpegArgs, MOSAIC_BLOCK } from './ffmpeg';
export type { BuildFFmpegOptions } from './ffmpeg';
export { overlayToSVG } from './overlay-svg';
export { backgroundToSVG } from './background-svg';
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
export { buildFadeMap, projectFadeMap, fadeFactorAt } from './transitions';
export type { ClipFade } from './transitions';

// The declarative frame description a canvas renderer executes.
export { frameStateAt } from './frame';
export type { DrawOp, Fit } from './frame';
