/**
 * Default entry: the whole package, browser + node.
 *
 * Node consumers (`apps/render-service`, `packages/video-ai`) keep importing
 * `@orbit/video` unchanged. Browser consumers must import `@orbit/video/browser`
 * instead — this entry pulls in ffmpeg spawning and the native resvg addon.
 */
export * from './browser';
export * from './node';
