/**
 * The slice of Orbit's video model this example touches.
 *
 * **This file is temporary and it is the first thing to delete.** The canonical
 * definitions live in `packages/video/src/types.ts` and will ship as
 * `@layera-labs/video/browser` — at which point this whole module becomes:
 *
 * ```ts
 * export type { VideoProject, VisualTrack, VisualTrackClip } from '@layera-labs/video/browser';
 * ```
 *
 * It exists only because `@layera-labs/video` is not published yet AND an Expo app
 * cannot join the pnpm workspace to reach it by source (pnpm's symlinked store
 * corrupts Metro's module resolution, which is why this example installs with
 * npm and sits outside the workspace).
 *
 * Every field below is a copy, not an invention — same names, same units, same
 * optionality — so the JSON this app POSTs to `/v1/render` is a real Orbit
 * project and not a lookalike. The full model has roughly ten times this
 * surface: filters, masks, transitions, keyframes, Ken-Burns motion, chroma
 * key, volume envelopes. An example that reproduced all of it would be a
 * second copy of the engine to keep in step, so it reproduces none of it.
 */

export type ID = string;

/** Where a layer sits on the canvas, normalized 0..1. Absent means full frame. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VisualTrackClip {
  id: ID;
  type: 'video' | 'image';
  /**
   * A `file://` URI while the clip is local, an `upload:<token>` once the
   * service holds a copy. `exportProject` performs that swap; nothing else in
   * the app should have to know about it.
   */
  src: string;
  /** ABSOLUTE start on the timeline, seconds. */
  start: number;
  /** On-timeline length, seconds. */
  duration: number;
  /** Video source in-point, seconds (default 0). */
  trimIn?: number;
  /** Placement on the canvas (default full frame). */
  rect?: Rect;
  /** 0..1 gain on the clip's own audio. */
  volume?: number;
  muted?: boolean;
}

export interface VisualTrack {
  id: ID;
  kind: 'visual';
  name?: string;
  clips: VisualTrackClip[];
}

export interface AudioTrackClip {
  id: ID;
  src: string;
  start: number;
  duration: number;
  trimIn?: number;
  volume?: number;
}

export interface AudioTrack {
  id: ID;
  kind: 'audio';
  name?: string;
  clips: AudioTrackClip[];
}

export type Track = VisualTrack | AudioTrack;

export type Background =
  | { type: 'color'; color: string }
  | { type: 'gradient'; from: string; to: string; angle?: number }
  | { type: 'image'; src: string }
  | { type: 'blur'; amount?: number };

/**
 * A project as the render service accepts it.
 *
 * `clips`, `overlays` and `audio` are the legacy single-track fields and are
 * still REQUIRED — the renderer reads `tracks` when present and falls back to
 * them when it is not, so they travel empty rather than absent. Dropping them
 * is the kind of change that only fails on the server, minutes into an export.
 */
export interface VideoProject {
  id: ID;
  /** 3 = transitions expressed as clip overlap. What this example writes. */
  schemaVersion: 1 | 2 | 3;
  /** Output resolution in px. */
  width: number;
  height: number;
  fps: number;
  background: Background;
  clips: [];
  overlays: [];
  audio: [];
  tracks: Track[];
}

/** What `/v1/render` is asked to produce. Every field has a server-side default. */
export interface ExportOutput {
  width?: number;
  height?: number;
  fps?: number;
}
