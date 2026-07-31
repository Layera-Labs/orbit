/**
 * Direct manipulation on the preview: a selected clip's bounding box, four
 * corner handles that resize it, four mid-edge handles that trim the picture,
 * and a rotate handle on a stalk above.
 *
 * Two structural decisions worth stating.
 *
 * **These are RN views over the canvas, not shapes inside it.** Gesture Handler
 * attaches to native views, so each handle gets real arbitration and its own
 * `hitSlop` — a 9pt dot needs a ~44pt touch target, and hand-rolled hit-testing
 * inside the one canvas-wide pan gesture could give it neither. Keeping the
 * chrome outside `<Canvas>` also makes it structurally impossible for it to
 * leak into anything the canvas renders, which matters because the Skia tree is
 * meant to be exactly what `frameStateAt` describes and nothing else. Captions
 * already overlay this canvas the same way.
 *
 * **A drag reports live, and commits once.** Resize and crop change the box on
 * every pointer frame; writing that through the store would clone the project,
 * re-render the timeline and the editor chrome, and queue a save and a sync
 * sixty times a second. Instead the live value goes straight back to the
 * preview (which is the only thing that needs to redraw) and the store is
 * written once on release — one undo step per gesture, the same rule the web
 * editor's `useClipDrag` follows.
 */
import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";
import { vela } from "../constants";
import { VIcon } from "./VIcon";
import type { Rect, SourceRect, VisualTrackClip } from "../model/types";
import {
  cropFromEdge,
  normalizeRotation,
  resizeFromCorner,
  snapAngle,
  type Corner,
  type Edge,
} from "../preview/transform";

/** What a drag has changed so far. Absent fields are unchanged. */
export interface TransformPatch {
  rect?: Rect;
  rotation?: number;
  crop?: SourceRect;
}

const DOT = 9;
const SLOP = { top: 16, bottom: 16, left: 16, right: 16 };
/** How far above the top edge the rotate handle floats, and its stalk length. */
const STALK = 26;

const CORNERS: { key: Corner; style: object }[] = [
  { key: "tl", style: { left: -DOT / 2, top: -DOT / 2 } },
  { key: "tr", style: { right: -DOT / 2, top: -DOT / 2 } },
  { key: "bl", style: { left: -DOT / 2, bottom: -DOT / 2 } },
  { key: "br", style: { right: -DOT / 2, bottom: -DOT / 2 } },
];

