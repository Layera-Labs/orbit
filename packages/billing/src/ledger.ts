import type { AccountId, LedgerEntry } from './types';
import type { HistoryPage, HistoryQuery, LedgerStore } from './store';
import { InsufficientCreditsError, UnknownHoldError } from './errors';

export { InsufficientCreditsError, UnknownHoldError };

/** What `hold` reserved, and what `settle`/`release` need to close it. */
export interface Hold {
  id: string;
  account: AccountId;
  /** Credits reserved. Positive. */
  amount: number;
  at: string;
}

/** Reasons written by the hold family. Stable: they are read back by id. */
const HOLD = 'hold';
/** The meta key on a settle or a release naming the hold it closes. */
const CLOSES = 'closesHold';

/** Credit ledger keyed to an account (license + end user). */
export class Ledger {
  constructor(private store: LedgerStore) {}

  balance(account: AccountId): Promise<number> {
    return this.store.balance(account);
  }

  history(account: AccountId): Promise<LedgerEntry[]> {
    return this.store.history(account);
  }

  /**
   * A bounded, newest-first window over the same rows.
   *
   * Prefer this anywhere the result is going to be shown rather than summed:
   * `history` has no LIMIT, so anything user-facing built on it degrades with
   * the account's age.
   */
  historyPage(account: AccountId, query?: HistoryQuery): Promise<HistoryPage> {
    return this.store.historyPage(account, query);
  }

  /**
   * Has this account already been credited for this external transaction?
   *
   * The idempotency check a purchase webhook needs. Use this rather than
   * scanning `history()` — that has no bound, and a webhook is reachable by
   * whoever holds the shared secret at best and by anyone at worst.
   */
  findByMeta(
    account: AccountId,
    reason: string,
    key: string,
    value: string,
  ): Promise<LedgerEntry | undefined> {
    return this.store.findByMeta(account, reason, key, value);
  }

  async canAfford(account: AccountId, amount: number): Promise<boolean> {
    return (await this.store.balance(account)) >= amount;
  }

  async credit(
    account: AccountId,
    amount: number,
    reason = 'topup',
    meta?: Record<string, unknown>,
  ): Promise<LedgerEntry> {
    if (amount <= 0) throw new Error('credit amount must be positive');
    return this.store.record(account, amount, reason, meta);
  }

  /**
   * Debit `amount`; rejects with InsufficientCreditsError if the balance is too
   * low.
   *
   * The floor is enforced by the STORE, inside the same transaction as the
   * write. It used to read the balance here and then record, which is a
   * check-then-act with a reachable gap: two generations starting at the same
   * instant on an account with exactly enough for one both read the old
   * balance, both pass, and both charge. That is not hypothetical on an account
   * being driven by a batch.
   */
  async debit(
    account: AccountId,
    amount: number,
    reason: string,
    meta?: Record<string, unknown>,
  ): Promise<LedgerEntry> {
    if (amount <= 0) throw new Error('debit amount must be positive');
    return this.store.record(account, -amount, reason, meta, { minBalanceAfter: 0 });
  }

  // -------------------------------------------------------------------------
  // holds
  // -------------------------------------------------------------------------
  //
  // A generation is not one charge, it is five or more provider calls across
  // several minutes, and a batch starts twenty of those at once. With debit
  // alone the account's ceiling is only checked as each call lands, so a batch
  // can be well past the balance before the first debit arrives — the money is
  // spent at the provider by then, and refusing afterwards refunds nothing.
  //
  // A hold reserves the credits up front. It is an ORDINARY LEDGER ROW with a
  // negative delta, which is what makes this cheap: `balance()` already sums the
  // rows, so held credits stop being spendable with no change to `balance`,
  // `canAfford`, or any existing caller. Settling writes the difference back;
  // releasing writes all of it back.
  //
  // The alternative — a separate holds table, balance computed as ledger minus
  // active holds — needs two tables kept consistent under one lock and changes
  // what `balance()` means for everything that already calls it. Same outcome,
  // considerably more surface.

  /**
   * Reserve `amount` against `account`.
   *
   * `holdId` is supplied by the CALLER and that is deliberate: a generation job
   * already has an id, and keying the hold to it makes this idempotent by
   * construction. A retried job re-holds under the same id, finds the existing
   * row, and reserves nothing further — which is exactly what a step runner
   * needs and what generating an id here would have made impossible.
   */
  async hold(
    account: AccountId,
    holdId: string,
    amount: number,
    meta?: Record<string, unknown>,
  ): Promise<Hold> {
    if (amount <= 0) throw new Error('hold amount must be positive');
    const { entry } = await this.store.recordOnce(
      account,
      -amount,
      HOLD,
      { ...meta, holdId },
      { key: 'holdId', value: holdId, reason: HOLD },
      { minBalanceAfter: 0 },
    );
    return { id: holdId, account, amount: -entry.delta, at: entry.at };
  }

  /** The hold, if this account has one under that id. */
  async holdOf(account: AccountId, holdId: string): Promise<Hold | undefined> {
    const entry = await this.store.findByMeta(account, HOLD, 'holdId', holdId);
    if (!entry) return undefined;
    return { id: holdId, account, amount: -entry.delta, at: entry.at };
  }

  /**
   * Close a hold at what it actually cost, returning the difference.
   *
   * `actual` may EXCEED the hold, and the excess is charged rather than
   * refused: by the time settle runs the providers have already been paid, so
   * refusing would only mean the ledger disagreeing with reality. A balance
   * that goes negative is visible and recoverable; a silent shortfall is not.
   *
   * There is no floor here for the same reason.
   */
  async settle(
    account: AccountId,
    holdId: string,
    actual: number,
    meta?: Record<string, unknown>,
  ): Promise<LedgerEntry> {
    if (actual < 0) throw new Error('settled amount cannot be negative');
    const held = await this.holdOf(account, holdId);
    if (!held) throw new UnknownHoldError(account, holdId);
    const { entry } = await this.store.recordOnce(
      account,
      held.amount - actual,
      'settle',
      { ...meta, [CLOSES]: holdId, held: held.amount, actual },
      // No `reason`, so a release ALSO satisfies this guard. A hold is closed
      // once, whichever way it was closed — settling a released hold would give
      // the credits back twice.
      { key: CLOSES, value: holdId },
    );
    return entry;
  }

  /** Close a hold having spent nothing, returning all of it. */
  async release(
    account: AccountId,
    holdId: string,
    meta?: Record<string, unknown>,
  ): Promise<LedgerEntry> {
    const held = await this.holdOf(account, holdId);
    if (!held) throw new UnknownHoldError(account, holdId);
    const { entry } = await this.store.recordOnce(
      account,
      held.amount,
      'release',
      { ...meta, [CLOSES]: holdId, held: held.amount },
      { key: CLOSES, value: holdId },
    );
    return entry;
  }
}
