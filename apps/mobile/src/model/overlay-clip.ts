/**
 * An `ImageOverlay`, expressed as the `VisualTrackClip` every renderer already
 * knows how to draw — VENDORED from `packages/video/src/overlay-clip.ts`.
 *
 * ⚠️  CANONICAL SOURCE: packages/video/src/overlay-clip.ts — keep in sync.
 *     `__tests__/overlayClip.test.ts` imports BOTH by relative path and asserts
 *     they answer identically, which is the only thing that actually holds two
 *     hand-copies together.
 *
 * ## Why a conversion and not a fourth renderer
 *
 * A picture on the overlay stack is, pixel for pixel, the thing a
 * picture-in-picture image clip already is: a source, a normalized box, a
 * rotation, an opacity, a mask, a Ken-Burns move, an entrance and an exit. All
 * three renderers implement that today and their agreement is measured. Writing
 * an image-overlay path beside it would be a second implementation of the same
 * question — the exact failure this engine is built to prevent — and it would
 * need its own dual-render proof, its own rotation rounding, its own even-
 * dimension handling.
 *
 * So there is ONE function, here, and the export, the canvas preview and the
 * Skia preview all draw its result down their existing clip paths. A bug in the
 * placement is a bug in one function, visible in all three at once, rather than
 * a divergence hiding in whichever surface nobody looked at.
 *
 * ## The two things the conversion actually decides
 *
 * **The anchor.** `x`/`y` on an overlay is the CENTRE of its box (see
 * `ImageOverlay`), and a clip"s `rect` is its top-left corner. Converting is a
 * half-size shift, and it is the only arithmetic here that could be wrong in a
 * way that still looks plausible — a sticker off by half its own width reads as
 * "placed a bit oddly", not as broken.
 *
 * **Keyframed position.** A caption"s keyframes are a DELTA from its anchor; a
 * clip"s REPLACE the rect origin (`frame.ts`, "keyframed position replaces the
 * rect origin"). An overlay keyframe means "put the centre here", so each point
 * is shifted by the same half-size — otherwise a sticker keyframed to the middle
 * of the frame arrives with its top-left corner there and its body hanging down
 * and to the right.
 */
import { resolveAnim } from "../preview/elementAnim";
import type { ImageOverlay, Keyframe, Overlay, VisualTrackClip } from "./types";

/** Narrow an overlay list to pictures. */
export function imageOverlaysOf(overlays: readonly Overlay[]): ImageOverlay[] {
  return overlays.filter((o): o is ImageOverlay => o.type === "image");
}

/**
 * The smallest window a converted overlay may claim.
 *
 * A zero-length clip makes `trim=duration=0` and a `between(t,S,S)` that is
 * true for exactly one instant, which ffmpeg renders as nothing and the preview
 * renders as a flash. Refusing the degenerate case here means neither surface
 * has to.
 */
const MIN_WINDOW = 0.001;

/** Shift keyframed positions from "where the centre goes" to "where the corner goes". */
function cornerKeyframes(kfs: Keyframe[], w: number, h: number): Keyframe[] {
  return kfs.map((k) => ({ ...k, x: k.x - w / 2, y: k.y - h / 2 }));
}

/**
 * One image overlay as a clip.
 *
 * Fields are added conditionally rather than spread with `undefined`, because
 * the renderers branch on PRESENCE — `rotation` decides whether the export
 * inserts `format=rgba` (without which a rotated layer gets opaque black
 * corners), and `hasFade` joins the condition that picks `yuva420p`. An
 * overlay with no rotation must produce a clip with no `rotation` key, or its
 * filtergraph stops matching the one a plain picture-in-picture produces.
 */
export function imageOverlayAsClip(o: ImageOverlay): VisualTrackClip {
  const w = Math.max(0, o.width);
  const h = Math.max(0, o.height);
  const anim = resolveAnim(o);
  return {
    id: o.id,
    type: "image",
    src: o.src,
    start: o.start,
    duration: Math.max(MIN_WINDOW, o.end - o.start),
    // The anchor is the centre; a rect is a corner.
    rect: { x: o.x - w / 2, y: o.y - h / 2, w, h },
    ...(o.rotation ? { rotation: o.rotation } : {}),
    ...(o.opacity != null ? { opacity: o.opacity } : {}),
    ...(o.mask ? { mask: o.mask } : {}),
    ...(o.motion ? { motion: o.motion } : {}),
    ...(o.keyframes?.length ? { keyframes: cornerKeyframes(o.keyframes, w, h) } : {}),
    /*
     * Normalized through `resolveAnim` rather than copied. `VisualTrackClip`
     * has no legacy `animation` field, so an overlay still carrying one would
     * silently lose its fade on the way across — and `resolveAnim` is already
     * the one place that decides what that legacy value means.
     */
    ...(anim.in ? { animateIn: anim.in } : {}),
    ...(anim.out ? { animateOut: anim.out } : {}),
  };
}
