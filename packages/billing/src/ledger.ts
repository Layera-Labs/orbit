import type { AccountId, LedgerEntry } from './types';
import type { LedgerStore } from './store';

export class InsufficientCreditsError extends Error {
  constructor(
    public account: AccountId,
    public required: number,
    public available: number,
  ) {
    super(`Insufficient credits for ${account}: need ${required}, have ${available}`);
    this.name = 'InsufficientCreditsError';
  }
}

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

  /** Debit `amount`; rejects with InsufficientCreditsError if the balance is too low. */
  async debit(
    account: AccountId,
    amount: number,
    reason: string,
    meta?: Record<string, unknown>,
  ): Promise<LedgerEntry> {
    if (amount <= 0) throw new Error('debit amount must be positive');
    const bal = await this.store.balance(account);
    if (bal < amount) throw new InsufficientCreditsError(account, amount, bal);
    return this.store.record(account, -amount, reason, meta);
  }
}
