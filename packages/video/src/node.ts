/**
 * The WHOLE package, for a Node consumer: everything in `./browser`, plus
 * spawning ffmpeg, rasterizing SVG through the native resvg addon, and reading
 * font files off disk.
 *
 * This is the entry a server imports. It re-exports the browser surface as well
 * so `@layera-labs/video/node` is a superset — a Node caller wants the timeline model
 * and the effect math too, and asking it to import from two specifiers to
 * assemble one package would be a papercut with no upside.
 *
 * The default entry (`.`) is browser-SAFE and does not reach any of this. That
 * is the whole point of the split: a bundler following `@layera-labs/video` must
 * never resolve `node:child_process` or `@resvg/resvg-js`, and
 * `__tests__/browser-safety.test.ts` walks both entries to prove it.
 */
export * from './browser';
export { rasterizeSVG } from './raster';
export { resolveFonts, clearFontCache, isSafeFontFamily } from './google-fonts';
export type { FontResolution, ResolveFontOptions } from './google-fonts';
export { renderProject, killLiveRenders, ffmpegSupportsHdr, ffmpegXfadeTokens } from './render';
export { thumbnailTime } from './render';
export type { RenderResult, RenderWarning, ThumbnailOptions } from './render';
export type { RenderOptions } from './render';
