// @vitest-environment node
//
// API keys: the credential a developer's own server calls us with.
//
// The pure half runs everywhere. The half that needs Postgres is skipped
// without TEST_DATABASE_URL, following the house pattern — a key store with no
// database is not a thing worth stubbing, because "no in-memory fallback" is
// one of the decisions being made.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { isLicenseKeyFormat } from '@layera-labs/billing';
import { hashKey, isApiKey, PgApiKeyStore } from '../api-keys';
import { makePgPool } from '../pg-store';
import { bearer, guestToken } from './guest.js';

const URL = process.env.TEST_DATABASE_URL;

describe('key shape', () => {
  it('recognises its own prefix and nothing else', () => {
    expect(isApiKey('orbit_sk_abc')).toBe(true);
    expect(isApiKey('eyJhbGciOiJIUzI1NiJ9.e30.x')).toBe(false);
    expect(isApiKey('')).toBe(false);
    // A near-miss must not be treated as a key, or a typo'd JWT would report
    // "invalid API key" and send someone to rotate a credential they do not
    // have, instead of signing in again.
    expect(isApiKey('orbit_pk_abc')).toBe(false);
  });

  it('hashes deterministically, and differently per key', () => {
    expect(hashKey('orbit_sk_a')).toBe(hashKey('orbit_sk_a'));
    expect(hashKey('orbit_sk_a')).not.toBe(hashKey('orbit_sk_b'));
    expect(hashKey('orbit_sk_a')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe.skipIf(!URL)('PgApiKeyStore (integration)', () => {
  const pool = makePgPool(URL!);
  const account = `test:${process.pid}`;
  const other = `test:${process.pid}:other`;
  let store: PgApiKeyStore;

  beforeAll(async () => {
    store = new PgApiKeyStore(pool);
    await store.whenReady();
    await pool.query('DELETE FROM api_keys WHERE account LIKE $1', ['test:%']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM api_keys WHERE account LIKE $1', ['test:%']).catch(() => {});
    await pool.end();
  });

  it('issues a key that verifies back to its account', async () => {
    const made = await store.create(account, 'production');
    expect(made.key.startsWith('orbit_sk_')).toBe(true);
    // The format the billing package already validates, so one vocabulary
    // covers both sides.
    expect(isLicenseKeyFormat(made.key)).toBe(true);

    const found = await store.verify(made.key);
    expect(found?.account).toBe(account);
    expect(found?.name).toBe('production');
    expect(found?.last4).toBe(made.key.slice(-4));
  });

  it('draws distinct keys', async () => {
    const made = await Promise.all(
      Array.from({ length: 25 }, (_, i) => store.create(account, `k${i}`)),
    );
    expect(new Set(made.map((m) => m.key)).size).toBe(25);
  });

  /**
   * The property the whole design rests on: a database dump leaks nothing
   * usable. Checked by looking for the raw key ANYWHERE in the row, not just in
   * the column we happen to think about — a future column that helpfully
   * cached it would be caught here.
   */
  it('stores no recoverable copy of the raw key', async () => {
    const made = await store.create(account, 'secret-check');
    const res = await pool.query('SELECT to_jsonb(t)::text AS row FROM api_keys t');
    const dump = res.rows.map((r: { row: string }) => r.row).join('\n');
    expect(dump).not.toContain(made.key);
    // ...while the hash of it plainly is there, so the test is looking at the
    // right rows and would notice if it were not.
    expect(dump).toContain(hashKey(made.key));
  });

  it('refuses a key that was never issued', async () => {
    expect(await store.verify('orbit_sk_' + 'z'.repeat(24))).toBeNull();
  });

  it('stops authenticating once revoked, but keeps the row', async () => {
    const made = await store.create(account, 'to-revoke');
    expect(await store.verify(made.key)).not.toBeNull();

    expect(await store.revoke(account, made.id)).toBe(true);
    expect(await store.verify(made.key)).toBeNull();

    // The tombstone survives, so a ledger row or log line naming this key is
    // still resolvable after retirement.
    const listed = (await store.list(account)).find((k) => k.id === made.id);
    expect(listed).toBeDefined();
    expect(listed?.revokedAt).toBeGreaterThan(0);

    // Idempotent: a second revoke changes nothing and reports so.
    expect(await store.revoke(account, made.id)).toBe(false);
  });

  it('will not let one account revoke another account\'s key', async () => {
    const made = await store.create(account, 'mine');
    expect(await store.revoke(other, made.id)).toBe(false);
    // Still live — the failed revoke did nothing at all.
    expect(await store.verify(made.key)).not.toBeNull();
  });

  it('lists only the owner\'s keys, and never a secret', async () => {
    await store.create(other, 'theirs');
    const mine = await store.list(account);
    expect(mine.every((k) => k.account === account)).toBe(true);
    expect(JSON.stringify(mine)).not.toContain('orbit_sk_');
  });
});

describe.skipIf(!URL)('API keys over HTTP', () => {
  let server: Server;
  let base: string;
  let auth: Record<string, string>;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.ORBIT_FREE_CREDITS = '50';
    const { createServer } = await import('../server.js');
    server = createServer().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    auth = bearer(await guestToken(base));
  });

  afterAll(() => {
    delete process.env.DATABASE_URL;
    server.close();
  });

  const mint = async (name = 'ci') =>
    (
      await (
        await fetch(`${base}/v1/keys`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...auth },
          body: JSON.stringify({ name }),
        })
      ).json()
    ).key as string;

  it('hands the secret back exactly once, then never again', async () => {
    const key = await mint('once');
    expect(key.startsWith('orbit_sk_')).toBe(true);

    const listed = await (await fetch(`${base}/v1/keys`, { headers: auth })).json();
    expect(JSON.stringify(listed)).not.toContain(key);
  });

  it('authenticates a request, billing the account that owns it', async () => {
    const key = await mint('billing');
    const asKey = { Authorization: `Bearer ${key}` };

    const mine = await (await fetch(`${base}/v1/credits`, { headers: auth })).json();
    const viaKey = await (await fetch(`${base}/v1/credits`, { headers: asKey })).json();
    // Same balance, because it is the same account — not a fresh one seeded
    // with its own free credits.
    expect(viaKey.balance).toBe(mine.balance);
  });

  it('refuses a revoked key', async () => {
    const key = await mint('doomed');
    const list = await (await fetch(`${base}/v1/keys`, { headers: auth })).json();
    const id = list.keys.find((k: { name: string }) => k.name === 'doomed').id;

    await fetch(`${base}/v1/keys/${id}`, { method: 'DELETE', headers: auth });

    const res = await fetch(`${base}/v1/credits`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status).toBe(401);
    expect((await res.json()).kind).toBe('bad_api_key');
  });

  /**
   * A key that can mint a key is a foothold that outlives revoking the key
   * that leaked, because it has already issued its own replacement.
   */
  it('will not let a key mint or revoke another key', async () => {
    const key = await mint('escalate');
    const asKey = { 'content-type': 'application/json', Authorization: `Bearer ${key}` };

    const created = await fetch(`${base}/v1/keys`, {
      method: 'POST',
      headers: asKey,
      body: JSON.stringify({ name: 'child' }),
    });
    expect(created.status).toBe(403);
    expect((await created.json()).kind).toBe('key_cannot_manage_keys');

    const listed = await fetch(`${base}/v1/keys`, { headers: asKey });
    expect(listed.status).toBe(403);
  });

  it('quotes a render without reserving anything', async () => {
    const project = {
      id: 'p',
      schemaVersion: 2,
      width: 1920,
      height: 1080,
      fps: 30,
      background: { type: 'color', color: '#000' },
      clips: [],
      tracks: [],
      overlays: [{ id: 'o', type: 'text', text: 'x', start: 0, end: 8, layer: 0 }],
      audio: [],
    };
    const before = (await (await fetch(`${base}/v1/credits`, { headers: auth })).json()).balance;
    const res = await fetch(`${base}/v1/render/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ project }),
    });
    expect(res.status).toBe(200);
    const q = await res.json();
    expect(q.billedSec).toBe(8);
    // Unmetered by default, which is a different answer from "free" and is
    // reported as such.
    expect(q.metered).toBe(false);
    expect((await (await fetch(`${base}/v1/credits`, { headers: auth })).json()).balance).toBe(before);
  });
});