export function PreviewTransformHandles({
  clip,
  box,
  width,
  height,
  canvasGesture,
  onLive,
  onCommit,
}: {
  clip: VisualTrackClip;
  /** The clip's UNROTATED box in canvas pixels. */
  box: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
  /** The canvas's own pan/tap, so a handle can take priority over it. */
  canvasGesture: React.MutableRefObject<GestureType | undefined>;
  onLive: (patch: TransformPatch | null) => void;
  onCommit: (patch: TransformPatch) => void;
}) {
  const deg = normalizeRotation(clip.rotation);
  // Snapshotted on gesture start: every frame is computed from the ORIGINAL
  // geometry plus the total translation, so a dropped frame cannot accumulate.
  const start = useRef({
    rect: clip.rect ?? { x: 0, y: 0, w: 1, h: 1 },
    crop: clip.crop,
    rotation: deg,
  });
  const begin = () => {
    start.current = {
      rect: clip.rect ?? { x: 0, y: 0, w: 1, h: 1 },
      crop: clip.crop,
      rotation: normalizeRotation(clip.rotation),
    };
  };

  /** One handle: live on every frame, one store write on release. */
  const handle = (compute: (dx: number, dy: number) => TransformPatch) =>
    Gesture.Pan()
      .runOnJS(true)
      // Beat the canvas's own pan and tap whichever would activate first, so a
      // handle never depends on gesture ordering.
      .blocksExternalGesture(canvasGesture as never)
      .onBegin(begin)
      .onUpdate((e) => onLive(compute(e.translationX, e.translationY)))
      .onEnd((e) => onCommit(compute(e.translationX, e.translationY)))
      // Also runs on cancel, so an interrupted drag drops back to the stored
      // value instead of stranding the live one.
      .onFinalize(() => onLive(null));

  const cornerGesture = (corner: Corner) =>
    handle((dx, dy) => ({
      rect: resizeFromCorner(
        start.current.rect,
        start.current.rotation,
        corner,
        dx,
        dy,
        width,
        height,
      ),
    }));

  const edgeGesture = (edge: Edge) =>
    handle((dx, dy) =>
      cropFromEdge(
        start.current.rect,
        start.current.crop,
        start.current.rotation,
        edge,
        dx,
        dy,
        width,
        height,
      ),
    );

  /*
   * Rotation by a handle rather than two fingers: on a phone-sized stage two
   * fingers cover the thing being turned, a combined pinch-and-rotate drags the
   * size along with every rotation, and a gesture that snaps to 15 degrees
   * feels like fighting the OS. A handle can do all three honestly.
   *
   * The angle is measured from where the finger STARTED, not from the handle's
   * position, so the box never jumps to meet the finger on the first frame.
   */
  const rotateGesture = handle((dx, dy) => {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    // The handle's resting position, in canvas pixels, before this drag.
    const rad = (start.current.rotation * Math.PI) / 180;
    const armX = 0;
    const armY = -(box.h / 2 + STALK);
    const hx = cx + (armX * Math.cos(rad) - armY * Math.sin(rad));
    const hy = cy + (armX * Math.sin(rad) + armY * Math.cos(rad));
    const before = Math.atan2(hy - cy, hx - cx);
    const after = Math.atan2(hy + dy - cy, hx + dx - cx);
    const delta = ((after - before) * 180) / Math.PI;
    return { rotation: snapAngle(start.current.rotation + delta) };
  });

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.frame,
        {
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          // The container carries the rotation, so every handle below can be
          // positioned in the box's own unrotated frame and rides the turn.
          transform: [{ rotate: `${deg}deg` }],
        },
      ]}
    >
      <View style={styles.outline} pointerEvents="none" />

      {CORNERS.map((c) => (
        <GestureDetector key={c.key} gesture={cornerGesture(c.key)}>
          <View
            accessibilityRole="adjustable"
            accessibilityLabel={`Resize from the ${cornerName(c.key)} corner`}
            hitSlop={SLOP}
            style={[styles.dot, c.style]}
          />
        </GestureDetector>
      ))}

      {/* Mid-edge bars, drawn as short bars rather than dots so the two kinds
          of handle are told apart by shape and not only by position. */}
      <GestureDetector gesture={edgeGesture("left")}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Trim the left edge"
          hitSlop={SLOP}
          style={[styles.barV, { left: -3 }]}
        />
      </GestureDetector>
      <GestureDetector gesture={edgeGesture("right")}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Trim the right edge"
          hitSlop={SLOP}
          style={[styles.barV, { right: -3 }]}
        />
      </GestureDetector>
      <GestureDetector gesture={edgeGesture("top")}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Trim the top edge"
          hitSlop={SLOP}
          style={[styles.barH, { top: -3 }]}
        />
      </GestureDetector>
      <GestureDetector gesture={edgeGesture("bottom")}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Trim the bottom edge"
          hitSlop={SLOP}
          style={[styles.barH, { bottom: -3 }]}
        />
      </GestureDetector>

      <View style={styles.stalk} pointerEvents="none" />
      <GestureDetector gesture={rotateGesture}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Rotate"
          hitSlop={SLOP}
          style={styles.rotate}
        >
          <VIcon name="rotate" size={14} color={vela.accent} strokeWidth={2} />
        </View>
      </GestureDetector>
    </View>
  );
}

function cornerName(c: Corner): string {
  return c === "tl"
    ? "top left"
    : c === "tr"
      ? "top right"
      : c === "bl"
        ? "bottom left"
        : "bottom right";
}

const styles = StyleSheet.create({
  frame: { position: "absolute" },
  // A hairline in the accent, not a glow and not a dashed marquee: the picture
  // underneath is the subject, and the box only has to say where it ends.
  outline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: vela.accent,
  },
  dot: {
    position: "absolute",
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: vela.accent,
  },
  barV: {
    position: "absolute",
    top: "50%",
    marginTop: -11,
    width: 6,
    height: 22,
    borderRadius: 3,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: vela.accent,
  },
  barH: {
    position: "absolute",
    left: "50%",
    marginLeft: -11,
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: vela.accent,
  },
  // The arm that makes the handle read as a lever rather than a loose dot.
  // Rounded caps, because a hard-capped hairline reads as a stray rule.
  stalk: {
    position: "absolute",
    left: "50%",
    marginLeft: -1,
    top: -STALK,
    width: 2,
    height: STALK,
    borderRadius: 1,
    backgroundColor: vela.accent,
  },
  rotate: {
    position: "absolute",
    left: "50%",
    marginLeft: -13,
    top: -STALK - 26,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: vela.accent,
  },
});
