import { Resvg } from '@resvg/resvg-js';

/**
 * Rasterize an SVG string to a PNG buffer. Uses resvg (which renders text
 * itself), so the ffmpeg build does not need libfreetype/drawtext. `fontFiles`
 * (downloaded Google Font TTFs) are loaded so caption fonts match the preview.
 */
export function rasterizeSVG(svg: string, fontFiles: string[] = []): Buffer {
  const resvg = new Resvg(svg, { font: { loadSystemFonts: true, fontFiles } });
  return resvg.render().asPng();
}
