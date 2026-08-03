/**
 * CC0 stock content, with no API key at all.
 *
 * `stock.ts` next door is bring-your-own-key: Unsplash and Pexels each want a
 * credential the user has to go and register for, and until they do the Stock
 * tab has nothing in it but twelve placeholder photographs. This module is the
 * answer to that. Openverse — the WordPress Foundation's Creative Commons index
 * — answers anonymously, and its `license=cc0` filter is what lets this tab
 * promise content that needs no attribution, no permission and no account.
 *
 * **`license=cc0` is the contract, not a preference.** Openverse also offers
 * `license_type=commercial`, a far larger corpus that would make the Music tab
 * look much healthier — it is how you reach Jamendo's 644k tracks. Every one of
 * those is CC BY or stricter: usable, but only WITH a credit the user would
 * then owe on a video they exported from here, and which nothing in this app
 * would remind them about. Widening the filter would make the tab's own label
 * false, so it stays narrow.
 *
 * Measured against the live API on 2026-08-03, because none of it is written
 * down anywhere you would think to look:
 *
 * - **Jamendo carries no CC0 whatsoever** (`license=cc0&source=jamendo` → 0
 *   results), so every track here comes from Freesound. That is why Music is
 *   loops, stings and field recordings rather than a production-music
 *   catalogue. It is the honest extent of CC0 audio, not a bad query.
 * - **`category` is null on every Freesound record**, so Music and Audio cannot
 *   be told apart by it — `category=music` against `license=cc0` returns zero
 *   results, which reads exactly like "there is no CC0 music" and is not what
 *   is happening. They split on Openverse's `length` bucket instead, whose
 *   first results measured 8s (`shortest`), 93s (`short`), 199s (`medium`) and
 *   854s (`long`).
 * - **An anonymous caller gets 20 requests a minute and 200 a day, keyed on
 *   IP** — `x-ratelimit-limit-anon_burst` and `-anon_sustained` come back on
 *   every response. A 429 therefore has to say so by name: "Search failed"
 *   reads as our bug and invites the retry that keeps the window shut.
 * - **A search is capped at 240 results** for an anonymous caller, so
 *   `result_count` is that cap and not the size of the corpus, and a page may
 *   not exceed **20** — asking for more comes back **401** with
 *   `page_size may not exceed 20 for anonymous requests`, which reads as a
 *   credential problem and is a paging one.
 * - **Freesound's `url` is a 128 kbps mp3 preview.** The original WAV is listed
 *   in `alt_files` behind a Freesound API key, which is precisely the
 *   credential this module exists in order not to need.
 *
 * Nothing here goes through Orbit's servers, exactly as `stock.ts` does not.
 */

const API = 'https://api.openverse.org/v1';

/**
 * The anonymous ceiling, and asking for more is a 401 rather than a clamp.
 * Paging could reach 240; nobody scrolls that far inside a sheet.
 */
const PAGE_SIZE = 20;

/**
 * A hung request would leave the grid spinning with no way back. Openverse
 * normally answers well inside a second, so this is the failure bound and not a
 * budget.
 */
const TIMEOUT_MS = 12_000;

export type CcKind = 'image' | 'audio';

/** What the Stock tab offers, and the only thing the UI has to name. */
export type CcCategory = 'music' | 'audio' | 'background' | 'image';

export interface CcItem {
  id: string;
  kind: CcKind;
  category: CcCategory;
  title: string;
  creator: string;
  /** The asset itself — what gets downloaded onto the timeline. */
  url: string;
  /** Grid preview. Images only: Openverse has no thumbnail for audio. */
  thumb?: string;
  /** Seconds. The API reports MILLISECONDS; converted once, here. */
  durationSec?: number;
  /** Short credit. CC0 requires none — this is courtesy, and it is not a claim. */
  credit: string;
  /** The work's own page at its source, for anyone who wants the original file. */
  sourceUrl: string;
}

/**
 * The daily or per-minute anonymous allowance ran out.
 *
 * Its own type because the UI must say something different: every other failure
 * is worth retrying and this one is worth waiting out.
 */
