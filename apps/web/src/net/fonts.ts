/**
 * Caption font bytes, fetched from the render service.
 *
 * ## Why the browser needs the font at all
 *
 * A caption is drawn from an SVG string, and the preview hands that string to
 * an `<img>`. An SVG loaded that way is a resource-isolated document: it cannot
 * see the page's `@font-face` rules or `document.fonts`. Measured against a
 * `serif` control, a page webfont rendered at EXACTLY the fallback width inside
 * `<img>` — so for as long as captions have existed the preview drew them in a
 * system face while the export drew them in the chosen one, and the comment
 * claiming the two matched because they share the SVG was only half right.
 *
 * `overlayToSVG` fixes that by embedding a subsetted `@font-face` as a data URI,
 * which is not an external resource and so escapes the isolation. To embed it,
 * this side needs the bytes.
 *
 * ## Why from our own service and not from Google
 *
 * The EXPORT resolves fonts through `resolveFonts` on the render box. If the
 * browser fetched `fonts.gstatic.com` itself, the two would be one Google
 * release apart from previewing a different cut of a face than the render used
 * — silently, and in exactly the dimension (glyph widths) that the caption box
 * is sized from. Asking the same box that will do the render is what makes
 * "preview equals export" a fact rather than a hope.
 *
 * Mobile does not use any of this: its captions are React Native `<Text>`,
 * which measures and draws with the real font already.
 */
import { authHeaders } from './session';

const BASE = process.env.NEXT_PUBLIC_ORBIT_RENDER_URL ?? 'http://localhost:8787';

/**
 * One entry per family, for the life of the tab.
 *
 * A font is immutable under its name and the service says so with an
 * `immutable` cache header, so the only thing worth avoiding is re-fetching on
 * every editor mount. `null` is cached too: a family this deployment cannot
 * serve will not start working because the user scrubbed the timeline, and
 * retrying per frame would hammer the route.
 */
const cache = new Map<string, Promise<Uint8Array | null>>();

/** Families that came back unavailable, so callers can say so once. */
const unavailable = new Set<string>();

/**
 * The faces already in hand, readable synchronously.
 *
 * Hit-testing runs inside a pointer event and cannot await anything, but it
 * calls `overlayBox` and so has to measure a caption the same way the renderer
 * just drew it — otherwise the click target and the visible box drift apart by
 * however wrong the approximation happened to be for that string. A family not
 * yet loaded is simply absent and falls back, which is what the renderer did
 * for that frame too.
 */
const loaded = new Map<string, Uint8Array>();

export function loadedCaptionFonts(): ReadonlyMap<string, Uint8Array> {
  return loaded;
}

function fetchFont(family: string): Promise<Uint8Array | null> {
  return (async () => {
    try {
      const res = await fetch(`${BASE.replace(/\/+$/, '')}/v1/fonts/${encodeURIComponent(family)}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        unavailable.add(family);
        return null;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      loaded.set(family, bytes);
      return bytes;
    } catch {
      // Offline or the service is down. Remembered as unavailable rather than
      // retried per frame — the editor still works, captions just measure by
      // the approximation, which is what they did before any of this landed.
      unavailable.add(family);
      return null;
    }
  })();
}

/** The bytes for one family, or null if this deployment cannot serve it. */
export function captionFont(family: string): Promise<Uint8Array | null> {
  const hit = cache.get(family);
  if (hit) return hit;
  const p = fetchFont(family);
  cache.set(family, p);
  return p;
}

/**
 * Load every family a project's captions use.
 *
 * Returns a plain map so it can be handed straight to `frameStateAt`. Families
 * that failed are simply absent, and an absent family falls back to the flat
 * approximation rather than blocking the frame — an editor that refuses to draw
 * a caption because a font is missing is worse than one that draws it slightly
 * wide.
 */
export async function loadCaptionFonts(families: Iterable<string>): Promise<Map<string, Uint8Array>> {
  const wanted = [...new Set(families)].filter(Boolean);
  const out = new Map<string, Uint8Array>();
  await Promise.all(
    wanted.map(async (family) => {
      const bytes = await captionFont(family);
      if (bytes) out.set(family, bytes);
    }),
  );
  return out;
}

/** Families we asked for and could not get. For a one-time editor notice. */
export function unavailableFontFamilies(): string[] {
  return [...unavailable];
}
