import { lookup } from "node:dns/promises";
import { writeFile } from "node:fs/promises";
import { isIP } from "node:net";

/**
 * Fetching a client-supplied http(s) `src`, safely.
 *
 * A project may reference media by URL, and until now that URL went straight to
 * ffmpeg's `-i`. ffmpeg will happily open it — including
 * `http://127.0.0.1:…`, `http://169.254.169.254/latest/meta-data/…`, or
 * anything else on the private network the render box can see — and the bytes
 * come back to the caller encoded into the MP4 they asked for. That was
 * reachable with one unauthenticated POST and it was verified working, not
 * theorised: a request naming a loopback URL produced a downloadable video of
 * that server's response.
 *
 * So the service fetches remote media ITSELF and hands ffmpeg a local file.
 * That buys three things ffmpeg could not:
 *
 *  - every hop of the redirect chain is checked, not just the URL as typed;
 *  - the destination address is checked AFTER resolution, so a hostname that
 *    resolves into private space is caught;
 *  - the download is bounded, so a client cannot point the box at an endless
 *    stream and fill the disk.
 *
 * Residual risk, stated honestly: this resolves the name, checks the address,
 * and then connects by name, so a DNS entry that changes between those two
 * moments (a rebinding attack) is not covered. Closing that needs a connect
 * hook pinned to the checked address; it is the next hardening step, and it is
 * a much narrower hole than "any URL, straight into ffmpeg".
 */

/** Refuse anything that is not plainly a public http(s) endpoint. */
export class RemoteSrcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteSrcError";
  }
}

/**
 * Is this IP one a client must never be able to reach through us?
 *
 * Loopback, link-local (which is where every cloud's metadata service lives),
 * the RFC 1918 private ranges, carrier-grade NAT, multicast and the unspecified
 * address — plus the IPv6 equivalents, including v4-mapped forms, because
 * `::ffff:127.0.0.1` is loopback wearing a different hat.
 */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 0) return true; // not an address at all: refuse rather than guess

  if (v === 6) {
    const lower = ip.toLowerCase();
    // A v4-mapped address is a v4 address; check it as one.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isBlockedAddress(mapped[1]);
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (/^f[cd]/.test(lower)) return true; // unique-local fc00::/7
    if (lower.startsWith("ff")) return true; // multicast
    return false;
  }

  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** Resolve a host and refuse it if ANY address it answers with is blocked. */
async function assertPublicHost(host: string): Promise<void> {
  // A bare IP needs no DNS, and passing it to `lookup` would be a needless
  // round trip that some resolvers answer differently anyway.
  if (isIP(host)) {
    if (isBlockedAddress(host))
      throw new RemoteSrcError(`refusing to fetch from a private address: ${host}`);
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new RemoteSrcError(`could not resolve ${host}`);
  }
  // ALL of them: a host answering with one public and one private address must
  // not be usable, because we do not choose which one connect() picks.
  const bad = addrs.find((a) => isBlockedAddress(a.address));
  if (bad) throw new RemoteSrcError(`refusing to fetch from a private address: ${host}`);
}

export interface FetchRemoteOptions {
  /** Hard ceiling on the download, bytes. */
  maxBytes: number;
  /** How many redirects to follow before giving up. */
  maxRedirects?: number;
  signal?: AbortSignal;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Download a client-supplied URL to `destPath`, checking every hop.
 *
 * Redirects are followed MANUALLY (`redirect: "manual"`) so each new location
 * goes through the same address check. Letting fetch follow them would mean a
 * public URL could redirect to `169.254.169.254` and we would never see it.
 */
export async function fetchRemoteTo(
  url: string,
  destPath: string,
  opts: FetchRemoteOptions,
): Promise<void> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxRedirects = opts.maxRedirects ?? 3;

  let current = url;
  for (let hop = 0; ; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new RemoteSrcError(`not a valid url: ${current}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new RemoteSrcError(`only http(s) media urls are allowed: ${parsed.protocol}`);
    if (parsed.username || parsed.password)
      throw new RemoteSrcError("credentials in a media url are not allowed");

    await assertPublicHost(parsed.hostname);

    const res = await doFetch(current, {
      redirect: "manual",
      signal: opts.signal,
    });

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new RemoteSrcError(`redirect with no location from ${current}`);
      if (hop >= maxRedirects) throw new RemoteSrcError("too many redirects");
      current = new URL(next, current).toString();
      continue;
    }

    if (!res.ok) throw new RemoteSrcError(`fetching ${current} failed (HTTP ${res.status})`);

    // Trust the header only to REFUSE early — a lying or absent one still gets
    // caught by counting the bytes as they arrive.
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > opts.maxBytes)
      throw new RemoteSrcError(`remote media is larger than ${opts.maxBytes} bytes`);

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new RemoteSrcError(`no body from ${current}`);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RemoteSrcError(`remote media is larger than ${opts.maxBytes} bytes`);
      }
      chunks.push(value);
    }

    const body = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      body.set(c, at);
      at += c.byteLength;
    }
    await writeFile(destPath, body);
    return;
  }
}
