/**
 * Postgres-backed stores — for Neon, Supabase, or any Postgres reachable by a
 * connection URL (`DATABASE_URL`). Both Neon and Supabase expose a standard
 * Postgres endpoint, so one implementation covers them; the only provider-
 * specific bit is SSL, which managed Postgres requires.
 *
 * `record` serializes concurrent writes to the same account with a per-account
 * transaction-scoped advisory lock, then computes the running balance and
 * inserts — the Postgres analogue of the SQLite `BEGIN IMMEDIATE` path. Credit
 * amounts are small, so `delta`/`balance_after` are INTEGER (returned to JS as
 * numbers, not bigint strings); `row` is a BIGINT identity for stable ordering.
 */
import pkg from 'pg';
import type { Pool as PoolType } from 'pg';
import type { AccountId, LedgerEntry, LedgerStore } from '@orbit/billing';
import type { UserRecord, UserStore } from '@orbit/auth';

const { Pool } = pkg;

/** Build a pool from a connection URL, enabling SSL for remote (managed) hosts. */
export function makePgPool(url: string): PoolType {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url);
  return new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
}

export class PgLedgerStore implements LedgerStore {
  private ready: Promise<void>;

  constructor(private pool: PoolType) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        row           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        account       TEXT NOT NULL,
        delta         INTEGER NOT NULL,
        reason        TEXT NOT NULL,
        balance_after INTEGER NOT NULL,
        at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        meta          JSONB
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_ledger_account_row ON ledger_entries(account, row)');
  }

  async record(account: AccountId, delta: number, reason: string, meta?: Record<string, unknown>): Promise<LedgerEntry> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize concurrent writers for this account so two debits can't read
      // the same prior balance. Released automatically on COMMIT/ROLLBACK.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [account]);
      const prev = await client.query<{ balance_after: number }>(
        'SELECT balance_after FROM ledger_entries WHERE account = $1 ORDER BY row DESC LIMIT 1',
        [account],
      );
      const balanceAfter = (prev.rows[0]?.balance_after ?? 0) + delta;
      const ins = await client.query<{ row: string; at: Date }>(
        'INSERT INTO ledger_entries (account, delta, reason, balance_after, meta) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING row, at',
        [account, delta, reason, balanceAfter, meta ? JSON.stringify(meta) : null],
      );
      await client.query('COMMIT');
      return { id: `le_${ins.rows[0].row}`, account, delta, reason, balanceAfter, at: ins.rows[0].at.toISOString(), meta };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async balance(account: AccountId): Promise<number> {
    await this.ready;
    const res = await this.pool.query<{ balance_after: number }>(
      'SELECT balance_after FROM ledger_entries WHERE account = $1 ORDER BY row DESC LIMIT 1',
      [account],
    );
    return res.rows[0]?.balance_after ?? 0;
  }

  async history(account: AccountId): Promise<LedgerEntry[]> {
    await this.ready;
    const res = await this.pool.query<{ row: string; delta: number; reason: string; balance_after: number; at: Date; meta: Record<string, unknown> | null }>(
      'SELECT row, delta, reason, balance_after, at, meta FROM ledger_entries WHERE account = $1 ORDER BY row ASC',
      [account],
    );
    return res.rows.map((r) => ({
      id: `le_${r.row}`,
      account,
      delta: r.delta,
      reason: r.reason,
      balanceAfter: r.balance_after,
      at: r.at.toISOString(),
      meta: r.meta ?? undefined,
    }));
  }

  /**
   * One row, by reason and a `meta` key/value.
   *
   * `meta->>'key' = $4` reads the JSONB field as text, which matches how every
   * caller stores it (a transaction id is a string). `LIMIT 1` is the whole
   * point: the idempotency check this replaces read the account's ENTIRE
   * history, on an account id an unauthenticated caller could choose.
   *
   * It rides `idx_ledger_account_row`, so the scan is bounded by one account's
   * rows rather than the table; a dedicated partial index on `meta->>'txId'`
   * would be better still if purchase volume ever makes that measurable.
   */
  async findByMeta(
    account: AccountId,
    reason: string,
    key: string,
    value: string,
  ): Promise<LedgerEntry | undefined> {
    await this.ready;
    const res = await this.pool.query<{ row: string; delta: number; reason: string; balance_after: number; at: Date; meta: Record<string, unknown> | null }>(
      'SELECT row, delta, reason, balance_after, at, meta FROM ledger_entries WHERE account = $1 AND reason = $2 AND meta->>$3 = $4 ORDER BY row ASC LIMIT 1',
      [account, reason, key, value],
    );
    const r = res.rows[0];
    if (!r) return undefined;
    return {
      id: `le_${r.row}`,
      account,
      delta: r.delta,
      reason: r.reason,
      balanceAfter: r.balance_after,
      at: r.at.toISOString(),
      meta: r.meta ?? undefined,
    };
  }
}

export class PgUserStore implements UserStore {
  private ready: Promise<void>;

  constructor(private pool: PoolType) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // Added after the table shipped, so ALTER rather than a column in the
    // CREATE — an existing deployment already has the table and would never
    // run the new definition. NULL on old rows means "never changed", which is
    // correct: it must not sign everybody out on deploy.
    await this.pool.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ',
    );
  }

  private toRecord(r: {
    id: string;
    email: string;
    password_hash: string;
    created_at: Date;
    password_changed_at: Date | null;
  }): UserRecord {
    return {
      id: r.id,
      email: r.email,
      passwordHash: r.password_hash,
      createdAt: r.created_at.toISOString(),
      passwordChangedAt: r.password_changed_at?.toISOString(),
    };
  }

  private static readonly COLS =
    'id, email, password_hash, created_at, password_changed_at';

  async findByEmail(email: string): Promise<UserRecord | null> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT ${PgUserStore.COLS} FROM users WHERE email = $1`,
      [email],
    );
    return res.rows[0] ? this.toRecord(res.rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT ${PgUserStore.COLS} FROM users WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? this.toRecord(res.rows[0]) : null;
  }

  async create(user: UserRecord): Promise<void> {
    await this.ready;
    await this.pool.query('INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)', [
      user.id,
      user.email,
      user.passwordHash,
      user.createdAt,
    ]);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.ready;
    // `password_changed_at` is what revokes the sessions and the reset link.
    await this.pool.query(
      'UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1',
      [id, passwordHash],
    );
  }
}
