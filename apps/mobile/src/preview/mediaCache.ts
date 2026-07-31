/**
 * Warm media for the preview: decoded images kept across mounts, and video
 * decoders pooled and handed back rather than rebuilt.
 *
 * The problem this solves is the one you feel when you drag the playhead over a
 * cut. Each visual layer is keyed by clip id, so crossing a boundary unmounts
 * the old layer and mounts a new one — and both of the things it then needs are
 * built from scratch every single time:
 *
 *   - `useImage` has no cache of any kind. It calls `Skia.Data.fromURI` on
 *     mount, every mount, so a 12-megapixel photo is re-read off disk and
 *     re-decoded each time the playhead touches its clip. Until that lands the
 *     layer renders NOTHING, so the picture is simply absent.
 *   - `Skia.Video(src)` opens a decoder. It is expensive enough that this
 *     codebase already builds it on a separate worklet runtime to keep it off
 *     the UI thread, then hops back through `runOnJS` before a seek can even be
 *     requested.
 *
 * So the fix is not to make either one faster; it is to stop doing them twice.
 *
 * **Images are cached but never disposed.** Anyone holding an `SkImage` from
 * here may be drawing it this frame, and disposing a live one crashes. Eviction
 * therefore only drops the reference and lets the JSI object be collected —
 * which is exactly what `useImage` itself does on unmount, so this is not a new
 * risk, just a bounded version of the existing one. The bound is a BYTE budget
 * rather than a count, because a count that is safe for stickers is not safe
 * for camera-roll photos: twelve of those is half a gigabyte.
 *
 * **Decoders are pooled and disposed.** The pool tracks ownership explicitly —
 * a decoder is either leased to exactly one layer or idle in the free list — so
 * unlike an image, an evicted one is provably not in use and can be released
 * properly. Leases are exclusive because two layers sharing one decoder would
 * fight over its seek position.
 */
import { Skia, type SkImage, type Video } from "@shopify/react-native-skia";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createWorkletRuntime,
  runOnJS,
  runOnRuntime,
} from "react-native-reanimated";
import { ByteLru, LeasePool } from "./mediaPool";

/**
 * Roughly how much decoded pixel data to keep. 96 MB holds a dozen 1080p frames
 * or three or four full-resolution phone photos — enough that scrubbing back
 * and forth over a few cuts never re-reads, without the cache becoming the
 * app's largest allocation.
 */
const IMAGE_BUDGET_BYTES = 96 * 1024 * 1024;
/** Idle decoders to keep. Each holds an open file and native decode buffers. */
const VIDEO_POOL_MAX = 3;

/* ------------------------------------------------------------------ images */

const images = new ByteLru<SkImage>(
  IMAGE_BUDGET_BYTES,
  (img) => img.width() * img.height() * 4,
);
const imageLoads = new Map<string, Promise<SkImage | null>>();

/** The cached image for `uri`, or null. Never starts a load. */
export function peekImage(uri: string | null | undefined): SkImage | null {
  return uri ? images.get(uri) : null;
}

/**
 * Decode `uri` into the cache if it is not there already. Safe to call every
 * render: a hit and a load already in flight both short-circuit.
 */
export function prefetchImage(
  uri: string | null | undefined,
): Promise<SkImage | null> {
  if (!uri) return Promise.resolve(null);
  const hit = images.get(uri);
  if (hit) return Promise.resolve(hit);
  const running = imageLoads.get(uri);
  if (running) return running;
  const load = Skia.Data.fromURI(uri)
    .then((data) => {
      const img = Skia.Image.MakeImageFromEncoded(data);
      if (img) images.set(uri, img);
      return img;
    })
    // A src can point at a file that is gone — iOS renumbers the app container
    // on every install. That is a missing picture, not a crash.
    .catch(() => null)
    .finally(() => imageLoads.delete(uri));
  imageLoads.set(uri, load);
  return load;
}

/**
 * Drop-in replacement for Skia's `useImage` that reads the cache first. On a
 * hit it returns the image from the FIRST render, so a layer that mounts onto
 * already-warm media never shows an empty frame at all.
 */
export function useCachedImage(uri: string | null | undefined): SkImage | null {
  const [, redraw] = useState(0);
  const cached = peekImage(uri);
  useEffect(() => {
    if (!uri || peekImage(uri)) return;
    let alive = true;
    prefetchImage(uri).then(() => {
      if (alive) redraw((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [uri]);
  return cached;
}

/* ------------------------------------------------------------------ videos */

const loadRuntime = createWorkletRuntime("orbit-video-loader");

const videos = new LeasePool<Video>(VIDEO_POOL_MAX, (v) => v.dispose());
/** Uris with a build already running, so a prefetch cannot stack decoders up. */
const videoLoads = new Set<string>();

const takeVideo = (uri: string) => videos.take(uri);
const releaseVideo = (uri: string, v: Video) => videos.release(uri, v);

function buildVideo(src: string) {
  "worklet";
  const v = Skia.Video(src);
  runOnJS(stash)(v as Video, src);
}

function stash(v: Video, uri: string) {
  videoLoads.delete(uri);
  releaseVideo(uri, v);
}

/**
 * Open a decoder for `uri` ahead of time and park it in the pool, so the layer
 * that eventually wants it starts at a seek instead of at a file open.
 */
export function prefetchVideo(uri: string | null | undefined) {
  if (!uri || videoLoads.has(uri) || videos.has(uri)) return;
  videoLoads.add(uri);
  runOnRuntime(loadRuntime, buildVideo)(uri);
}

/**
 * Lease a decoder for the life of a layer. Returns null until one exists;
 * `useClipFrame` simply skips its frame callback until then, exactly as it did
 * when it built the decoder itself.
 */
export function useLeasedVideo(uri: string | null): Video | null {
  const [video, setVideo] = useState<Video | null>(null);
  /** The source this layer wants RIGHT NOW, readable from an async delivery. */
  const wanted = useRef(uri);
  wanted.current = uri;
  /** The decoder currently leased, so the cleanup can hand back exactly it. */
  const leased = useRef<{ uri: string; video: Video } | null>(null);
  /*
   * A build can outlive the layer that asked for it — cross a cut quickly
   * enough and the delivery arrives after unmount. Without this the decoder
   * would be recorded as leased to a component that no longer exists, so
   * nothing would ever hand it back and the pool would lose a slot per fast
   * scrub.
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const deliver = useCallback((v: Video, forUri: string) => {
    videoLoads.delete(forUri);
    // The playhead moved on while this was opening. The decoder is still
    // perfectly good — pool it for whoever wants that source next rather than
    // hand a layer the wrong media, which is the failure this ref exists to
    // prevent.
    if (!mounted.current || wanted.current !== forUri || leased.current) {
      releaseVideo(forUri, v);
      return;
    }
    leased.current = { uri: forUri, video: v };
    setVideo(v);
  }, []);

  const load = useCallback(
    (src: string) => {
      "worklet";
      const v = Skia.Video(src);
      runOnJS(deliver)(v as Video, src);
    },
    [deliver],
  );

  useEffect(() => {
    if (!uri) {
      setVideo(null);
      return;
    }
    const pooled = takeVideo(uri);
    if (pooled) {
      leased.current = { uri, video: pooled };
      setVideo(pooled);
    } else {
      setVideo(null);
      videoLoads.add(uri);
      runOnRuntime(loadRuntime, load)(uri);
    }
    return () => {
      if (leased.current) {
        releaseVideo(leased.current.uri, leased.current.video);
        leased.current = null;
      }
      setVideo(null);
    };
  }, [uri, load]);

  return video;
}
