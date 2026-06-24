/** Konva fill props for a page background (solid or linear-gradient). */
export function backgroundFill(
  bg: { type: string; color?: string; css?: string },
  w: number,
  h: number,
): Record<string, unknown> {
  if (bg.type === 'gradient' && bg.css) {
    const angleMatch = /(-?\d+(?:\.\d+)?)deg/.exec(bg.css);
    const angle = angleMatch ? Number(angleMatch[1]) : 180;
    const stops = [...bg.css.matchAll(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*(\d+(?:\.\d+)?)?%?/g)]
      .map((m) => m[1])
      .filter(Boolean);
    if (stops.length >= 2) {
      const rad = ((angle - 90) * Math.PI) / 180;
      const cx = w / 2;
      const cy = h / 2;
      const dx = (Math.cos(rad) * w) / 2;
      const dy = (Math.sin(rad) * h) / 2;
      const colorStops: (number | string)[] = [];
      stops.forEach((color, i) => {
        colorStops.push(i / (stops.length - 1), color);
      });
      return {
        fillLinearGradientStartPoint: { x: cx - dx, y: cy - dy },
        fillLinearGradientEndPoint: { x: cx + dx, y: cy + dy },
        fillLinearGradientColorStops: colorStops,
      };
    }
  }
  return { fill: bg.type === 'solid' ? bg.color ?? '#ffffff' : '#ffffff' };
}
