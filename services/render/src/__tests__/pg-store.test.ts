// @vitest-environment node
//
// Integration test for the Postgres stores. SKIPPED unless TEST_DATABASE_URL is
// set, so normal runs don't need a database. To verify against Neon/Supabase:
//
//   TEST_DATABASE_URL="postgres://user:pass@host/db?sslmode=require" npm test
//
// It writes to (and cleans up) rows under `test:*` accounts / `*@test.local`
// users in the target database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Ledger, InsufficientCreditsError } from '@layera-labs/orbit-billing';
import { makePgPool, PgLedgerStore, PgUserStore } from '../pg-store';

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)('Postgres stores (integration)', () => {
  const pool = makePgPool(URL!);
  const acct = `test:${process.pid}`;

  beforeAll(async () => {
    // Ensure schema exists, then clear any leftovers from a prior run.
    new PgLedgerStore(pool);
    new PgUserStore(pool);
    await pool.query('CREATE TABLE IF NOT EXISTS ledger_entries (row BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account TEXT, delta INTEGER, reason TEXT, balance_after INTEGER, at TIMESTAMPTZ DEFAULT now(), meta JSONB)').catch(() => {});
    await pool.query('DELETE FROM ledger_entries WHERE account LIKE $1', ['test:%']).catch(() => {});
    await pool.query("DELETE FROM users WHERE email LIKE '%@test.local'").catch(() => {});
  });

  afterAll(async () => {
    await pool.query('DELETE FROM ledger_entries WHERE account LIKE $1', ['test:%']).catch(() => {});
    await pool.query("DELETE FROM users WHERE email LIKE '%@test.local'").catch(() => {});
    await pool.end();
  });

  /**
   * Paging, against real SQL.
   *
   * The in-memory store is covered in packages/billing, but the two
   * implementations page by different means — array positions there, a keyset
   * on a BIGINT identity here — so agreeing on the SEMANTICS is something only
   * a test against Postgres can show.
   */
  it('pages newest-first, keyset, without repeating or skipping', async () => {
    const store = new PgLedgerStore(pool);
    const pAcct = `${acct}:page`;
    for (let i = 1; i <= 5; i++) await store.record(pAcct, 1, `e${i}`);

    const first = await store.historyPage(pAcct, { limit: 2 });
    expect(first.entries.map((e) => e.reason)).toEqual(['e5', 'e4']);
    expect(first.nextCursor).toBeDefined();

    // A write lands mid-scroll; the window must not shift under the reader.
    await store.record(pAcct, 1, 'e6');

    const second = await store.historyPage(pAcct, { limit: 2, before: first.nextCursor });
    expect(second.entries.map((e) => e.reason)).toEqual(['e3', 'e2']);

    const third = await store.historyPage(pAcct, { limit: 2, before: second.nextCursor });
    expect(third.entries.map((e) => e.reason)).toEqual(['e1']);
    expect(third.nextCursor).toBeUndefined();
  });

  it('omits the cursor when the page divides the history exactly', async () => {
    const store = new PgLedgerStore(pool);
    const pAcct = `${acct}:exact`;
    for (let i = 1; i <= 4; i++) await store.record(pAcct, 1, `x${i}`);
    const page = await store.historyPage(pAcct, { limit: 4 });
    expect(page.entries).toHaveLength(4);
    expect(page.nextCursor).toBeUndefined();
  });

  it('rejects a malformed cursor instead of returning the newest page', async () => {
    const store = new PgLedgerStore(pool);
    const pAcct = `${acct}:bad`;
    await store.record(pAcct, 1, 'only');
    // Not `le_<digits>` — must not be interpolated anywhere near the query, and
    // must not silently become "start again from the top".
    expect((await store.historyPage(pAcct, { before: "le_1; DROP TABLE ledger_entries" })).entries).toEqual([]);
    expect((await store.historyPage(pAcct, { before: 'garbage' })).entries).toEqual([]);
    // The table is still there.
    expect(await store.balance(pAcct)).toBe(1);
  });

  it('caps the page size a caller can ask for', async () => {
    const store = new PgLedgerStore(pool);
    const pAcct = `${acct}:cap`;
    await store.record(pAcct, 1, 'one');
    const page = await store.historyPage(pAcct, { limit: 100_000 });
    expect(page.entries.length).toBeLessThanOrEqual(200);
  });

  it('never returns another account rows', async () => {
    const store = new PgLedgerStore(pool);
    await store.record(`${acct}:mine`, 1, 'mine');
    await store.record(`${acct}:theirs`, 1, 'theirs');
    const page = await store.historyPage(`${acct}:mine`);
    expect(page.entries.map((e) => e.reason)).toEqual(['mine']);
  });

  it('records signed deltas with a running balance', async () => {
    const store = new PgLedgerStore(pool);
    await store.record(acct, 100, 'free-tier');
    const e = await store.record(acct, -10, 'generate_image', { prompt: 'x' });
    expect(e.balanceAfter).toBe(90);
    expect(await store.balance(acct)).toBe(90);
    const hist = await store.history(acct);
    expect(hist.map((h) => h.reason)).toEqual(['free-tier', 'generate_image']);
    expect(hist[1].meta).toEqual({ prompt: 'x' });
  });

  it('stays consistent under concurrent debits (advisory lock)', async () => {
    const a = `${acct}:concurrent`;
    const ledger = new Ledger(new PgLedgerStore(pool));
    await ledger.credit(a, 100, 'free-tier');
    await Promise.all(Array.from({ length: 10 }, () => ledger.debit(a, 10, 'generate_image')));
    expect(await ledger.balance(a)).toBe(0);
    await expect(ledger.debit(a, 10, 'generate_image')).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  /*
   * The one above debits exactly to zero, so it would pass against a store with
   * no floor at all. This one asks for MORE than the balance can cover, all at
   * once — which is the actual failure: `debit` used to read the balance and
   * then record, with no lock between, so concurrent charges all saw the same
   * prior balance and all passed.
   */
  it('never overdraws under concurrent debits, however many are refused', async () => {
    const a = `${acct}:overdraw`;
    const ledger = new Ledger(new PgLedgerStore(pool));
    await ledger.credit(a, 100, 'free-tier');
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => ledger.debit(a, 10, 'generate_image')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(await ledger.balance(a)).toBe(0);
  });

  describe('holds', () => {
    it('reserves, and the reservation survives concurrency', async () => {
      const a = `${acct}:hold`;
      const ledger = new Ledger(new PgLedgerStore(pool));
      await ledger.credit(a, 1000, 'free-tier');
      // Twenty generations at a 200 ceiling: five fit, fifteen are refused
      // before they reach a provider.
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => ledger.hold(a, `batch_${i}`, 200)),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      expect(await ledger.balance(a)).toBe(0);
    });

    /*
     * The guard has to be inside the transaction, or two retries of one job
     * both find no prior hold and both reserve. Firing the same id repeatedly
     * and concurrently is what a step runner retrying under load looks like.
     */
    it('holds once under the same id, even concurrently', async () => {
      const a = `${acct}:hold-idem`;
      const ledger = new Ledger(new PgLedgerStore(pool));
      await ledger.credit(a, 500, 'free-tier');
      await Promise.all(Array.from({ length: 10 }, () => ledger.hold(a, 'job1', 60)));
      expect(await ledger.balance(a)).toBe(440);
    });

    it('closes once, whichever way it is closed', async () => {
      const a = `${acct}:hold-close`;
      const ledger = new Ledger(new PgLedgerStore(pool));
      await ledger.credit(a, 500, 'free-tier');
      await ledger.hold(a, 'job1', 100);
      // A settle and a release racing must not both give the credits back.
      await Promise.allSettled([
        ledger.settle(a, 'job1', 40),
        ledger.release(a, 'job1'),
        ledger.settle(a, 'job1', 40),
      ]);
      const balance = await ledger.balance(a);
      // Either outcome is legitimate — 460 if the settle won, 500 if the
      // release did. What must not happen is both.
      expect([460, 500]).toContain(balance);
    });

    it('charges an overspend rather than losing it', async () => {
      const a = `${acct}:hold-over`;
      const ledger = new Ledger(new PgLedgerStore(pool));
      await ledger.credit(a, 100, 'free-tier');
      await ledger.hold(a, 'job1', 60);
      await ledger.settle(a, 'job1', 90);
      expect(await ledger.balance(a)).toBe(10);
    });
  });

  it('stores and finds users', async () => {
    const users = new PgUserStore(pool);
    await users.create({ id: 'u1', email: 'a@test.local', passwordHash: 'scrypt$x$y', createdAt: new Date().toISOString() });
    const found = await users.findByEmail('a@test.local');
    expect(found?.id).toBe('u1');
    expect(await users.findByEmail('missing@test.local')).toBeNull();
  });
});
