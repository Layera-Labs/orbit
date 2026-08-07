import type { AccountId, LedgerEntry } from './types';
import { InsufficientCreditsError } from './errors';

export interface RecordOptions {
  /**
   * Refuse the write if it would take the balance below this, and do the check
   * INSIDE the same transaction as the write.
   *
   * This exists because `balance()` then `record()` is a check-then-act with a
   * gap in the middle, and the gap is reachable: two generations starting at
   * the same instant on an account with exactly enough for one both read the
   * old balance, both pass, and both charge. Nothing about doing it in the
   * caller can close that — only the lock the write already takes can.
   *
   * Absent means no floor, which is what a credit and a refund want.
   */
  minBalanceAfter?: number;
}

/**
 * "Only if nothing already matches this."
 *
 * The idempotency primitive, and it has to live at the store because it is one
 * transaction: a `findByMeta` followed by a `record` is the same check-then-act
 * gap as above. Two concurrent deliveries of one purchase webhook could both
 * find no prior entry and both credit; two retries of one generation step could
 * both charge.
 */
export interface RecordGuard {
  /** A `meta` key to look for. */
  key: string;
  /** The value it must have for the write to be considered already done. */
  value: string;
  /** Narrow to one reason. Omit to match the key across any reason — which is
   *  what closing a hold needs, since a settle and a release are both closes. */
  reason?: string;
}

export interface RecordOnceResult {
  entry: LedgerEntry;
  /** False when the guard matched and `entry` is the pre-existing row. */
  created: boolean;
}

/** Persistence seam. Production implements this over a DB transaction. */
export interface LedgerStore {
  /** Append a signed delta and return the resulting entry (with running balance). */
  record(
    account: AccountId,
    delta: number,
    reason: string,
    meta?: Record<string, unknown>,
    opts?: RecordOptions,
  ): Promise<LedgerEntry>;
  /**
   * Append, unless an entry already matches `guard`.
   *
   * Returns the existing entry with `created: false` rather than throwing: a
   * repeat is the expected case for a retried job, not an error, and a caller
   * that wants to know can look at the flag.
   */
  recordOnce(
    account: AccountId,
    delta: number,
    reason: string,
    meta: Record<string, unknown>,
    guard: RecordGuard,
    opts?: RecordOptions,
  ): Promise<RecordOnceResult>;
  balance(account: AccountId): Promise<number>;
  history(account: AccountId): Promise<LedgerEntry[]>;
  /**
   * The first entry for this account with this reason and this `meta` key/value,
   * or undefined.
   *
   * An idempotency check, and the reason it is not `history().some(...)` is that
   * `history` is unbounded — no LIMIT, every row mapped into a JS object. The
   * purchase webhook ran exactly that scan on an account id supplied by its
   * caller, so anyone who could reach the route could force a full
   * table-scan-per-account on every request. Reading one row makes the check
   * O(1) against an index instead of O(account history).
   */
  findByMeta(
    account: AccountId,
    reason: string,
    key: string,
    value: string,
  ): Promise<LedgerEntry | undefined>;
}

export interface InMemoryOptions {
  /** Timestamp source (default `() => new Date().toISOString()`). */
  clock?: () => string;
  /** Entry id source (default sequential `le_N`). */
  idgen?: () => string;
}

/** In-memory append-only ledger — for dev and tests. */
export class InMemoryLedgerStore implements LedgerStore {
  private byAccount = new Map<AccountId, LedgerEntry[]>();
  private seq = 0;
  private clock: () => string;
  private idgen: () => string;

  constructor(opts: InMemoryOptions = {}) {
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.idgen = opts.idgen ?? (() => `le_${++this.seq}`);
  }

  async record(
    account: AccountId,
    delta: number,
    reason: string,
    meta?: Record<string, unknown>,
    opts?: RecordOptions,
  ): Promise<LedgerEntry> {
    const list = this.byAccount.get(account) ?? [];
    const prev = list.length ? list[list.length - 1].balanceAfter : 0;
    const balanceAfter = prev + delta;
    /*
     * Enforced here as well as in Postgres, even though a single-threaded store
     * has no race to lose. Parity is the point: a test that passes against this
     * store and fails against the real one is worse than no test.
     */
    if (opts?.minBalanceAfter != null && balanceAfter < opts.minBalanceAfter)
      throw new InsufficientCreditsError(account, -delta, prev);
    const entry: LedgerEntry = {
      id: this.idgen(),
      account,
      delta,
      reason,
      balanceAfter,
      at: this.clock(),
      meta,
    };
    list.push(entry);
    this.byAccount.set(account, list);
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
    const existing = (this.byAccount.get(account) ?? []).find(
      (e) =>
        (guard.reason == null || e.reason === guard.reason) &&
        (e.meta as Record<string, unknown> | undefined)?.[guard.key] === guard.value,
    );
    if (existing) return { entry: existing, created: false };
    return { entry: await this.record(account, delta, reason, meta, opts), created: true };
  }

  async balance(account: AccountId): Promise<number> {
    const list = this.byAccount.get(account);
    return list && list.length ? list[list.length - 1].balanceAfter : 0;
  }

  async history(account: AccountId): Promise<LedgerEntry[]> {
    return [...(this.byAccount.get(account) ?? [])];
  }

  async findByMeta(
    account: AccountId,
    reason: string,
    key: string,
    value: string,
  ): Promise<LedgerEntry | undefined> {
    return (this.byAccount.get(account) ?? []).find(
      (e) =>
        e.reason === reason &&
        (e.meta as Record<string, unknown> | undefined)?.[key] === value,
    );
  }
}
