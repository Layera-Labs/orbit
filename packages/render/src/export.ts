import type Konva from 'konva';

export interface RasterExportOptions {
  pageWidth: number;
  pageHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  format?: 'png' | 'jpeg';
  /** Output scale relative to the page's native pixel size (1 = exact). */
  scale?: number;
  quality?: number;
  /** Solid fill drawn behind the page (e.g. white for JPEG). */
  background?: string;
}

/**
 * Export the page region of a live Konva stage to a data URL at the page's
 * native resolution, independent of the current on-screen zoom.
 */
export function exportStageToDataURL(
  stage: Konva.Stage,
  opts: RasterExportOptions,
): string {
  const { pageWidth, pageHeight, zoom, panX, panY } = opts;
  const scale = opts.scale ?? 1;
  return stage.toDataURL({
    x: panX,
    y: panY,
    width: pageWidth * zoom,
    height: pageHeight * zoom,
    pixelRatio: scale / zoom,
    mimeType: opts.format === 'jpeg' ? 'image/jpeg' : 'image/png',
    quality: opts.quality ?? 0.92,
  });
}

export function dataURLToBlob(dataURL: string): Blob {
  const [header, body] = dataURL.split(',');
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(body);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
