/**
 * A transition, drawn as itself.
 *
 * The tile is not an icon of a wipe — it IS a wipe, frozen partway through and
 * laid out by `xfadeStateAt`, the same function that lays out the preview and
 * that the export was measured against. Two consequences worth having: the
 * picker cannot depict something the renderer does not do, and a family that
 * lands in `xfadeStateAt` gets a correct tile for free with nothing drawn by
 * hand.
 *
 * **The diagonal is what tells the four families apart**, and it took a round
 * on the device to find that out. Wipe, Push, Slide and Reveal all split the
 * frame at the same place at the same instant, so on flat fills their tiles are
 * identical; a dot at each picture's centre was not enough either, because the
 * arriving picture is still mostly off-frame this early and its dot with it. A
 * line drawn corner to corner is always partly visible wherever its picture
 * sits, so it reads out both halves at once:
 *
 * - **Wipe** — neither picture moves: one unbroken diagonal across the seam.
 * - **Push** — only the arriving one moves: the left half runs from the tile's
 *   own corner, the right half restarts at the seam.
 * - **Slide** — both move: both halves are displaced, and it breaks at the seam.
 * - **Reveal** — only the leaving one moves: the left half is displaced and the
 *   right half still runs to the tile's own far corner.
 *
 * Deliberately not a glyph in a filled square: the square is the frame and what
 * is inside it is the picture. Both tones are neutral steps of one grey, with
 * the accent kept for selection, so in this sheet colour means "chosen" and
 * nothing else.
 */
import Svg, {
  Circle,
  ClipPath,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Line,
  Mask,
  Path,
  Rect,
} from "react-native-svg";
import { View } from "react-native";
import { vela } from "../constants";
import {
  xfadeMaskGrid,
  xfadeStateAt,
  xfadeVeilAt,
  type XfMask,
  type XfState,
} from "../preview/xfade";
import type { TransitionType } from "../model/types";

/**
 * How far through to freeze it. Off-centre on purpose — at exactly half, a
 * symmetric transition says nothing about which way it is going.
 */
const AT = 0.42;

/**
 * Cells per side in a mask tile.
 *
 * The mask families are a smooth per-pixel field and SVG has no shader to run
 * one through, so the field is sampled onto a lattice and drawn as cells. Ten
 * is where the shape stops being ambiguous: at this size a cell is under 4pt,
 * and the four diagonals only tell each other apart by which corner the band
 * leans out of. Higher costs a node per cell on every tile in the sheet for a
 * difference nobody can see at 38pt.
 */
const MASK_N = 10;

/** The picture leaving. The darker of the two, because it is on its way out. */
const OUT = "#33333c";
const OUT_MARK = "#6a6a78";
/** The picture arriving. */
const IN = "#7e7e8c";
const IN_MARK = "#dcdce4";

export function TransitionTile({
  type,
  size = 38,
  selected = false,
}: {
  type: TransitionType;
  size?: number;
  selected?: boolean;
}) {
  const half = size / 2 - 1.5;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: selected ? vela.accent : "#0000001f",
      }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/*
          * No base fill for a cut: the gap between the two halves is meant to
          * show the SHEET through it, and a full-size rectangle underneath
          * closes it up. Without that the cut tile was a wipe tile — same two
          * tones, same seam position, and the diagonal ran straight through it.
          */}
        {type !== "cut" ? <Rect width={size} height={size} fill={OUT} /> : null}
        {type === "cut" ? (
          /*
           * A cut is the absence of a transition, so there is no state to ask
           * for. Both halves hold a WHOLE picture behind their own window, so
           * the diagonal and the dot stay at the frame's centre and the seam
           * cuts through them — which is what separates this tile from a wipe
           * frozen at the same instant.
           */
          <>
            <Picture id="cutA" size={size} rect={{ x: 0, y: 0, w: half, h: size }} tone={OUT} mark={OUT_MARK} />
            <Picture id="cutB" size={size} rect={{ x: size / 2 + 1.5, y: 0, w: half, h: size }} tone={IN} mark={IN_MARK} />
          </>
        ) : (
          <>
            <Side id={`${type}A`} size={size} state={xfadeStateAt(type, AT, "from", size, size)} tone={OUT} mark={OUT_MARK} />
            {/*
              * The veil, in the same slot the compositors draw it in: over the
              * picture leaving and under the one arriving. Without it Black,
              * White, Blink and Light were four tiles identical to Fade — the
              * dip IS the transition in those families, and it lives outside
              * `xfadeStateAt` because it belongs to neither side.
              */}
            <Veil type={type} size={size} />
            <Side id={`${type}B`} size={size} state={xfadeStateAt(type, AT, "to", size, size)} tone={IN} mark={IN_MARK} />
          </>
        )}
      </Svg>
    </View>
  );
}

/** The full-frame solid a dip or a flash blooms through, if this is one. */
function Veil({ type, size }: { type: TransitionType; size: number }) {
  const v = xfadeVeilAt(type, AT);
  if (!v || v.alpha <= 0) return null;
  return <Rect width={size} height={size} fill={v.color} opacity={v.alpha} />;
}

