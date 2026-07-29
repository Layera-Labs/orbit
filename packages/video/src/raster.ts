import { Resvg } from '@resvg/resvg-js';
import { assertNoExternalRefs } from './svg';

/**
 * Rasterize an SVG string to a PNG buffer. Uses resvg (which renders text
 * itself), so the ffmpeg build does not need libfreetype/drawtext. `fontFiles`
 * (downloaded Google Font TTFs) are loaded so caption fonts match the preview.
 *
 * resvg resolves `<image href>` against the local filesystem and gives no
 * option to turn that off, so this is the last line where a reference can be
 * refused before it becomes a file read. Both callers build their SVG from a
 * fixed set of shapes and never emit a reference; if one appears, the string
 * was tampered with and rendering it is the wrong move.
 */
export function rasterizeSVG(svg: string, fontFiles: string[] = []): Buffer {
  assertNoExternalRefs(svg);
  const resvg = new Resvg(svg, { font: { loadSystemFonts: true, fontFiles } });
  return resvg.render().asPng();
}
