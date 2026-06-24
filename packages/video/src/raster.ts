import { Resvg } from '@resvg/resvg-js';

/**
 * Rasterize an SVG string to a PNG buffer. Uses resvg (which renders text
 * itself), so the ffmpeg build does not need libfreetype/drawtext.
 */
export function rasterizeSVG(svg: string): Buffer {
  const resvg = new Resvg(svg, { font: { loadSystemFonts: true } });
  return resvg.render().asPng();
}
