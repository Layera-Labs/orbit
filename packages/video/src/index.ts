/**
 * Default entry — BROWSER-SAFE.
 *
 * Importing `@orbit/video` gets you the timeline model, the effect math, the
 * filtergraph builder and `frameStateAt`, and resolves no `node:` builtin and
 * no native addon. It is `./browser` under another name.
 *
 * This used to be `browser + node`, which made the safe thing the thing you had
 * to know to ask for: a web bundler following the package name walked straight
 * into `node:child_process` and `@resvg/resvg-js`, and the failure arrived as
 * an unreadable bundler error in a different repo. The default is now the safe
 * one, and a Node consumer names what it needs.
 *
 * Node consumers import `@orbit/video/node`, which is a SUPERSET — everything
 * here, plus ffmpeg spawning, SVG rasterizing and font resolution.
 *
 * `__tests__/browser-safety.test.ts` walks BOTH this entry and `./browser` and
 * asserts neither reaches a node-only module.
 */
export * from './browser';
