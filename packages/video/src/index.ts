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
export { buildFFmpegArgs, escapeDrawText } from './ffmpeg';
export type { BuildFFmpegOptions } from './ffmpeg';
export { renderProject } from './render';
export type { RenderOptions } from './render';