/** One side of the transition: its region of the frame, and where its picture sits in it. */
function Side({
  id,
  size,
  state,
  tone,
  mark,
}: {
  id: string;
  size: number;
  state: XfState;
  tone: string;
  mark: string;
}) {
  const r = state.clip ?? { x: 0, y: 0, w: size, h: size };
  if (r.w <= 0 || r.h <= 0 || state.alpha <= 0) return null;
  return (
    <Picture
      id={id}
      size={size}
      rect={r}
      mask={state.mask}
      block={state.block}
      blur={state.blur}
      hole={state.hole}
      scale={state.scale}
      tone={tone}
      mark={mark}
      dx={state.dx ?? 0}
      dy={state.dy ?? 0}
      opacity={state.alpha}
    />
  );
}

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
function FieldMask({ id, size, mask }: { id: string; size: number; mask: XfMask }) {
  const cell = size / MASK_N;
  const v = xfadeMaskGrid(mask, MASK_N, size, size);
  return (
    <Mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
      {/*
        * Half a cell of overlap on the size. Butt-joined at fractional
        * coordinates the renderer antialiases both edges of every seam and
        * leaves a grid across the mask, which reads as a screen door rather
        * than a soft field.
        */}
      {v.map((a, k) => (
        <Rect
          key={k}
          x={(k % MASK_N) * cell}
          y={Math.floor(k / MASK_N) * cell}
          width={cell + 0.5}
          height={cell + 0.5}
          fill="#fff"
          opacity={a}
        />
      ))}
    </Mask>
  );
}

/**
 * The clip window, as a path so a `hole` can be punched out of it.
 *
 * Even-odd, which is the same primitive `frameOuterPaint` and the Skia
 * compositor use for the canvas frame and for squeeze: two subpaths wound the
 * same way, and the inner one comes out. A plain second `Rect` in a `ClipPath`
 * would UNION with the first and punch nothing.
 */
function windowPath(
  r: { x: number; y: number; w: number; h: number },
  hole?: { x: number; y: number; w: number; h: number },
): string {
  const box = (b: typeof r) =>
    `M${b.x} ${b.y}H${b.x + b.w}V${b.y + b.h}H${b.x}Z`;
  return hole ? `${box(r)}${box(hole)}` : box(r);
}

/**
 * A whole picture, clipped to a window and translated inside it.
 *
 * The same two-layer shape both compositors use — clip to the region, move the
 * content — so a tile that looks wrong is evidence about the renderer and not
 * about this file.
 */
function Picture({
  id,
  size,
  rect,
  mask,
  block,
  blur,
  hole,
  scale,
  tone,
  mark,
  dx = 0,
  dy = 0,
  opacity = 1,
}: {
  id: string;
  size: number;
  rect: { x: number; y: number; w: number; h: number };
  mask?: XfMask;
  block?: number;
  blur?: number;
  hole?: { x: number; y: number; w: number; h: number };
  scale?: { x: number; y: number };
  tone: string;
  mark: string;
  dx?: number;
  dy?: number;
  opacity?: number;
}) {
  const d = Math.max(4, Math.round(size * 0.15));
  const c = size / 2;
  // Computed once: it was being rebuilt three times per cell inside the map.
  const { b: cellSize, cells } = block
    ? blockCells(size, block, d, 1.6)
    : { b: 0, cells: [] as { x: number; y: number }[] };
  return (
    <G opacity={opacity}>
      <Defs>
        <ClipPath id={id}>
          <Path d={windowPath(rect, hole)} clipRule="evenodd" />
        </ClipPath>
      </Defs>
      {mask ? <FieldMask id={`${id}m`} size={size} mask={mask} /> : null}
      {blur ? (
        <Defs>
          <Filter id={`${id}b`} x="-25%" y="-25%" width="150%" height="150%">
            <FeGaussianBlur stdDeviation={blur} />
          </Filter>
        </Defs>
      ) : null}
      <G
        clipPath={`url(#${id})`}
        mask={mask ? `url(#${id}m)` : undefined}
        filter={blur ? `url(#${id}b)` : undefined}
      >
        <G translateX={dx} translateY={dy}>
          {/*
            * About the tile's centre, which is the canvas centre here — the
            * same origin both compositors scale about. Nested inside the
            * travel rather than beside it so the two compose the way a matrix
            * does, matching the single transform list the Skia preview builds.
            */}
          <G
            translateX={scale ? c - c * scale.x : 0}
            translateY={scale ? c - c * scale.y : 0}
            scaleX={scale?.x ?? 1}
            scaleY={scale?.y ?? 1}
          >
            <Rect width={size} height={size} fill={tone} />
            {block ? (
              cells.map((q, k) => (
                <Rect key={k} x={q.x} y={q.y} width={cellSize} height={cellSize} fill={mark} />
              ))
            ) : (
              <>
                <Line
                  x1={0}
                  y1={0}
                  x2={size}
                  y2={size}
                  stroke={mark}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
                <Circle cx={c} cy={c} r={d / 2} fill={mark} />
              </>
            )}
          </G>
        </G>
      </G>
    </G>
  );
}
