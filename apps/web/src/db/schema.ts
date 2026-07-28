/**
 * Local persistence schema.
 *
 * IndexedDB rather than localStorage: projects reference real media, and
 * localStorage's ~5 MB ceiling makes that impossible from the first video.
 *
 * Two stores, and one rule about how they meet. A project NEVER stores a blob
 * URL — those die on reload — and never a `file:`/absolute path. It stores
 * `orbit-media:<id>`, which is resolved to an object URL for preview and
 * swapped for an `upload:<token>` at export. The render service only accepts
 * `upload:` or `http(s)` srcs (`apps/render-service/src/resolve.ts`), so this
 * indirection is what makes local media renderable at all.
 */
import type { Document as OrbitDocument } from '@orbit/model';
import type { VideoProject } from '@orbit/video/browser';

export const DB_NAME = 'orbit-web';
/** v2 adds `waveforms`. Additive — no existing row is touched or migrated. */
export const DB_VERSION = 2;

export type ProjectKind = 'image' | 'video';

export interface ProjectRow {
  id: string;
  kind: ProjectKind;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** A rendered still of the project's own content, for the bench. */
  thumbnail?: Blob;
  data: OrbitDocument | VideoProject;
}

export type MediaOrigin = 'upload' | 'ai' | 'stock';

export interface MediaRow {
  id: string;
  blob: Blob;
  mime: string;
  name: string;
  origin: MediaOrigin;
  /** Natural pixel size, when known — lets the timeline lay a clip out before decode. */
  width?: number;
  height?: number;
  /** Seconds, for video and audio. */
  duration?: number;
  /** The prompt that produced it, when `origin === 'ai'`. */
  prompt?: string;
  /**
   * The render service's `upload:<file>` token, once uploaded.
   *
   * NOT durable: the service evicts its media dir oldest-first past
   * ORBIT_MAX_MEDIA_BYTES, so a token from last week may be gone. Treat a render
   * failure as a reason to clear this and re-upload — see `renderClient.ts`.
   */
  uploadToken?: string;
  uploadedAt?: number;
  createdAt: number;
}

/**
 * Cached audio peaks for a timeline waveform.
 *
 * Decoding a whole track through `decodeAudioData` costs real time and memory,
 * and the result never changes, so it is computed once per media row. Purely a
 * drawing aid: a clip renders and edits perfectly with no row here.
 */
export interface WaveformRow {
  /** `<mediaId>:<buckets>` — the resolution is part of the identity. */
  id: string;
  mediaId: string;
  buckets: number;
  /** Interleaved [min, max] per bucket, in -1..1. */
  peaks: Float32Array;
  /** Length of the decoded SOURCE in seconds — the peaks span all of it, so a
   *  trimmed clip needs this to know which slice of them to draw. */
  duration: number;
  createdAt: number;
}

export const waveformKey = (mediaId: string, buckets: number) => `${mediaId}:${buckets}`;

export const MEDIA_SCHEME = 'orbit-media:';

export const mediaSrc = (id: string) => `${MEDIA_SCHEME}${id}`;

export const isMediaSrc = (src: string) => src.startsWith(MEDIA_SCHEME);

export const mediaIdOf = (src: string) =>
  isMediaSrc(src) ? src.slice(MEDIA_SCHEME.length) : null;
