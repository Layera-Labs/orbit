/**
 * Mirror of the geometry half of `packages/video/src/canvas-frame.ts`.
 *
 * Only `hasCanvasFrame` and `canvasFramePx` are here. The SVG builder is NOT
 * mirrored: mobile does not rasterize SVG — it reimplements the background
 * natively in Skia (`Preview.tsx`'s `BackgroundFill`) and draws the mat the
 * same way, as an even-odd `SkPath`. Duplicating the markup builder as well
 * would be a second thing to keep in sync for a string mobile never emits.
 *
 * **`canvasFramePx` is pure in the box it is handed, and mobile hands it the
 * PREVIEW canvas size, not the project size.** That is deliberate and is the
 * same arrangement `mosaicStepPx` already lives under. The parity test in
 * `__tests__/canvasFrame.test.ts` therefore asserts that the two copies are the
 * same FUNCTION — identical output for identical input — not that a preview
 * pixel equals an export pixel. Do not "fix" this into taking project
 * dimensions.
 *
 * The radius clamp is the reason this is shared at all rather than reimplemented
 * inline: an out-of-range radius resolves differently in SVG, in canvas and in
 * Skia, so it is pinned once here and no renderer ever sees a bad one.
 */
import type { Background, CanvasFrame } from "../model/types";

/** Whether this frame would paint anything at all. */
export function hasCanvasFrame(f: CanvasFrame | undefined): f is CanvasFrame {
  if (!f) return false;
  if (!(f.opacity === undefined || f.opacity > 0)) return false;
  return (f.width ?? 0) > 0 || (f.radius ?? 0) > 0;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** The mat in pixels for a `w`×`h` box. */
export function canvasFramePx(
  f: CanvasFrame | undefined,
  w: number,
  h: number,
): { borderPx: number; radiusPx: number; outerRadiusPx: number } {
  if (!f || w <= 0 || h <= 0)
    return { borderPx: 0, radiusPx: 0, outerRadiusPx: 0 };
  const unit = Math.min(w, h);
  const borderPx = clamp(f.width ?? 0, 0, 0.5) * unit;
  const openW = Math.max(0, w - borderPx * 2);
  const openH = Math.max(0, h - borderPx * 2);
  const radiusPx = Math.min(
    clamp(f.radius ?? 0, 0, 0.5) * unit,
    openW / 2,
    openH / 2,
  );
  // Concentric with the opening, and zero when the opening is square — see the
  // shared copy for why a thick band alone must not round a stored frame.
  const outerRadiusPx =
    radiusPx > 0 ? Math.min(radiusPx + borderPx, w / 2, h / 2) : 0;
  return { borderPx, radiusPx, outerRadiusPx };
}

/**
 * What is painted outside the card. Mirror of the shared `frameOuterPaint` — a
 * PHOTO background resolves to black in BOTH, because the frame's PNG cannot
 * carry a photograph in the export and a preview that showed one would be the
 * divergence this file exists to prevent. See the shared copy for the full
 * reasoning.
 */
export type FrameOuterPaint =
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle?: number };

export function frameOuterPaint(bg: Background | undefined): FrameOuterPaint {
  if (!bg) return { kind: "color", color: "#000000" };
  if (bg.type === "color") return { kind: "color", color: bg.color };
  if (bg.type === "gradient")
    return { kind: "gradient", from: bg.from, to: bg.to, angle: bg.angle };
  if (bg.type === "blur") return { kind: "color", color: "#111111" };
  return { kind: "color", color: "#000000" };
}
