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

import {
  xfadeMaskGrid,
  xfadeStateAt,
  xfadeVeilAt,
  type XfMask,
  type XfState,
} from '@layera-labs/video/browser';
import type { TransitionType } from '@layera-labs/video/types';

/** Off-centre on purpose: at exactly half, a symmetric transition says nothing. */
const AT = 0.42;
const S = 34;

/**
 * Cells per side in a mask tile.
 *
 * The mask families are a smooth per-pixel field and SVG has no shader to run
 * one through, so the field is sampled onto a lattice and drawn as cells. Ten
 * is where the shape stops being ambiguous: at this size a cell is ~3.4px, and
 * the four diagonals only tell each other apart by which corner the band leans
 * out of. Higher costs a node per cell on every tile in the sheet for a
 * difference nobody can see at 34px.
 */
const MASK_N = 10;

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
          {/* The veil, in the slot the compositors draw it in: over the picture
              leaving and under the one arriving. Without it Black, White, Blink
              and Light were four tiles identical to Fade — the dip IS the
              transition in those families, and it lives outside `xfadeStateAt`
              because it belongs to neither side. */}
          <Veil type={type} />
          <Side id={`${type}B`} state={xfadeStateAt(type, AT, 'to', S, S)} fill={IN} mark={IN_MARK} />
        </>
      )}
    </svg>
  );
}

/** The full-frame solid a dip or a flash blooms through, if this is one. */
function Veil({ type }: { type: TransitionType }) {
  const v = xfadeVeilAt(type, AT);
  if (!v || v.alpha <= 0) return null;
  return <rect width={S} height={S} fill={v.color} opacity={v.alpha} />;
}

/**
 * The clip window, as a path so a `hole` can be punched out of it.
 *
 * Even-odd, the same primitive the browser compositor uses for squeeze. A plain
 * second `<rect>` in a `<clipPath>` would UNION with the first and punch
 * nothing at all.
 */
function windowPath(
  r: { x: number; y: number; w: number; h: number },
  hole?: { x: number; y: number; w: number; h: number },
): string {
  const box = (b: typeof r) => `M${b.x} ${b.y}H${b.x + b.w}V${b.y + b.h}H${b.x}Z`;
  return hole ? `${box(r)}${box(hole)}` : box(r);
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
      mask={state.mask}
      block={state.block}
      blur={state.blur}
      hole={state.hole}
      scale={state.scale}
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
/**
 * The picture's marks, quantised to the transition's block grid.
 *
 * SVG has no pixelate primitive, so rather than fake one this samples the
 * picture the way ffmpeg's `pixelize` does — one sample per block, at the
 * block's centre — and draws the blocks that land on a mark. The diagonal
 * becomes a staircase and the dot becomes a cross of squares, which is exactly
 * what the renderer does to this picture.
 *
 * The block is a fraction of the frame, so at tile scale it is ~1.4 units:
 * invisible against a flat fill, and clearly visible against a 1.5-unit line,
 * which is why the marks are what carry it.
 */
function blockCells(S: number, block: number, dot: number, stroke: number) {
  const b = Math.max(0.5, block);
  const n = Math.ceil(S / b);
  const cells: { x: number; y: number }[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * b;
      const cy = (j + 0.5) * b;
      const onDot = Math.hypot(cx - S / 2, cy - S / 2) <= dot / 2;
      // Distance from the point to the line y = x.
      const onLine = Math.abs(cx - cy) / Math.SQRT2 <= stroke / 2;
      if (onDot || onLine) cells.push({ x: i * b, y: j * b });
    }
  return { b, cells };
}

/** The soft field a mask family transitions through, as an SVG mask. */
function FieldMask({ id, mask }: { id: string; mask: XfMask }) {
  const cell = S / MASK_N;
  const v = xfadeMaskGrid(mask, MASK_N, S, S);
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={S} height={S}>
      {v.map((a, k) => (
        <rect
          key={k}
          x={(k % MASK_N) * cell}
          y={Math.floor(k / MASK_N) * cell}
          /* Half a cell of overlap. Butt-joined at fractional coordinates the
             renderer antialiases both edges and leaves a seam grid across the
             mask, which reads as a screen door rather than a soft field. */
          width={cell + 0.5}
          height={cell + 0.5}
          fill="#fff"
          opacity={a}
        />
      ))}
    </mask>
  );
}

function Picture({
  id,
  rect,
  mask,
  block,
  blur,
  hole,
  scale,
  fill,
  mark,
  dx = 0,
  dy = 0,
  opacity = 1,
}: {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  mask?: XfMask;
  block?: number;
  blur?: number;
  hole?: { x: number; y: number; w: number; h: number };
  scale?: { x: number; y: number };
  fill: number;
  mark: number;
  dx?: number;
  dy?: number;
  opacity?: number;
}) {
  // About the tile's centre, which is the canvas centre here — the same origin
  // both compositors scale about. Nested inside the travel rather than beside
  // it, so the two compose the way a matrix does.
  const zoom = scale
    ? ` translate(${S / 2} ${S / 2}) scale(${scale.x} ${scale.y}) translate(${-S / 2} ${-S / 2})`
    : '';
  return (
    <g opacity={opacity}>
      <clipPath id={id} clipRule="evenodd">
        <path d={windowPath(rect, hole)} clipRule="evenodd" />
      </clipPath>
      {mask && <FieldMask id={`${id}m`} mask={mask} />}
      {blur ? (
        <filter id={`${id}b`} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
      ) : null}
      <g clipPath={`url(#${id})`} mask={mask ? `url(#${id}m)` : undefined}>
        <g
          transform={`translate(${dx} ${dy})${zoom}`}
          filter={blur ? `url(#${id}b)` : undefined}
        >
          <rect width={S} height={S} fill="currentColor" opacity={fill} />
          {block ? (
            (() => {
              const { b, cells } = blockCells(S, block, 4.8, 1.4);
              return cells.map((c, k) => (
                <rect
                  key={k}
                  x={c.x}
                  y={c.y}
                  width={b}
                  height={b}
                  fill="currentColor"
                  opacity={mark}
                />
              ));
            })()
          ) : (
            <>
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
            </>
          )}
        </g>
      </g>
    </g>
  );
}
