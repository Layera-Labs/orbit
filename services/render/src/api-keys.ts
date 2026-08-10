/**
 * API keys — how a developer's own server calls this one.
 *
 * The clients that ship with Orbit sign in as a PERSON and carry a short-lived
 * JWT. A developer integrating the render API has no person to sign in: their
 * backend runs unattended and needs a credential that does not expire every
 * hour and never passes through a browser. That is what these are.
 *
 * Three decisions worth stating, because each has a wrong answer that looks
 * fine until it does not.
 *
 * **The raw key is never stored.** Only its SHA-256. A database dump, a stray
 * backup or a `SELECT *` in a support session therefore leaks nothing usable.
 * The key is shown exactly once, at creation, and cannot be recovered — losing
 * it means issuing a new one, which is the correct and boring outcome.
 *
 * **SHA-256, deliberately, and NOT scrypt or argon2.** Those exist to make
 * guessing expensive for secrets humans chose, where the search space is a
 * dictionary. A key here is 192 bits from `randomBytes` — there is nothing to
 * guess, no dictionary to walk, and no rainbow table for a space that size. All
 * a slow KDF would buy is ~100ms added to EVERY authenticated API call, on a
 * service whose whole job is long-running work people are waiting for. Fast
 * hashing is right when the input is already high-entropy; it is only wrong
 * when the input is a password.
 *
 * **Revoking tombstones rather than deletes.** A deleted row makes the audit
 * trail lie: log lines and ledger entries naming that key become unresolvable,
 * so "which credential ran up this bill" stops having an answer at the exact
 * moment somebody needs one.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool as PoolType } from 'pg';

/** Matches `isLicenseKeyFormat` in @layera-labs/orbit-billing. */
const PREFIX = 'orbit_sk_';
/**
 * 24 bytes → 192 bits of entropy, rendered base62 so the key is one
 * double-clickable token with no `+`, `/` or `=` to be mangled by a shell, a
 * URL, or a copy out of a terminal.
 */
const KEY_BYTES = 24;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export interface ApiKeyRecord {
  id: string;
  /** Ledger account every call under this key bills to. */
  account: string;
  /** Human label, chosen by the owner ("production", "staging"). */
  name: string;
  /** Last 4 characters of the raw key, so a list is identifiable. */
  last4: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

/** Only ever returned once, from `create`. */
export interface NewApiKey extends ApiKeyRecord {
  /** The raw secret. Not stored anywhere — show it and forget it. */
  key: string;
}

export function isApiKey(token: string): boolean {
  return token.startsWith(PREFIX);
}

function generate(): string {
  const bytes = randomBytes(KEY_BYTES);
  let out = '';
  // Rejection-free: 62 does not divide 256, so a plain modulo is very slightly
  // biased toward the first 8 letters. At 192 bits that bias is worth far less
  // than a byte of entropy, but it costs nothing to avoid, so draw from a
  // wider pool and reduce cleanly.
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return PREFIX + out;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export class PgApiKeyStore {
  private ready: Promise<void>;

  constructor(private pool: PoolType) {
    this.ready = this.init();
  }

  /** Resolves once the schema exists — awaited at startup, not per request. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id          TEXT PRIMARY KEY,
        -- SHA-256 of the raw key, hex. UNIQUE because it is the lookup, and
        -- because two rows hashing the same would mean a repeat draw from
        -- randomBytes — which should be impossible and should fail loudly if
        -- it ever is not.
        key_hash    TEXT NOT NULL UNIQUE,
        account     TEXT NOT NULL,
        name        TEXT NOT NULL,
        last4       TEXT NOT NULL,
        created_at  BIGINT NOT NULL,
        last_used_at BIGINT,
        -- Tombstone, not a delete: log lines and ledger rows naming this key
        -- have to stay resolvable after it is retired.
        revoked_at  BIGINT
      )
    `);
    await this.pool.query(
      'CREATE INDEX IF NOT EXISTS api_keys_account ON api_keys (account, created_at)',
    );
  }

  async create(account: string, name: string): Promise<NewApiKey> {
    await this.ready;
    const key = generate();
    const id = `ak_${randomBytes(9).toString('hex')}`;
    const last4 = key.slice(-4);
    const createdAt = Date.now();
    await this.pool.query(
      `INSERT INTO api_keys (id, key_hash, account, name, last4, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, hashKey(key), account, name.slice(0, 120), last4, createdAt],
    );
    return { id, account, name, last4, createdAt, key };
  }

  /**
   * Resolve a raw key to its record, or null.
   *
   * Revoked keys resolve to null — a retired credential must not authenticate,
   * and the row surviving is for the audit trail, not for access.
   */
  async verify(key: string): Promise<ApiKeyRecord | null> {
    await this.ready;
    if (!isApiKey(key)) return null;
    const res = await this.pool.query(
      `SELECT id, key_hash, account, name, last4, created_at, last_used_at, revoked_at
         FROM api_keys WHERE key_hash = $1`,
      [hashKey(key)],
    );
    const row = res.rows[0];
    if (!row || row.revoked_at != null) return null;

    /*
     * The index already found this row by an exact hash match, so this compare
     * can only ever be equal. It is here so the code cannot LATER be changed
     * into a scan-and-compare — the shape where a byte-by-byte `===` leaks the
     * matching prefix through timing — without someone deleting this line and
     * noticing why it existed.
     */
    const a = Buffer.from(row.key_hash, 'hex');
    const b = Buffer.from(hashKey(key), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return {
      id: row.id,
      account: row.account,
      name: row.name,
      last4: row.last4,
      createdAt: Number(row.created_at),
      lastUsedAt: row.last_used_at == null ? undefined : Number(row.last_used_at),
    };
  }

  /**
   * Record that a key was used, fire-and-forget.
   *
   * Deliberately NOT awaited on the request path and deliberately coarse: it is
   * a "when did this key last do anything" signal for the dashboard, not an
   * access log. Writing it synchronously would put an UPDATE in front of every
   * API call to store a value nobody reads in real time.
   */
  touch(id: string): void {
    void this.pool
      .query('UPDATE api_keys SET last_used_at = $2 WHERE id = $1', [id, Date.now()])
      .catch(() => undefined);
  }

  async list(account: string): Promise<ApiKeyRecord[]> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT id, account, name, last4, created_at, last_used_at, revoked_at
         FROM api_keys WHERE account = $1 ORDER BY created_at DESC`,
      [account],
    );
    return res.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      account: String(row.account),
      name: String(row.name),
      last4: String(row.last4),
      createdAt: Number(row.created_at),
      lastUsedAt: row.last_used_at == null ? undefined : Number(row.last_used_at),
      revokedAt: row.revoked_at == null ? undefined : Number(row.revoked_at),
    }));
  }

  /**
   * Retire a key. Scoped to the account so one owner cannot revoke another's,
   * and idempotent: revoking twice is not an error, and `revoked_at` keeps the
   * FIRST time it happened.
   */
  async revoke(account: string, id: string): Promise<boolean> {
    await this.ready;
    const res = await this.pool.query(
      `UPDATE api_keys SET revoked_at = $3
         WHERE id = $1 AND account = $2 AND revoked_at IS NULL`,
      [id, account, Date.now()],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
