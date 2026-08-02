/**
 * What the render service this build points at can actually do.
 *
 * ffmpeg is not one program. Which filters it has is a compile-time choice, and
 * which `xfade` transitions it has is a matter of its VERSION — `cover*` and
 * `reveal*`, this editor's Push and Reveal, arrived in 6.1, and Debian bookworm
 * (which the service image is built on) ships 5.1. Naming a token a build does
 * not have is not a slightly-wrong frame: the filtergraph fails to PARSE, so
 * the render dies with an error about an option, minutes after Export.
 *
 * Mirrors `apps/mobile/src/net/capabilities.ts`. Kept as a copy rather than
 * shared because mobile is outside the pnpm workspace and cannot import from
 * here; the two are small and the shape is asserted in one place — the
 * `/health` handler.
 */
export interface ServerCapabilities {
  /** ffmpeg has `zscale`, so HDR10 output is possible. */
  hdr: boolean;
  /**
   * The `xfade` tokens this build accepts, or empty for "unknown".
   *
   * Empty means DO NOT SUBTRACT, never "supports nothing". The editor has to
   * work with the service unreachable — offline, or simply not running in
   * development — and a rule that emptied the transition picker whenever
   * `/health` failed would cost far more than the case it guards. The service
   * refuses by name if such a project reaches it anyway, so nothing silently
   * renders the wrong thing.
   */
  transitions: string[];
}

const NONE: ServerCapabilities = { hdr: false, transitions: [] };

const BASE = process.env.NEXT_PUBLIC_ORBIT_RENDER_URL ?? 'http://localhost:8787';

/** Per base URL: the answer is a property of that install, not of this tab. */
const cache = new Map<string, Promise<ServerCapabilities>>();

export function serverCapabilities(base = BASE): Promise<ServerCapabilities> {
  const key = base.replace(/\/+$/, '');
  const hit = cache.get(key);
  if (hit) return hit;
  const probe = (async (): Promise<ServerCapabilities> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${key}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as {
        capabilities?: Partial<ServerCapabilities>;
      };
      const t = body.capabilities?.transitions;
      return {
        hdr: !!body.capabilities?.hdr,
        // A server predating the field reports nothing, which is "unknown" and
        // must land on the empty array — not on a list that subtracts
        // everything.
        transitions: Array.isArray(t) ? t.filter((x) => typeof x === 'string') : [],
      };
    } catch {
      // Merely unreachable says nothing about the build, so do not remember it.
      cache.delete(key);
      return NONE;
    }
  })();
  cache.set(key, probe);
  return probe;
}
