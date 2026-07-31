/**
 * Mirror of `gradientEnds` in `packages/video/src/background-svg.ts`.
 *
 * A gradient's two endpoints as FRACTIONS of the box, from its angle: 0deg runs
 * bottom-to-top and the default 180 runs top-to-bottom. The SVG the export and
 * the web preview rasterize uses exactly these numbers as `x1/y1/x2/y2` on a
 * `linearGradient` in objectBoundingBox units, so multiplying them by the
 * canvas size gives Skia the same line.
 *
 * This exists because mobile had its OWN angle arithmetic, and it did not
 * agree: `BackgroundFill` built its line from `cos`/`sin` of the raw angle, so
 * the default 180deg ran RIGHT-TO-LEFT in the preview and top-to-bottom in
 * every export. Every gradient background was drawn at the wrong angle, and
 * because both ends of a two-stop gradient look plausible on their own, nothing
 * about the preview said so.
 *
 * Returns numbers where the shared copy returns 3-decimal strings; the parity
 * test compares them at that precision.
 */
export function gradientEnds(angle: number | undefined): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const a = Number.isFinite(Number(angle)) ? Number(angle) : 180;
  const rad = (a * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  return {
    x1: 0.5 - dx / 2,
    y1: 0.5 - dy / 2,
    x2: 0.5 + dx / 2,
    y2: 0.5 + dy / 2,
  };
}
