import { createHash } from "node:crypto";
import { rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetStore } from "@orbit/pipeline";

/**
 * Fetched stock media, cached by the hash of its own bytes.
 *
 * ## It lives in the media dir on purpose
 *
 * A resolved visual is stored exactly like an upload — a file in `mediaDir`,
 * addressed as `upload:<id>` — and gets three things for free by doing so: the
 * byte budget and LRU eviction that already run over that directory,
 * `makeResolveSrc`'s containment check, and a `src` the render path already
 * understands. A second cache beside the first would need its own budget, its
 * own eviction and its own resolution rule, and would be the duplication this
 * repo keeps having to undo.
 *
 * ## The id IS the content hash
 *
 * So the cache is not a lookup table that can disagree with the disk: a hit is
 * literally "a file with this name is already here". Two scenes that resolve to
 * the same shot store one file, and so do two different provider URLs serving
 * identical bytes.
 *
 * The honest limit: the hash is only known AFTER downloading, so identical
 * bytes behind two URLs are fetched twice and stored once. A URL memo covers
 * the repeat within one process — the case that actually recurs, since a
 * retried job asks for the same urls — and across processes the step log
 * already prevents the re-ask.
 */

/** Distinguishes concurrent writes of identical content. See `fetch`. */
let writeSeq = 0;

/** What ffmpeg will be handed, so it may not be anything. */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

export interface AssetStoreOptions {
  mediaDir: string;
  /**
   * Refuse anything larger.
   *
   * A provider's "original" can be a 4K master measured in hundreds of
   * megabytes. `pickAsset` already prefers the smallest rendition that fills
   * the frame, so this is the backstop for a provider that reports its sizes
   * wrongly — without it one bad search result fills the disk.
   */
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export class MediaDirAssetStore implements AssetStore {
  private byUrl = new Map<string, string>();
  private maxBytes: number;
  private doFetch: typeof fetch;

  constructor(private opts: AssetStoreOptions) {
    this.maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  async fetch(url: string): Promise<string> {
    const memo = this.byUrl.get(url);
    if (memo) return memo;

    /*
     * The url comes from a provider's search response rather than from a user,
     * but this is still a server-side fetch of an address we did not choose —
     * and the provider is configurable. Refusing anything but http(s) is what
     * stops a `file://` or a `gopher://` in a compromised or malicious
     * response turning this into an arbitrary read.
     */
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`asset url is not a url: ${url}`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      throw new Error(`refusing to fetch a non-http asset url: ${parsed.protocol}`);

    const res = await this.doFetch(url);
    if (!res.ok) throw new Error(`asset fetch failed: ${res.status} ${url}`);

    /*
     * Checked before reading as well as after. `content-length` is a claim and
     * can be absent or wrong, so the real guard is the byte count below — but
     * when it IS present, believing it saves downloading a gigabyte to find
     * out.
     */
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > this.maxBytes)
      throw new Error(`asset is ${declared} bytes, over the ${this.maxBytes} limit`);

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > this.maxBytes)
      throw new Error(`asset is ${bytes.byteLength} bytes, over the ${this.maxBytes} limit`);

    const hash = createHash("sha256").update(bytes).digest("hex");
    const ext = extensionFor(res.headers.get("content-type"), parsed.pathname);
    const id = `${hash}${ext}`;
    const token = `upload:${id}`;
    const full = join(this.opts.mediaDir, id);

    /*
     * Already here — from another scene, another job, or a previous run that
     * eviction has not reached. The bytes are identical by construction, so
     * there is nothing to write and nothing to check.
     */
    const existing = await stat(full).catch(() => null);
    if (!existing || existing.size !== bytes.byteLength) {
      /*
       * Written under a temporary name and renamed, because eviction walks this
       * directory on a timer and a half-written file is a file it can hand to
       * ffmpeg. Rename is atomic within a filesystem.
       *
       * The counter is load-bearing, and the pid alone was not enough. The temp
       * name derives from `full`, which derives from the CONTENT hash — so two
       * concurrent fetches of different urls serving identical bytes produce
       * the same temp path, in the same process, and interleave their writes
       * into it. Identical bytes is not a rare case here; it is the case this
       * whole class exists to collapse.
       */
      const tmp = `${full}.${process.pid}.${++writeSeq}.part`;
      await writeFile(tmp, bytes);
      await rename(tmp, full).catch(async (err) => {
        await rm(tmp, { force: true });
        throw err;
      });
    }

    this.byUrl.set(url, token);
    return token;
  }
}

/**
 * Give the file a name ffmpeg can act on.
 *
 * Content-type first, since a CDN url often ends in a query or an opaque id
 * rather than an extension. The url's own suffix is the fallback, and an
 * unrecognised type gets `.bin` — ffmpeg probes content and does not need the
 * hint, but a wrong extension is worse than none.
 */
export function extensionFor(contentType: string | null, pathname: string): string {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (EXTENSIONS[type]) return EXTENSIONS[type];
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(pathname);
  if (m && Object.values(EXTENSIONS).includes(`.${m[1].toLowerCase()}`))
    return `.${m[1].toLowerCase()}`;
  return ".bin";
}
