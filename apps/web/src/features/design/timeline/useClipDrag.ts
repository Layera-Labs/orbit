'use client';

import { useCallback, useRef, useState } from 'react';
import type { VideoProject } from '@layera-labs/orbit-video/browser';
import { moveClip, setClipTrack, trimClip, updateOverlay, useVideo } from '@/store/videoStore';

export type DragMode = 'move' | 'trim-in' | 'trim-out';

/**
 * What a lane holds. `text` is a caption lane: overlays carry `start`/`end`
 * rather than `start`/`duration`, so they commit through `updateOverlay` and
 * cannot be dragged onto a picture or sound lane.
 */
export type LaneKind = 'visual' | 'audio' | 'text';

/** Where the clip is being shown RIGHT NOW, before anything is committed. */
export interface DragPreview {
  id: string;
  mode: DragMode;
  start: number;
  duration: number;
  trackId: string;
  /** The time a snap landed on, so the lane can draw a guide. */
  snappedTo: number | null;
}

export interface LaneRect {
  trackId: string;
  kind: LaneKind;
  top: number;
  bottom: number;
}

const MIN_CLIP = 0.1;
/** Snap radius in SCREEN pixels, so it feels the same at every zoom. */
const SNAP_PX = 6;

interface Origin {
  id: string;
  mode: DragMode;
  pointerX: number;
  start: number;
  duration: number;
  trackId: string;
  kind: LaneKind;
  lanes: LaneRect[];
  targets: number[];
}

/**
 * One pointer gesture, three behaviours: move a clip along its lane, trim either
 * edge, or carry it to another lane.
 *
 * The whole drag is LOCAL state. It commits exactly once, on pointerup — driving
 * the store from pointermove would push sixty history entries per drag and make
 * undo useless, and re-rendering the project on every frame would fight the
 * pointer. Nothing is persisted until you let go.
 */
export function useClipDrag({
  project,
  pxPerSec,
  snap,
  playhead,
}: {
  project: VideoProject | null;
  pxPerSec: number;
  snap: boolean;
  playhead: number;
}) {
  const apply = useVideo((s) => s.apply);
  const select = useVideo((s) => s.select);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const origin = useRef<Origin | null>(null);

  /** Every edge a drag could latch onto, except the dragged clip's own. */
  const snapTargets = useCallback(
    (excludeId: string): number[] => {
      const out = [0, playhead];
      for (const track of project?.tracks ?? [])
        for (const clip of track.clips) {
          if (clip.id === excludeId) continue;
          out.push(clip.start, clip.start + clip.duration);
        }
      // Captions latch to picture and to each other too — lining a title up with
      // the cut it belongs to is the single most common thing you do with one.
      for (const overlay of project?.overlays ?? []) {
        if (overlay.id === excludeId) continue;
        out.push(overlay.start, overlay.end);
      }
      return out;
    },
    [project, playhead],
  );

  const begin = useCallback(
    (
      event: React.PointerEvent,
      clip: { id: string; start: number; duration: number },
      trackId: string,
      kind: LaneKind,
      mode: DragMode,
      lanes: LaneRect[],
    ) => {
      // Let a plain click through to selection; only a real drag captures.
      event.preventDefault();
      event.stopPropagation();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      select(clip.id);
      origin.current = {
        id: clip.id,
        mode,
        pointerX: event.clientX,
        start: clip.start,
        duration: clip.duration,
        trackId,
        kind,
        lanes,
        targets: snapTargets(clip.id),
      };
      setPreview({
        id: clip.id,
        mode,
        start: clip.start,
        duration: clip.duration,
        trackId,
        snappedTo: null,
      });
    },
    [select, snapTargets],
  );

  const move = useCallback(
    (event: React.PointerEvent) => {
      const o = origin.current;
      if (!o) return;
      const delta = (event.clientX - o.pointerX) / pxPerSec;
      // ⌥ suspends snapping for the frames it is held, which is how you place a
      // clip a few frames off a neighbour on purpose.
      const active = snap && !event.altKey;

      const latch = (value: number): [number, number | null] => {
        if (!active) return [value, null];
        let best: number | null = null;
        let bestGap = SNAP_PX / pxPerSec;
        for (const t of o.targets) {
          const gap = Math.abs(t - value);
          if (gap <= bestGap) {
            bestGap = gap;
            best = t;
          }
        }
        return best === null ? [value, null] : [best, best];
      };

      if (o.mode === 'move') {
        const [head, snappedHead] = latch(Math.max(0, o.start + delta));
        // Snap the tail too — butting a clip up against the NEXT one is just as
        // common as aligning its head, and only checking the head misses it.
        const [tail, snappedTail] = latch(Math.max(0, o.start + delta) + o.duration);
        const useTail = snappedHead === null && snappedTail !== null;
        const start = Math.max(0, useTail ? tail - o.duration : head);

        let trackId = o.trackId;
        if (o.kind === 'visual') {
          const lane = o.lanes.find(
            (l) => l.kind === 'visual' && event.clientY >= l.top && event.clientY < l.bottom,
          );
          if (lane) trackId = lane.trackId;
        }
        setPreview({
          id: o.id,
          mode: o.mode,
          start,
          duration: o.duration,
          trackId,
          snappedTo: useTail ? snappedTail : snappedHead,
        });
        return;
      }

      if (o.mode === 'trim-in') {
        const limit = o.start + o.duration - MIN_CLIP;
        const [raw, snapped] = latch(Math.min(limit, Math.max(0, o.start + delta)));
        const start = Math.min(limit, Math.max(0, raw));
        setPreview({
          id: o.id,
          mode: o.mode,
          start,
          duration: o.start + o.duration - start,
          trackId: o.trackId,
          snappedTo: snapped,
        });
        return;
      }

      const [rawEnd, snapped] = latch(o.start + o.duration + delta);
      const end = Math.max(o.start + MIN_CLIP, rawEnd);
      setPreview({
        id: o.id,
        mode: o.mode,
        start: o.start,
        duration: end - o.start,
        trackId: o.trackId,
        snappedTo: snapped,
      });
    },
    [pxPerSec, snap],
  );

  const end = useCallback(() => {
    const o = origin.current;
    const p = preview;
    origin.current = null;
    setPreview(null);
    if (!o || !p) return;

    // A caption has no source to keep in sync, so all three gestures are just a
    // new start/end pair. Trimming one is genuinely resizing it, not choosing a
    // different part of a recording.
    if (o.kind === 'text') {
      if (p.start === o.start && p.duration === o.duration) return;
      apply((proj) =>
        updateOverlay(proj, o.id, { start: p.start, end: p.start + p.duration }),
      );
      return;
    }

    if (o.mode === 'move') {
      if (p.trackId !== o.trackId) {
        apply((proj) => setClipTrack(proj, o.id, p.trackId, p.start));
      } else if (p.start !== o.start) {
        apply((proj) => moveClip(proj, o.id, p.start));
      }
      return;
    }

    if (o.mode === 'trim-in') {
      const delta = p.start - o.start;
      if (delta !== 0) apply((proj) => trimClip(proj, o.id, 'in', delta));
      return;
    }

    const delta = p.duration - o.duration;
    if (delta !== 0) apply((proj) => trimClip(proj, o.id, 'out', delta));
  }, [apply, preview]);

  return { preview, begin, move, end };
}
