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
import {
  InsufficientCreditsError,
  pageLimit,
  type AccountId,
  type HistoryPage,
  type HistoryQuery,
  type LedgerEntry,
  type LedgerStore,
  type RecordGuard,
  type RecordOnceResult,
  type RecordOptions,
} from '@layera-labs/orbit-billing';
import type { UserRecord, UserStore } from '@layera-labs/orbit-auth';

/** The columns every read of `ledger_entries` selects. */
interface LedgerRow {
  row: string;
  delta: number;
  reason: string;
  balance_after: number;
  at: Date;
  meta: Record<string, unknown> | null;
}

const rowToEntry = (account: AccountId, r: LedgerRow): LedgerEntry => ({
  id: `le_${r.row}`,
  account,
  delta: r.delta,
  reason: r.reason,
  balanceAfter: r.balance_after,
  at: r.at.toISOString(),
  meta: r.meta ?? undefined,
});

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

  /**
   * Resolves once this store's schema exists, rejecting if it cannot be made.
   *
   * The DDL runs from the constructor and every method awaits it, which means a
   * broken schema or an unreachable database surfaced as a failed USER REQUEST
   * — minutes or hours after the deploy that caused it, on whoever happened to
   * click first. Startup awaits this instead, so the failure lands on the
   * deploy where someone is watching.
   */
  whenReady(): Promise<void> {
    return this.ready;
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

  async record(
    account: AccountId,
    delta: number,
    reason: string,
    meta?: Record<string, unknown>,
    opts?: RecordOptions,
  ): Promise<LedgerEntry> {
    const { entry } = await this.write(account, delta, reason, meta, undefined, opts);
    return entry;
  }

  async recordOnce(
    account: AccountId,
    delta: number,
    reason: string,
    meta: Record<string, unknown>,
    guard: RecordGuard,
    opts?: RecordOptions,
  ): Promise<RecordOnceResult> {
    return this.write(account, delta, reason, meta, guard, opts);
  }

  /**
   * The one writer, because every part of it has to be in ONE transaction.
   *
   * Three things happen under the account's advisory lock, and separating any
   * of them reintroduces a race that costs money:
   *
   *   - the guard lookup, so two concurrent retries of the same job cannot both
   *     find nothing and both charge;
   *   - the previous balance read, so two debits cannot compute `balance_after`
   *     from the same prior row;
   *   - the floor check, so a caller cannot pass an affordability check that a
   *     concurrent write has already invalidated.
   *
   * `pg_advisory_xact_lock` is per account and releases on COMMIT/ROLLBACK, so
   * this serializes writers for ONE account and nobody else.
   */
  private async write(
    account: AccountId,
    delta: number,
    reason: string,
    meta: Record<string, unknown> | undefined,
    guard: RecordGuard | undefined,
    opts: RecordOptions | undefined,
  ): Promise<RecordOnceResult> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [account]);

      if (guard) {
        const found = await client.query<LedgerRow>(
          `SELECT row, delta, reason, balance_after, at, meta
             FROM ledger_entries
            WHERE account = $1 AND meta->>$2 = $3
              AND ($4::text IS NULL OR reason = $4)
            ORDER BY row ASC LIMIT 1`,
          [account, guard.key, guard.value, guard.reason ?? null],
        );
        if (found.rows[0]) {
          await client.query('COMMIT');
          return { entry: rowToEntry(account, found.rows[0]), created: false };
        }
      }

      const prev = await client.query<{ balance_after: number }>(
        'SELECT balance_after FROM ledger_entries WHERE account = $1 ORDER BY row DESC LIMIT 1',
        [account],
      );
      const before = prev.rows[0]?.balance_after ?? 0;
      const balanceAfter = before + delta;
      if (opts?.minBalanceAfter != null && balanceAfter < opts.minBalanceAfter) {
        await client.query('ROLLBACK');
        throw new InsufficientCreditsError(account, -delta, before);
      }
      const ins = await client.query<{ row: string; at: Date }>(
        'INSERT INTO ledger_entries (account, delta, reason, balance_after, meta) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING row, at',
        [account, delta, reason, balanceAfter, meta ? JSON.stringify(meta) : null],
      );
      await client.query('COMMIT');
      return {
        entry: {
          id: `le_${ins.rows[0].row}`,
          account,
          delta,
          reason,
          balanceAfter,
          at: ins.rows[0].at.toISOString(),
          meta,
        },
        created: true,
      };
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
   * A bounded, newest-first page of the same rows.
   *
   * Keyset on `row`, which is a BIGINT identity and therefore both unique and
   * monotonic — so `row < $2 ORDER BY row DESC LIMIT $3` is a stable window
   * even while new entries land at the head. An OFFSET would shift under a
   * reader as their own renders wrote rows, repeating or skipping entries.
   *
   * Runs on the existing `(account, row)` index, so it is an index scan of
   * exactly `limit` rows rather than the full-history read `history` does.
   *
   * One extra row is fetched and dropped: that, not `entries.length === limit`,
   * is what proves another page exists. A history whose length is an exact
   * multiple of the limit would otherwise advertise a page that is empty.
   */
  async historyPage(
    account: AccountId,
    query: HistoryQuery = {},
  ): Promise<HistoryPage> {
    await this.ready;
    const limit = pageLimit(query.limit);

    // `row` is BIGINT and node-pg hands it back as a string; the cursor is the
    // `le_<row>` id we minted, so strip the prefix and let Postgres do the
    // comparison numerically rather than parsing a bigint into a JS number that
    // cannot hold it.
    const before = query.before?.startsWith('le_') ? query.before.slice(3) : undefined;
    if (query.before !== undefined && (before === undefined || !/^\d+$/.test(before))) {
      // A malformed cursor returns nothing rather than the newest page, so a
      // client that corrupts one cannot silently loop over the same rows.
      return { entries: [] };
    }

    const res = await this.pool.query<LedgerRow>(
      `SELECT row, delta, reason, balance_after, at, meta
         FROM ledger_entries
        WHERE account = $1 ${before !== undefined ? 'AND row < $3' : ''}
        ORDER BY row DESC
        LIMIT $2`,
      before !== undefined ? [account, limit + 1, before] : [account, limit + 1],
    );

    const more = res.rows.length > limit;
    const rows = more ? res.rows.slice(0, limit) : res.rows;
    const entries = rows.map((r) => rowToEntry(account, r));

    return {
      entries,
      ...(more ? { nextCursor: entries[entries.length - 1].id } : {}),
    };
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

  /**
   * Resolves once this store's schema exists, rejecting if it cannot be made.
   *
   * The DDL runs from the constructor and every method awaits it, which means a
   * broken schema or an unreachable database surfaced as a failed USER REQUEST
   * — minutes or hours after the deploy that caused it, on whoever happened to
   * click first. Startup awaits this instead, so the failure lands on the
   * deploy where someone is watching.
   */
  whenReady(): Promise<void> {
    return this.ready;
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
