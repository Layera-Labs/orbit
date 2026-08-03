/**
 * The Stock tab's search, once, for both of the sheets that have one.
 *
 * The Library sheet browses all four CC0 categories and the audio drawer
 * browses the two audible ones, and they need identical behaviour underneath:
 * the same cache, the same rule about which answer is allowed to land, and the
 * same sentence when the rate limit bites. Written twice they would drift, and
 * the way that failure shows up is one sheet quietly spending the day's
 * allowance that the other one is carefully saving.
 */
import { useEffect, useRef, useState } from 'react';
import { isCcRateLimited, searchCc, type CcCategory, type CcItem } from './openverse';

/**
 * What a caller sees when the anonymous allowance runs out.
 *
 * Its own sentence because every other failure here is worth retrying now and
 * this one is worth waiting out — "Search failed" reads as our bug and invites
 * exactly the retry that keeps the window shut.
 */
export const CC_RATE_LIMIT_MESSAGE =
  'Openverse allows 20 searches a minute and 200 a day from one network. Try again shortly.';

export interface CcSearch {
  category: CcCategory;
  setCategory: (category: CcCategory) => void;
  query: string;
  setQuery: (query: string) => void;
  /** Run the typed query. Category changes search on their own. */
  submit: () => void;
  items: CcItem[];
  loading: boolean;
  error: string | null;
}

export function useCcSearch(initial: CcCategory): CcSearch {
  const [category, setCategory] = useState<CcCategory>(initial);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CcItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Answers kept per category-and-query for the life of the sheet. Openverse
   * allows 200 searches a day from one network, and flicking between the
   * category chips to see what is in each is the single most likely thing
   * anyone does here — without this, doing that twice costs eight of them.
   */
  const cache = useRef(new Map<string, CcItem[]>());
  /*
   * Which request is still allowed to land. Chips are far faster to tap than
   * the network is to answer, so a slow Music response can otherwise arrive
   * after a fast Images one and repaint the grid with the wrong category.
   */
  const seq = useRef(0);

  const run = async (cat: CcCategory, q: string) => {
    const key = `${cat}\n${q.trim()}`;
    const hit = cache.current.get(key);
    if (hit) {
      setItems(hit);
      setError(null);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const found = await searchCc(cat, q);
      if (seq.current !== mine) return;
      cache.current.set(key, found);
      setItems(found);
    } catch (e) {
      if (seq.current !== mine) return;
      setItems([]);
      setError(
        isCcRateLimited(e)
          ? CC_RATE_LIMIT_MESSAGE
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      if (seq.current === mine) setLoading(false);
    }
  };

  /*
   * On mount and on every category change, so a tab is never an empty grid
   * waiting to be told what to look for. The typed query carries across a
   * change on purpose: switching Music → Audio while searching "piano" is
   * asking the same question of a different shelf.
   */
  useEffect(() => {
    void run(category, query);
    // Re-running on `query` would fire a search per keystroke; it is submitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return {
    category,
    setCategory,
    query,
    setQuery,
    submit: () => void run(category, query),
    items,
    loading,
    error,
  };
}
