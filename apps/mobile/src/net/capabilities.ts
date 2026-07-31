/**
 * What the render service this app is pointed at can actually do.
 *
 * Only HDR10 so far, and it exists because `zscale` is a compile-time ffmpeg
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
}

const NONE: ServerCapabilities = { hdr: false };

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
      return { hdr: !!body.capabilities?.hdr };
    } catch {
      // A server that was merely unreachable might well support HDR, so do not
      // remember this answer — the next export sheet asks again.
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
