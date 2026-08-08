// @vitest-environment node
//
// Project sync against a REAL Postgres. Skipped unless TEST_DATABASE_URL is set
// — a stub would prove nothing here, because the whole design rests on what the
// database does under a concurrent write, and the interesting statement is one
// `INSERT ... ON CONFLICT ... WHERE` that a fake would simply reimplement
// wrongly and then agree with itself.
//
//   TEST_DATABASE_URL="postgres://…" npm test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePgPool } from '../pg-store';
import { PgProjectStore } from '../project-store';

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)('project sync (integration)', () => {
  /*
   * Built in `beforeAll`, NOT here. `describe.skipIf` still EVALUATES the
   * describe body to collect the tests it is about to skip — so constructing
   * the pool at this level connected to localhost:5432 on every run without a
   * database and failed the whole suite with an unhandled ECONNREFUSED, from a
   * file whose tests had all been skipped.
   */
  let pool: ReturnType<typeof makePgPool>;
  let store: PgProjectStore;
  const acct = `test:${process.pid}`;
  const other = `test:${process.pid}:other`;

  const doc = (name: string) => ({ id: 'p1', kind: 'video', name, data: { clips: [name] } });

  beforeAll(async () => {
    pool = makePgPool(URL!);
    store = new PgProjectStore(pool);
    await store.list(acct); // force schema creation
    await pool.query('DELETE FROM projects WHERE account LIKE $1', ['test:%']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM projects WHERE account LIKE $1', ['test:%']).catch(() => {});
    await pool.end();
  });

  it('stores and reads a project back', async () => {
    expect(await store.put(acct, { ...doc('first'), updatedAt: 1000 })).toEqual({ stored: true });
    const got = await store.get(acct, 'p1');
    expect(got?.name).toBe('first');
    expect(got?.updatedAt).toBe(1000);
    expect(got?.data).toEqual({ clips: ['first'] });
  });

  it('accepts a newer write', async () => {
    expect(await store.put(acct, { ...doc('second'), updatedAt: 2000 })).toEqual({ stored: true });
    expect((await store.get(acct, 'p1'))?.name).toBe('second');
  });

  /*
   * The rule the whole feature rests on. An older write must not win, and the
   * caller must be handed what it was about to destroy — "no" alone would mean
   * the client silently drops the edit the user just made.
   */
  it('refuses a stale write and returns the stored copy', async () => {
    const result = await store.put(acct, { ...doc('stale'), updatedAt: 1500 });
    expect(result.stored).toBe(false);
    if (!result.stored) {
      expect(result.current.name).toBe('second');
      expect(result.current.updatedAt).toBe(2000);
    }
    expect((await store.get(acct, 'p1'))?.name).toBe('second');
  });

  it('refuses an equal timestamp rather than flipping a coin', async () => {
    const result = await store.put(acct, { ...doc('same-ts'), updatedAt: 2000 });
    expect(result.stored).toBe(false);
    expect((await store.get(acct, 'p1'))?.name).toBe('second');
  });

  /* Two devices writing at once. Exactly one may win, and the loser must be
     told — this is the case the SQL-side comparison exists for. */
  it('survives concurrent writers without losing the newer one', async () => {
    await store.put(acct, { ...doc('base'), updatedAt: 3000 });
    const [a, b] = await Promise.all([
      store.put(acct, { ...doc('writer-a'), updatedAt: 4000 }),
      store.put(acct, { ...doc('writer-b'), updatedAt: 3500 }),
    ]);
    // Whatever the interleaving, the 4000 write is what survives.
    expect((await store.get(acct, 'p1'))?.name).toBe('writer-a');
    expect([a.stored, b.stored]).toContain(true);
  });

  it('hides one account\'s projects from another', async () => {
    await store.put(other, { ...doc('theirs'), updatedAt: 9000 });
    expect((await store.get(acct, 'p1'))?.name).toBe('writer-a');
    expect((await store.get(other, 'p1'))?.name).toBe('theirs');
    const mine = await store.list(acct);
    expect(mine.every((p) => p.name !== 'theirs')).toBe(true);
  });

  /*
   * Deletion has to be a fact that travels. A row that is simply gone is
   * indistinguishable to an offline device from one it has never seen — so it
   * would helpfully upload it again and the project would rise from the dead.
   */
  it('propagates a delete as a tombstone, not an absence', async () => {
    await store.remove(acct, 'p1', 10_000);
    expect(await store.get(acct, 'p1')).toBeNull();
    const listed = await store.list(acct);
    const row = listed.find((p) => p.id === 'p1');
    expect(row?.deleted).toBe(true);
    expect(row?.updatedAt).toBe(10_000);
  });

  it('lets a later edit undelete', async () => {
    expect(await store.put(acct, { ...doc('back'), updatedAt: 11_000 })).toEqual({ stored: true });
    expect((await store.get(acct, 'p1'))?.name).toBe('back');
    expect((await store.list(acct)).find((p) => p.id === 'p1')?.deleted).toBe(false);
  });

  it('lists only what changed since a watermark', async () => {
    await store.put(acct, { id: 'p2', kind: 'image', name: 'newer', updatedAt: 20_000, data: {} });
    const since = await store.list(acct, 15_000);
    expect(since.map((p) => p.id)).toEqual(['p2']);
  });
});
