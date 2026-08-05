import type { AccountId, LedgerEntry } from './types';

/** Persistence seam. Production implements this over a DB transaction. */
export interface LedgerStore {
  /** Append a signed delta and return the resulting entry (with running balance). */
  record(account: AccountId, delta: number, reason: string, meta?: Record<string, unknown>): Promise<LedgerEntry>;
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

  async record(account: AccountId, delta: number, reason: string, meta?: Record<string, unknown>): Promise<LedgerEntry> {
    const list = this.byAccount.get(account) ?? [];
    const prev = list.length ? list[list.length - 1].balanceAfter : 0;
    const entry: LedgerEntry = {
      id: this.idgen(),
      account,
      delta,
      reason,
      balanceAfter: prev + delta,
      at: this.clock(),
      meta,
    };
    list.push(entry);
    this.byAccount.set(account, list);
    return entry;
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
