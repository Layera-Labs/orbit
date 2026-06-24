import type { AccountId, LedgerEntry } from './types';

/** Persistence seam. Production implements this over a DB transaction. */
export interface LedgerStore {
  /** Append a signed delta and return the resulting entry (with running balance). */
  record(account: AccountId, delta: number, reason: string, meta?: Record<string, unknown>): Promise<LedgerEntry>;
  balance(account: AccountId): Promise<number>;
  history(account: AccountId): Promise<LedgerEntry[]>;
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
}
