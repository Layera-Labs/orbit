/**
 * A transition, drawn as itself.
 *
 * Not an icon of a wipe — a wipe, frozen partway through and laid out by
 * `xfadeStateAt`, the same function that lays out the canvas preview and that
 * the export was measured against. So the picker cannot depict something the
 * renderer does not do, and a family that lands in `xfadeStateAt` gets a
 * correct tile with nothing drawn by hand.
 *
 * **The diagonal is what tells the four families apart.** Wipe, Push, Slide and
 * Reveal all split the frame at the same place at the same instant, so on flat
 * fills their tiles are identical; a dot at each picture's centre is not enough
 * either, because the arriving picture is still mostly off-frame this early and
 * its dot with it. A line corner to corner is always partly visible wherever
 * its picture sits, so it reads out both halves at once: wipe is one unbroken
 * diagonal, push restarts at the seam, slide is displaced AND restarts, reveal
 * is displaced on the left and still runs to the far corner on the right.
 *
 * Everything is `currentColor` at a few opacities, so the tile brightens with
 * its own label on hover and selection instead of carrying a second colour
 * system that has to be kept in step with the button around it.
 */
'use client';

import { xfadeStateAt, type XfState } from '@orbit/video/browser';
import type { TransitionType } from '@orbit/video';

/** Off-centre on purpose: at exactly half, a symmetric transition says nothing. */
const AT = 0.42;
const S = 34;

const OUT = 0.16;
const OUT_MARK = 0.42;
const IN = 0.5;
const IN_MARK = 0.95;

export function TransitionTile({ type }: { type: TransitionType }) {
  const half = S / 2 - 1.5;
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      width="100%"
      height={S}
      aria-hidden
      style={{ display: 'block', borderRadius: 4 }}
    >
      {/* No base fill for a cut: the gap between the halves is meant to show
          the button through it, and a full-size rectangle underneath closes it
          up — which made the cut tile identical to a wipe. */}
      {type !== 'cut' && <rect width={S} height={S} fill="currentColor" opacity={OUT} />}
      {type === 'cut' ? (
        /* A cut has no state to ask for. Both halves hold a WHOLE picture
           behind their own window, so the marks stay at the frame's centre and
           the seam cuts through them — which is what separates this tile from a
           wipe frozen at the same instant. */
        <>
          <Picture id="cutA" rect={{ x: 0, y: 0, w: half, h: S }} fill={OUT} mark={OUT_MARK} />
          <Picture id="cutB" rect={{ x: S / 2 + 1.5, y: 0, w: half, h: S }} fill={IN} mark={IN_MARK} />
        </>
      ) : (
        <>
          <Side id={`${type}A`} state={xfadeStateAt(type, AT, 'from', S, S)} fill={OUT} mark={OUT_MARK} />
          <Side id={`${type}B`} state={xfadeStateAt(type, AT, 'to', S, S)} fill={IN} mark={IN_MARK} />
        </>
      )}
    </svg>
  );
}

/** One side: its region of the frame, and where its picture sits in it. */
function Side({
  id,
  state,
  fill,
  mark,
}: {
  id: string;
  state: XfState;
  fill: number;
  mark: number;
}) {
  const r = state.clip ?? { x: 0, y: 0, w: S, h: S };
  if (r.w <= 0 || r.h <= 0 || state.alpha <= 0) return null;
  return (
    <Picture
      id={id}
      rect={r}
      fill={fill}
      mark={mark}
      dx={state.dx ?? 0}
      dy={state.dy ?? 0}
      opacity={state.alpha}
    />
  );
}

/**
 * A whole picture, clipped to a window and translated inside it.
 *
 * The same two-layer shape the compositors use — clip to the region, move the
 * content — so a tile that looks wrong is evidence about the renderer.
 */
function Picture({
  id,
  rect,
  fill,
  mark,
  dx = 0,
  dy = 0,
  opacity = 1,
}: {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  fill: number;
  mark: number;
  dx?: number;
  dy?: number;
  opacity?: number;
}) {
  return (
    <g opacity={opacity}>
      <clipPath id={id}>
        <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <g transform={`translate(${dx} ${dy})`}>
          <rect width={S} height={S} fill="currentColor" opacity={fill} />
          <line
            x1={0}
            y1={0}
            x2={S}
            y2={S}
            stroke="currentColor"
            strokeOpacity={mark}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <circle cx={S / 2} cy={S / 2} r={2.4} fill="currentColor" opacity={mark} />
        </g>
      </g>
    </g>
  );
}
