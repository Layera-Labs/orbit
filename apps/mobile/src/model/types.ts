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

/** Transition applied between consecutive clips (v1: one project-wide setting). */
export interface Transition {
  type: 'cut' | 'fade';
  /** Crossfade duration in seconds (ignored for 'cut'). */
  duration: number;
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

export interface VisualTrackClip {
  id: ID;
  type: 'video' | 'image';
  src: string;
  /** ABSOLUTE start on the timeline, seconds. */
  start: number;
  duration: number;
  trimIn?: number;
  /** Placement on the canvas (default full-frame). */
  rect?: Rect;
  volume?: number;
  muted?: boolean;
}

export interface AudioTrackClip {
  id: ID;
  src: string;
  /** ABSOLUTE start on the timeline, seconds. */
  start: number;
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
}
