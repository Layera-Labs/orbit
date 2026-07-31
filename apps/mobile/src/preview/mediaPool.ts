/**
 * The two bookkeeping structures behind `mediaCache`, kept apart from it so
 * they can be tested without a native runtime — `mediaCache` itself imports
 * Skia and Reanimated at module scope and cannot be loaded under vitest.
 *
 * They are separate types because decoded images and open decoders fail in
 * opposite directions, and one structure cannot be right for both:
 *
 *   - An IMAGE may be drawn by any number of layers at once and is never handed
 *     back, so the cache can only ever DROP a reference, never free one. Its
 *     bound has to be bytes rather than entries, because a count that is safe
 *     for stickers is not remotely safe for camera-roll photos.
 *   - A DECODER is leased to exactly one layer at a time and always comes back,
 *     so ownership is known and an idle one can be freed properly. Its bound is
 *     a count, because what it costs is an open file and decode buffers.
 */

/**
 * A least-recently-used map bounded by the total SIZE of what it holds.
 *
 * Eviction only forgets an entry; it never destroys one. Anything handed out of
 * here may be in use by a caller that is drawing this frame, and the map has no
 * way to know — so freeing on eviction would be a crash waiting for a big
 * enough project.
 */
export class ByteLru<T> {
  /** Insertion order IS lru order — `get` re-inserts to move an entry last. */
  private readonly entries = new Map<string, T>();
  private total = 0;

  constructor(
    private readonly budget: number,
    private readonly sizeOf: (value: T) => number,
  ) {}

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** The value for `key`, marked as most-recently-used. */
  get(key: string): T | null {
    const hit = this.entries.get(key);
    if (hit === undefined) return null;
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  set(key: string, value: T): void {
    const existing = this.entries.get(key);
    if (existing !== undefined) this.total -= this.sizeOf(existing);
    this.entries.delete(key);
    this.entries.set(key, value);
    this.total += this.sizeOf(value);
    this.evict(key);
  }

  /**
   * Trim back to budget, oldest first. `keep` is never evicted however far over
   * budget it puts us: it is the entry the caller is about to use, and a cache
   * that drops its newest member is a cache that reloads on every frame. An
   * entry larger than the whole budget therefore survives until something else
   * is inserted, which is the right trade — it is the one being drawn.
   */
  private evict(keep: string): void {
    for (const [key, value] of this.entries) {
      if (this.total <= this.budget) return;
      if (key === keep) continue;
      this.entries.delete(key);
      this.total -= this.sizeOf(value);
    }
  }
}

/**
 * A pool of reusable, EXCLUSIVELY leased resources, keyed by source.
 *
 * Exclusivity is the whole point: two preview layers sharing one video decoder
 * would fight over its seek position, and the editor seeks on every scrub. So
 * `take` removes what it returns, and a resource is either leased to exactly
 * one holder or idle here — which in turn is what makes it safe to actually
 * free an idle one, unlike `ByteLru`.
 */
export class LeasePool<T> {
  private readonly free = new Map<string, T[]>();
  private count = 0;

  constructor(
    private readonly max: number,
    private readonly free_: (value: T) => void,
  ) {}

  get idle(): number {
    return this.count;
  }

  /** Whether an idle resource for `key` is waiting — used to skip a prefetch. */
  has(key: string): boolean {
    return this.free.has(key);
  }

  /** Lease an idle resource for `key`, or null if none is waiting. */
  take(key: string): T | null {
    const bucket = this.free.get(key);
    if (!bucket || bucket.length === 0) return null;
    const value = bucket.pop() as T;
    this.count--;
    if (bucket.length === 0) this.free.delete(key);
    return value;
  }

  /** Hand a resource back. Freed rather than kept once the pool is full. */
  release(key: string, value: T): void {
    if (this.count >= this.max) {
      this.free_(value);
      return;
    }
    const bucket = this.free.get(key);
    if (bucket) bucket.push(value);
    else this.free.set(key, [value]);
    this.count++;
  }
}
