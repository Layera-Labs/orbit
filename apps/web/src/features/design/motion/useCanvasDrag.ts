import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { VideoProject } from '@layera-labs/orbit-video/browser';
import { findClip, findOverlay, setClipRect, updateOverlay, useVideo } from '@/store/videoStore';
import { pickAt } from './pick';

/** Travel before a press counts as a drag rather than a click. */
const SLOP = 3;

interface Grab {
  id: string;
  /** Where the pointer started, in client pixels. */
  px: number;
  py: number;
  /** The thing's position when the grab began, normalized 0..1. */
  ox: number;
  oy: number;
  kind: 'overlay' | 'clip';
  moved: boolean;
  /** The document before the gesture — the state one undo returns to. */
  before: VideoProject;
}

/**
 * Move a caption or a picture-in-picture clip by dragging it on the canvas.
 *
 * Position is already normalized in the model (`TextOverlay.x/y` is an anchor,
 * `VisualTrackClip.rect` a fraction of the frame), so a drag is a pointer delta
 * over the displayed size — no matter what the canvas is scaled to.
 *
 * Only things that HAVE a position move. A base clip filling the frame has no
 * `rect`, and inventing one on a drag would silently convert a full-frame shot
 * into a floating inset: the click still selects it, and it stays put.
 */
export function useCanvasDrag(project: VideoProject, time: number) {
  const grab = useRef<Grab | null>(null);
  const select = useVideo((s) => s.select);
  const stage = useVideo((s) => s.stage);
  const commit = useVideo((s) => s.commit);

  /** Client pixels → a fraction of the frame. */
  const scaleOf = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { fx: 1 / r.width, fy: 1 / r.height, r };
  };

  return {
    onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
      if (e.button !== 0) return;
      const { r } = scaleOf(e.currentTarget);
      const id = pickAt(
        project,
        time,
        ((e.clientX - r.left) / r.width) * project.width,
        ((e.clientY - r.top) / r.height) * project.height,
      );
      select(id);
      if (!id) return;

      const overlay = findOverlay(project, id);
      const clip = findClip(project, id)?.clip;
      // A clip without a rect is the full frame; there is nothing to move.
      const rect = clip && 'rect' in clip ? clip.rect : undefined;
      if (!overlay && !rect) return;

      grab.current = {
        id,
        px: e.clientX,
        py: e.clientY,
        ox: overlay ? overlay.x : (rect?.x ?? 0),
        oy: overlay ? overlay.y : (rect?.y ?? 0),
        kind: overlay ? 'overlay' : 'clip',
        moved: false,
        before: project,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },

    onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
      const g = grab.current;
      if (!g) return;
      const dx = e.clientX - g.px;
      const dy = e.clientY - g.py;
      if (!g.moved && Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      g.moved = true;

      const { fx, fy } = scaleOf(e.currentTarget);
      /*
       * Clamped so a caption cannot be dragged off the frame entirely and
       * become unreachable — its anchor stays inside the picture even though
       * the text around it may hang over an edge, which is a legitimate look.
       */
      const x = Math.min(1, Math.max(0, g.ox + dx * fx));
      const y = Math.min(1, Math.max(0, g.oy + dy * fy));

      // `stage`, not `apply`: one history entry for the whole gesture, written
      // by `commit` on release.
      stage((p) =>
        g.kind === 'overlay'
          ? updateOverlay(p, g.id, { x, y })
          : (() => {
              const rect = (findClip(p, g.id)?.clip as { rect?: { w: number; h: number } })
                ?.rect;
              return rect ? setClipRect(p, g.id, { ...rect, x, y }) : p;
            })(),
      );
    },

    onPointerUp() {
      const g = grab.current;
      grab.current = null;
      if (g?.moved) commit(g.before);
    },

    onPointerCancel() {
      const g = grab.current;
      grab.current = null;
      // Put it back where it was — a cancelled gesture is not an edit.
      if (g?.moved) stage(() => g.before);
    },
  };
}
