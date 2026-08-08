import type { Asset, AssetProvider, SearchOptions } from "@orbit/shared";

/**
 * CC0 stock images, with no key at all.
 *
 * Openverse answers anonymously, so a self-hosted Orbit generates video the
 * moment it has a language model — no stock account, no registration, nothing
 * to put in an env file. That is the whole reason it is the default.
 *
 * ## `license=cc0` is the contract, not a preference
 *
 * `license_type=commercial` returns a far larger corpus, and every extra item
 * in it is CC BY or stricter — an attribution the user would owe on a video
 * they posted, that nothing in this pipeline would remind them about. A
 * generated video has no credits roll. So the filter is narrow on purpose, and
 * the cost is a smaller pool.
 *
 * ## Images only
 *
 * Openverse indexes images and audio; there is no video corpus behind it. The
 * story format is built for that — every clip gets an alternating slow push, so
 * a still does not read as a held frame. Footage needs a keyed provider, which
 * is what `PEXELS_API_KEY` selects instead.
 *
 * Measured limits, from the response headers rather than the docs: 20 requests
 * a minute and 200 a day, anonymously, keyed on IP. `page_size` may not exceed
 * 20 without a key, and asking for more answers 401 — a paging limit wearing a
 * credential error's clothes.
 */

const ENDPOINT = "https://api.openverse.org/v1/images/";
const MAX_ANON_PAGE = 20;

export interface OpenverseOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface OpenverseImage {
  id?: string;
  url?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
}

export function openverseProvider(opts: OpenverseOptions = {}): AssetProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  const search = async (query: string, options: SearchOptions = {}): Promise<Asset[]> => {
    const params = new URLSearchParams({
      q: query,
      license: "cc0",
      page_size: String(Math.min(options.perPage ?? MAX_ANON_PAGE, MAX_ANON_PAGE)),
      page: String(options.page ?? 1),
    });
    // A hint the API honours unevenly; `pickAsset` scores shape regardless.
    if (options.orientation === "portrait") params.set("aspect_ratio", "tall");
    else if (options.orientation === "landscape") params.set("aspect_ratio", "wide");
    else if (options.orientation === "squarish") params.set("aspect_ratio", "square");

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${ENDPOINT}?${params}`, { signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }

    /*
     * 429 is named rather than folded into a generic failure. Anonymous callers
     * share one small allowance, so this is the error an operator will actually
     * hit — and "search failed" reads as our bug and invites the retry that
     * keeps the window shut.
     */
    if (res.status === 429)
      throw new Error(
        "openverse rate limit reached (20/min, 200/day for anonymous callers) — set PEXELS_API_KEY for a keyed provider",
      );
    if (!res.ok) throw new Error(`openverse ${res.status}`);

    const body = (await res.json()) as { results?: OpenverseImage[] };
    return (body.results ?? [])
      /*
       * An item with no dimensions is dropped rather than kept. `pickAsset`
       * scores an unknown shape as unusable and would only ever choose one
       * after giving up every requirement — so it can only ever arrive as the
       * worst possible answer, wearing the look of a deliberate choice.
       */
      .filter((r): r is OpenverseImage & { url: string } =>
        Boolean(r.url && r.width && r.height),
      )
      .map(
        (r): Asset => ({
          id: String(r.id ?? r.url),
          type: "image",
          src: r.url,
          ...(r.thumbnail ? { thumbnail: r.thumbnail } : {}),
          width: r.width,
          height: r.height,
        }),
      );
  };

  return {
    id: "openverse",
    search,
    async getById(id: string): Promise<Asset> {
      const [first] = await search(id, { perPage: 1 });
      if (!first) throw new Error(`openverse has no asset ${id}`);
      return first;
    },
  };
}
