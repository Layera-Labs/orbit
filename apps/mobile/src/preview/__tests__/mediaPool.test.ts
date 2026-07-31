/**
 * The bookkeeping behind the preview's warm media.
 *
 * Neither structure has a canonical twin — no other renderer keeps decoders
 * open — so both are checked against the invariants that make them safe rather
 * than against another implementation. The two that matter are asymmetric:
 * `ByteLru` must never destroy what it evicts (a caller may be drawing it),
 * while `LeasePool` must never hand the same resource to two holders (they
 * would fight over one decoder's seek position). Get either backwards and the
 * failure is a crash or a wrong frame, not a slow preview.
 */
import { describe, expect, it } from "vitest";
import { ByteLru, LeasePool } from "../mediaPool";

/** A stand-in for an SkImage: a size, and whether anyone freed it. */
const img = (bytes: number) => ({ bytes, freed: false });
const lru = (budget: number) =>
  new ByteLru<{ bytes: number; freed: boolean }>(budget, (v) => v.bytes);

describe("ByteLru", () => {
  it("evicts by total size, not by entry count", () => {
    const c = lru(100);
    c.set("a", img(40));
    c.set("b", img(40));
    expect(c.size).toBe(2);
    // One more 40 is 120 > 100, so the oldest goes and the newest stays.
    c.set("c", img(40));
    expect(c.size).toBe(2);
    expect(c.get("a")).toBeNull();
    expect(c.get("b")).not.toBeNull();
    expect(c.get("c")).not.toBeNull();
    expect(c.bytes).toBe(80);
  });

  it("counts a read as a use, so the untouched entry is the one that goes", () => {
    const c = lru(100);
    c.set("a", img(40));
    c.set("b", img(40));
    c.get("a"); // a is now the most recent
    c.set("c", img(40));
    expect(c.get("a")).not.toBeNull();
    expect(c.get("b")).toBeNull();
  });

  it("never evicts the entry just inserted, however far over budget", () => {
    const c = lru(100);
    c.set("small", img(10));
    // A single 500-byte image blows the whole budget. It must survive: it is
    // the one about to be drawn, and dropping it would reload it every frame.
    c.set("huge", img(500));
    expect(c.get("huge")).not.toBeNull();
    expect(c.get("small")).toBeNull();
    // The next insertion is what finally clears it.
    c.set("next", img(10));
    expect(c.get("huge")).toBeNull();
    expect(c.bytes).toBe(10);
  });

  it("does not double-count a key that is replaced", () => {
    const c = lru(1000);
    c.set("a", img(40));
    c.set("a", img(70));
    expect(c.size).toBe(1);
    expect(c.bytes).toBe(70);
  });

  it("never frees what it evicts", () => {
    // The whole reason eviction only forgets: an evicted image may still be on
    // screen, and this cache has no way to know. Disposal is the pool's job,
    // where ownership is actually tracked.
    const c = lru(50);
    const first = img(40);
    c.set("a", first);
    c.set("b", img(40));
    expect(c.has("a")).toBe(false);
    expect(first.freed).toBe(false);
  });
});

describe("LeasePool", () => {
  const pool = (max: number) => {
    const freed: string[] = [];
    const p = new LeasePool<string>(max, (v) => freed.push(v));
    return { p, freed };
  };

  it("leases exclusively — a second take gets nothing", () => {
    const { p } = pool(4);
    p.release("clip.mp4", "decoder-1");
    expect(p.take("clip.mp4")).toBe("decoder-1");
    // The point of the whole structure: two layers on one source must not end
    // up sharing a decoder, because both of them seek.
    expect(p.take("clip.mp4")).toBeNull();
  });

  it("keeps sources apart", () => {
    const { p } = pool(4);
    p.release("a.mp4", "da");
    p.release("b.mp4", "db");
    expect(p.take("b.mp4")).toBe("db");
    expect(p.take("b.mp4")).toBeNull();
    expect(p.take("a.mp4")).toBe("da");
  });

  it("frees rather than keeps once full, and stays at its cap", () => {
    const { p, freed } = pool(2);
    p.release("a", "d1");
    p.release("a", "d2");
    p.release("a", "d3");
    expect(p.idle).toBe(2);
    expect(freed).toEqual(["d3"]);
  });

  it("reports a source as available only while one is idle", () => {
    // `prefetchVideo` skips on this, so a stale true would mean a clip is never
    // warmed and a stale false would open a second decoder for it every time.
    const { p } = pool(4);
    expect(p.has("a")).toBe(false);
    p.release("a", "d1");
    expect(p.has("a")).toBe(true);
    p.take("a");
    expect(p.has("a")).toBe(false);
  });

  it("balances: everything leased comes back and the count agrees", () => {
    const { p, freed } = pool(3);
    for (const d of ["d1", "d2", "d3"]) p.release("a", d);
    const held = [p.take("a"), p.take("a"), p.take("a")];
    expect(held).toEqual(["d3", "d2", "d1"]);
    expect(p.idle).toBe(0);
    for (const d of held) p.release("a", d as string);
    expect(p.idle).toBe(3);
    expect(freed).toEqual([]);
  });
});
