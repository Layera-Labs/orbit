import {
  frameStateAt,
  overlayBox,
  overlayFontOptions,
  type VideoProject,
} from '@orbit/video/browser';
import { loadedCaptionFonts } from '../../../net/fonts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * What is on screen right now, topmost last, with a box you can point at.
 *
 * Built from `frameStateAt` rather than from the project, so the canvas agrees
 * with what is actually being composited: a clip that has not started, a
 * caption past its end, or anything the compositor drops for its own reasons is
 * absent here too. The one thing it cannot take from the ops is an overlay's
 * box — `DrawOp.dst` for a caption is the whole frame — so that comes from
 * `overlayBox`, the same measurement that sizes a caption's background.
 */
export function hitBoxesAt(project: VideoProject, time: number): { id: string; box: Box }[] {
  const overlays = new Map(project.overlays.map((o) => [o.id, o]));
  const out: { id: string; box: Box }[] = [];

  const fonts = loadedCaptionFonts();
  for (const op of frameStateAt(project, time, { fonts })) {
    if (op.kind === 'background') continue;
    if (op.kind === 'overlay') {
      const o = overlays.get(op.id);
      if (!o) continue;
      // Measured with the same face the renderer just drew with, or the click
      // target sits somewhere the caption visibly is not.
      const b = overlayBox(o, project.width, project.height, overlayFontOptions(o, fonts)?.measure);
      // The op's `dst` carries the keyframed offset from the anchor, so a
      // caption that animates across the frame is outlined where it IS, not
      // where it was authored.
      out.push({ id: op.id, box: { ...b, x: b.x + op.dst.x, y: b.y + op.dst.y } });
      continue;
    }
    out.push({ id: op.id, box: op.dst });
  }
  return out;
}

/** The selected thing's box, or null when it is not on screen at this time. */
export function boxOf(project: VideoProject, time: number, id: string | null): Box | null {
  if (!id) return null;
  return hitBoxesAt(project, time).find((h) => h.id === id)?.box ?? null;
}

/**
 * What the pointer is over, in project pixels.
 *
 * Topmost first, because that is what a click means: the thing you can see. A
 * full-frame base clip is under every caption, so walking the other way would
 * make it impossible to select anything else.
 */
export function pickAt(
  project: VideoProject,
  time: number,
  x: number,
  y: number,
): string | null {
  const hits = hitBoxesAt(project, time);
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const b = hits[i].box;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return hits[i].id;
  }
  return null;
}
