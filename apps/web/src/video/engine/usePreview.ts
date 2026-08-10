'use client';

/**
 * Binds a `VideoProject` to a canvas: one rAF loop, one clock, one media pool.
 *
 * The loop asks `frameStateAt` what the frame is and hands the answer to the
 * compositor. It never computes geometry, timing or colour itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCaptionFonts } from '../../net/fonts';
import {
  frameStateAt,
  projectDuration,
  type AudioTrack,
  type AudioTrackClip,
  type VideoProject,
  type VisualTrack,
} from '@layera-labs/orbit-video/browser';
import { resolveAll } from '@/db/media';
import { AudioGraph } from './audio';
import { PlaybackClock } from './clock';
import { renderFrame, supportsCanvasFilter } from './compose';
import { MediaPool } from './sources';

/** Every media src a project references, so we can resolve them in one pass. */
function projectSrcs(p: VideoProject): string[] {
  const out: string[] = [];
  for (const track of p.tracks ?? []) for (const c of track.clips) out.push(c.src);
  // Image overlays too. `frameStateAt` emits a `clip` op for one, so the
  // compositor asks for its media by src exactly as it does for a clip — and a
  // src nobody resolved is not an error anywhere, it is a sticker that never
  // appears.
  for (const o of p.overlays ?? []) if (o.type === 'image') out.push(o.src);
  if (p.background?.type === 'image') out.push(p.background.src);
  return out.filter(Boolean);
}

function audioClipsOf(p: VideoProject): AudioTrackClip[] {
  return (p.tracks ?? [])
    .filter((t): t is AudioTrack => t.kind === 'audio')
    .flatMap((t) => t.clips);
}

export interface PreviewApi {
  playing: boolean;
  time: number;
  duration: number;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  /** A still of the current frame, for project thumbnails. */
  snapshot(maxWidth?: number): Promise<Blob | null>;
}

