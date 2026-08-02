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
  G,
  Line,
  Rect,
} from "react-native-svg";
import { View } from "react-native";
import { vela } from "../constants";
import { xfadeStateAt, type XfState } from "../preview/xfade";
import type { TransitionType } from "../model/types";

/**
 * How far through to freeze it. Off-centre on purpose — at exactly half, a
 * symmetric transition says nothing about which way it is going.
 */
const AT = 0.42;

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
            <Side id={`${type}B`} size={size} state={xfadeStateAt(type, AT, "to", size, size)} tone={IN} mark={IN_MARK} />
          </>
        )}
      </Svg>
    </View>
  );
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
      tone={tone}
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
 * The same two-layer shape both compositors use — clip to the region, move the
 * content — so a tile that looks wrong is evidence about the renderer and not
 * about this file.
 */
function Picture({
  id,
  size,
  rect,
  tone,
  mark,
  dx = 0,
  dy = 0,
  opacity = 1,
}: {
  id: string;
  size: number;
  rect: { x: number; y: number; w: number; h: number };
  tone: string;
  mark: string;
  dx?: number;
  dy?: number;
  opacity?: number;
}) {
  const d = Math.max(4, Math.round(size * 0.15));
  return (
    <G opacity={opacity}>
      <Defs>
        <ClipPath id={id}>
          <Rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>
        <G translateX={dx} translateY={dy}>
          <Rect width={size} height={size} fill={tone} />
          <Line
            x1={0}
            y1={0}
            x2={size}
            y2={size}
            stroke={mark}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <Circle cx={size / 2} cy={size / 2} r={d / 2} fill={mark} />
        </G>
      </G>
    </G>
  );
}
