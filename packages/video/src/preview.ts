/**
 * The browser preview compositor — the other half of the dual-render rule.
 *
 * `frameStateAt` says what a frame IS; this executes that description on a
 * canvas. It computes nothing of its own: every rect, alpha, blur sigma, motion
 * transform and caption SVG arrives already resolved, from the same functions
 * the ffmpeg path calls. That is what makes the preview and the file agree, and
 * it is why this belongs in the package rather than in one app that happens to
 * have written it first.
 *
 * ## Why a separate subpath instead of `./browser`
 *
 * This touches `document`, WebGL and `AudioContext`. `./node` re-exports
 * `./browser`, and `./node` is what the render service imports — a service with
 * no DOM at all. Folding the compositor into `./browser` would put a
 * `document.createElement` in the import graph of a headless encoder, and
 * `browser-safety.test.ts` would not catch it because it looks for `node:`
 * builtins, not for the other direction.
 *
 * ## React is not here
 *
 * Everything on this entry is framework-free. `usePreview`, which binds it all
 * to a component, lives on `./preview-react` behind an optional peer, so a
 * consumer driving the compositor from its own loop never resolves React at
 * all.
 */
export { PlaybackClock } from './preview/clock';
export { AudioGraph } from './preview/audio';
export { MediaPool } from './preview/sources';
export type { Decoded } from './preview/sources';
export { cutoutIsSupported, applyCutout } from './preview/cutout';
export { gradeIsExact, filterFor, filterString } from './preview/grade';
export {
  renderFrame,
  cssFilter,
  supportsCanvasFilter,
  duplicatedSrcs,
} from './preview/compose';
export type { ComposeDeps } from './preview/compose';