export function usePreview(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  project: VideoProject,
): PreviewApi {
  const duration = useMemo(() => projectDuration(project), [project]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const clockRef = useRef<PlaybackClock | null>(null);
  const poolRef = useRef<MediaPool | null>(null);
  const audioRef = useRef<AudioGraph | null>(null);
  const svgRef = useRef(new Map<string, HTMLImageElement>());
  const resolvedRef = useRef<Record<string, string>>({});
  /*
   * Caption font bytes, by family.
   *
   * A ref rather than state on purpose: the render loop reads it every frame,
   * and re-rendering the component when a font arrives would restart nothing
   * useful. An empty map is a perfectly good frame — captions just measure by
   * the flat approximation until the bytes land.
   */
  const fontsRef = useRef<Map<string, Uint8Array>>(new Map());
  const projectRef = useRef(project);
  projectRef.current = project;

  // A fresh clock whenever the duration changes, so seeking stays clamped.
  if (!clockRef.current) clockRef.current = new PlaybackClock(duration);

  useEffect(() => {
    const clock = new PlaybackClock(duration);
    clock.seek(clockRef.current?.now() ?? 0);
    clockRef.current = clock;
  }, [duration]);

  // Resolve `orbit-media:` srcs to object URLs whenever the set changes.
  const srcKey = projectSrcs(project).join('|');
  useEffect(() => {
    let live = true;
    void resolveAll(srcKey ? srcKey.split('|') : []).then((map) => {
      if (live) resolvedRef.current = map;
    });
    return () => {
      live = false;
    };
  }, [srcKey]);

  /*
   * Load the faces this project's captions use.
   *
   * Keyed by the sorted family list, the same shape the src resolution above
   * uses, so adding a caption in a family already loaded costs nothing. The
   * bytes are what let `overlayToSVG` embed an `@font-face` — without them the
   * preview draws captions in a system fallback while the export draws the real
   * face, which is the divergence this exists to close.
   */
  const familyKey = [
    ...new Set(
      project.overlays.flatMap((o) => (o.type === 'text' && o.fontFamily ? [o.fontFamily] : [])),
    ),
  ]
    .sort()
    .join('|');
  useEffect(() => {
    let live = true;
    void loadCaptionFonts(familyKey ? familyKey.split('|') : []).then((m) => {
      if (live) fontsRef.current = m;
    });
    return () => {
      live = false;
    };
  }, [familyKey]);

  useEffect(() => {
    const pool = new MediaPool();
    const audio = new AudioGraph();
    poolRef.current = pool;
    audioRef.current = audio;
    return () => {
      pool.destroy();
      audio.destroy();
      poolRef.current = null;
      audioRef.current = null;
    };
  }, []);

  /*
   * Let go of decoders for clips that no longer exist.
   *
   * The pool is keyed by url, and by `clipId|url` for the clips a transition
   * draws twice — so it can now hold an entry per clip rather than per file,
   * and something has to bound it. The keep-set is built from the PROJECT, not
   * from the current frame: pruning to what is on screen would tear down and
   * rebuild a decoder at every cut.
   */
  useEffect(() => {
    const pool = poolRef.current;
    if (!pool) return;
    const keep = new Set<string>();
    for (const track of project?.tracks ?? [])
      for (const c of track.clips) {
        const url = resolvedRef.current[c.src];
        if (!url) continue;
        keep.add(url);
        keep.add(`${c.id}|${url}`);
      }
    if (project?.background?.type === 'image') {
      const url = resolvedRef.current[project.background.src];
      if (url) keep.add(url);
    }
    pool.prune(keep);
    // `srcKey` rather than the ref: the ref is mutable and would not retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, srcKey]);

  // Keep the audio graph in step with the project's audio clips.
  useEffect(() => {
    const id = setTimeout(() => {
      audioRef.current?.sync(audioClipsOf(projectRef.current), resolvedRef.current);
    }, 0);
    return () => clearTimeout(id);
  }, [srcKey, project]);

  // The loop. One rAF, always running, so a paused canvas still repaints after
  // an edit — the preview must never depend on playback to show its content.
  useEffect(() => {
    let raf = 0;
    const filterOK = supportsCanvasFilter();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      const clock = clockRef.current;
      const pool = poolRef.current;
      if (!canvas || !clock || !pool) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const p = projectRef.current;
      if (canvas.width !== p.width || canvas.height !== p.height) {
        canvas.width = p.width;
        canvas.height = p.height;
      }

      if (clock.ended) {
        clock.pause();
        setPlaying(false);
        pool.pauseAll();
        audioRef.current?.pause();
      }

      const t = clock.now();
      const ops = frameStateAt(p, t, { fonts: fontsRef.current });

      // Decode any caption/background SVG the frame needs. `overlayToSVG` is the
      // SAME string the export rasterizes with resvg, so the layout matches.
      for (const op of ops) {
        if (!op.svg || svgRef.current.has(op.svg)) continue;
        const img = new Image();
        img.decoding = 'async';
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(op.svg)}`;
        svgRef.current.set(op.svg, img);
        if (svgRef.current.size > 64) {
          const oldest = svgRef.current.keys().next().value;
          if (oldest && oldest !== op.svg) svgRef.current.delete(oldest);
        }
      }

      renderFrame(ctx, ops, {
        pool,
        resolved: resolvedRef.current,
        svgImages: svgRef.current,
        playing: clock.playing,
        filterOK,
      });

      audioRef.current?.update(t, clock.playing);
      setTime(t);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);

  const play = useCallback(() => {
    clockRef.current?.play();
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    clockRef.current?.pause();
    poolRef.current?.pauseAll();
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (clockRef.current?.playing) pause();
    else play();
  }, [play, pause]);

  const seek = useCallback((t: number) => {
    clockRef.current?.seek(t);
    setTime(t);
  }, []);

  const snapshot = useCallback(
    async (maxWidth = 480): Promise<Blob | null> => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const scale = Math.min(1, maxWidth / canvas.width);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(canvas.width * scale));
      out.height = Math.max(1, Math.round(canvas.height * scale));
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(canvas, 0, 0, out.width, out.height);
      return new Promise((res) => out.toBlob((b) => res(b), 'image/jpeg', 0.82));
    },
    [canvasRef],
  );

  return { playing, time, duration, play, pause, toggle, seek, snapshot };
}

/** Visual clips in composite order — shared by the timeline and inspector. */
export function visualClipsOf(p: VideoProject) {
  return (p.tracks ?? [])
    .filter((t): t is VisualTrack => t.kind === 'visual')
    .flatMap((t) => t.clips);
}
