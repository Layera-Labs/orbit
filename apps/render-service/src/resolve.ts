/**
 * Security boundary for media `src` values coming from clients.
 *
 * Clients upload media and reference it by an opaque `upload:<id>` token. These
 * helpers (1) reject any client `src` that isn't a token or http(s) URL, and
 * (2) map tokens back to files strictly INSIDE the media dir — so a client can
 * never coax ffmpeg into reading an arbitrary server path.
 */
import { resolve as pathResolve, sep } from 'node:path';

/** Allowed `src` shapes in a CLIENT render request: upload token or http(s) URL. */
export function isClientSrc(src: string): boolean {
  return /^upload:[A-Za-z0-9._-]+$/.test(src) || /^https?:\/\//.test(src);
}

/** Map an `upload:<id>` token to a path inside `mediaDir`; pass other srcs
 *  through; throw if a token would escape the media dir. */
export function makeResolveSrc(mediaDir: string): (src: string) => string {
  const base = pathResolve(mediaDir);
  return (src: string) => {
    const m = /^upload:([A-Za-z0-9._-]+)$/.exec(src);
    if (!m) return src;
    const full = pathResolve(mediaDir, m[1]);
    if (full === base || !full.startsWith(base + sep)) {
      throw new Error(`invalid media reference: ${src}`);
    }
    return full;
  };
}
