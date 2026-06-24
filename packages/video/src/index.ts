export type {
  ID,
  BaseClip,
  VideoClip,
  ImageClip,
  VisualClip,
  TextAlign,
  TextOverlay,
  Overlay,
  AudioClip,
  Background,
  VideoProject,
} from './types';
export { createProject, projectDuration } from './project';
export { buildFFmpegArgs } from './ffmpeg';
export type { BuildFFmpegOptions } from './ffmpeg';
export { overlayToSVG } from './overlay-svg';
export { backgroundToSVG } from './background-svg';
export { rasterizeSVG } from './raster';
export { renderProject } from './render';
export type { RenderOptions } from './render';
export { captionReel, lyricVideo, quoteCard, TEMPLATE_LIST } from './templates';
export type { CaptionReelInput, LyricVideoInput, QuoteCardInput, TemplateId } from './templates';
