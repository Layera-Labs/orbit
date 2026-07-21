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
import { Ledger, InsufficientCreditsError } from '@orbit/billing';
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

  it('stores and finds users', async () => {
    const users = new PgUserStore(pool);
    await users.create({ id: 'u1', email: 'a@test.local', passwordHash: 'scrypt$x$y', createdAt: new Date().toISOString() });
    const found = await users.findByEmail('a@test.local');
    expect(found?.id).toBe('u1');
    expect(await users.findByEmail('missing@test.local')).toBeNull();
  });
});
