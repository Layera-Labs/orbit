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
  | { type: 'blur'; amount?: number };

export interface VideoProject {
  id: ID;
  schemaVersion: 1;
  /** Output resolution, px (e.g. 1080×1920 for reels). */
  width: number;
  height: number;
  /** Output frame rate. */
  fps: number;
  background: Background;
  /** v1: a single ordered visual track. clips[0] is the base. */
  clips: VisualClip[];
  /** Time-ranged overlays drawn on top (captions, stickers later). */
  overlays: Overlay[];
  /** Audio tracks (music / voice), mixed together. */
  audio: AudioClip[];
}