export class CcRateLimitError extends Error {
  constructor() {
    super('Openverse rate limit reached');
  }
}
export const isCcRateLimited = (e: unknown): e is CcRateLimitError =>
  e instanceof CcRateLimitError;

/**
 * How each category is asked for, and what it opens on.
 *
 * The `seed` is the query used before anything is typed. A grid with nothing in
 * it says "there is no content here", which is the opposite of true — so each
 * category arrives already showing something, the same reasoning the old
 * Picsum starter set was built on.
 *
 * A background sits BEHIND a composition, so the seed has to find something you
 * can put a title over. `texture` was the first guess and is wrong — Openverse
 * reads it photographically and returns brick walls, rusted metal and wood
 * grain, every one of them a surface rather than a backdrop. `gradient` is
 * worse: it is a word Wikipedia uses, so the results are football-kit diagrams
 * and strain-tensor charts. `abstract background` is what actually returns soft
 * fields and colour washes. `aspect_ratio=tall` because the canvas usually is.
 */
const CATEGORIES: Record<
  CcCategory,
  { path: 'audio' | 'images'; kind: CcKind; params: Record<string, string>; seed: string }
> = {
  music: { path: 'audio', kind: 'audio', params: { length: 'short,medium' }, seed: 'music loop' },
  audio: { path: 'audio', kind: 'audio', params: { length: 'shortest' }, seed: 'sound effect' },
  background: {
    path: 'images',
    kind: 'image',
    params: { aspect_ratio: 'tall' },
    seed: 'abstract background',
  },
  image: { path: 'images', kind: 'image', params: {}, seed: 'landscape' },
};

async function get(path: string, params: Record<string, string>): Promise<any> {
  const query = new URLSearchParams({
    license: 'cc0',
    page_size: String(PAGE_SIZE),
    ...params,
  }).toString();

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/${path}/?${query}`, { signal: abort.signal });
    if (res.status === 429) throw new CcRateLimitError();
    if (!res.ok) throw new Error(`Openverse: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Openverse hands back its own boilerplate; this is the line a row can hold. */
function creditOf(r: any): string {
  const who = typeof r.creator === 'string' && r.creator ? r.creator : 'Unknown';
  return `${who} · CC0`;
}

function titleOf(r: any, fallback: string): string {
  const t = typeof r.title === 'string' ? r.title.trim() : '';
  return t || fallback;
}

/** Search one category. `query` empty falls back to the category's seed. */
export async function searchCc(category: CcCategory, query: string): Promise<CcItem[]> {
  const spec = CATEGORIES[category];
  const data = await get(spec.path, { ...spec.params, q: query.trim() || spec.seed });
  const results: any[] = Array.isArray(data?.results) ? data.results : [];

  const items = results
    .filter((r) => r && typeof r.url === 'string' && r.url)
    .map((r) => ({
      id: `ov_${r.id}`,
      kind: spec.kind,
      category,
      title: titleOf(r, spec.kind === 'audio' ? 'Untitled audio' : 'Untitled image'),
      creator: typeof r.creator === 'string' ? r.creator : '',
      url: r.url as string,
      /*
       * `thumbnail` is an Openverse-hosted resize; `url` is the origin CDN and
       * can be several megabytes. Falling back to the full asset keeps a tile
       * from rendering blank, which is the failure `MediaTile` was fixed for.
       */
      thumb: spec.kind === 'image' ? (r.thumbnail ?? r.url) : undefined,
      durationSec:
        typeof r.duration === 'number' && r.duration > 0 ? r.duration / 1000 : undefined,
      credit: creditOf(r),
      sourceUrl: typeof r.foreign_landing_url === 'string' ? r.foreign_landing_url : '',
    }));

  /*
   * An audio clip's `duration` is what the timeline lays out AND what the
   * export's `atrim` cuts to, so a guessed one is not a cosmetic error: guess
   * 10s for a 93s track and the rendered file really is 10 seconds long, with
   * nothing anywhere admitting a number was invented. Openverse reports it for
   * every CC0 record measured (20/20 in both length buckets), so dropping the
   * ones without is a guard that should never fire rather than a real filter.
   */
  return items.filter((i) => i.kind !== 'audio' || (i.durationSec ?? 0) > 0);
}
