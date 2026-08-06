/**
 * Node-only surface of `@orbit/video`: spawning ffmpeg, rasterizing SVG through
 * the native resvg addon, and fetching font files from disk.
 *
 * Kept out of `./browser` so a web bundle never resolves `node:child_process`
 * or `@resvg/resvg-js`.
 */
export { rasterizeSVG } from './raster';
export { resolveFonts, clearFontCache, isSafeFontFamily } from './google-fonts';
export type { FontResolution, ResolveFontOptions } from './google-fonts';
export { renderProject, killLiveRenders, ffmpegSupportsHdr, ffmpegXfadeTokens } from './render';
export type { RenderResult } from './render';
export type { RenderOptions } from './render';
