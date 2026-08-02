/**
 * What the render service this app is pointed at can actually do.
 *
 * Two things so far, and both exist because ffmpeg is not one program. `zscale`
 * is a compile-time ffmpeg
 * option that plenty of ordinary builds (Homebrew's included) ship without. The
 * server refuses an HDR export it cannot honour — correctly, because the
 * alternative is a file whose tags lie about its contents — but a toggle that
 * always errors on your own machine is not a toggle, it is a trap. Asking first
 * lets the export sheet simply not offer it.
 *
 * Deliberately fail-CLOSED: an unreachable server reports no capabilities, so
 * the option is hidden rather than offered on a guess. Hiding a feature that
 * would have worked is recoverable; offering one that cannot is the bug being
 * fixed. Unauthenticated on purpose — `/health` needs no session, and waiting
 * for one would put this behind the very export it is meant to inform.
 */
export interface ServerCapabilities {
  /** ffmpeg has `zscale`, so HDR10 output is possible. */
  hdr: boolean;
  /**
   * The `xfade` transition tokens this build accepts, or empty for "unknown".
   *
   * NOT gated the way `hdr` is, and the difference is the point. An unknown
   * HDR answer hides the toggle, because the cost of hiding is a checkbox. An
   * unknown transition list subtracts NOTHING, because the editor has to work
   * with no server reachable at all and a rule that emptied the picker in
   * aeroplane mode would be worse than the bug it prevents. Empty therefore
   * reads as "do not subtract" in `previewableTransitions`, and the service
   * refuses by name if such a project reaches it anyway.
   */
  transitions: string[];
}

const NONE: ServerCapabilities = { hdr: false, transitions: [] };

/** Per base URL: the answer is a property of that install, not of this session. */
const cache = new Map<string, Promise<ServerCapabilities>>();

export function serverCapabilities(
  base: string,
): Promise<ServerCapabilities> {
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
        // An older server predates the field entirely; that is "unknown", not
        // "supports nothing", so it must land on the empty array rather than
        // on a list that would subtract every family.
        transitions: Array.isArray(t) ? t.filter((x) => typeof x === 'string') : [],
      };
    } catch {
      // A server that was merely unreachable might well support all of this,
      // so do not remember the answer — the next sheet asks again.
      cache.delete(key);
      return NONE;
    }
  })();
  cache.set(key, probe);
  return probe;
}

/** Forget everything, so a changed server URL is re-probed. */
export function resetCapabilities(): void {
  cache.clear();
}
