import type { AccountId } from './types';

/**
 * Its own module so the STORE can throw it.
 *
 * The affordability check has to happen inside the same transaction as the
 * write — see `LedgerStore.record` — which means the store raises this, and the
 * store cannot import `ledger.ts` because `ledger.ts` imports the store's
 * types. It is still re-exported from `ledger.ts` and from the package index,
 * so nothing outside this package sees the move.
 */
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

/** Settling or releasing something this account never held. */
export class UnknownHoldError extends Error {
  constructor(
    public account: AccountId,
    public holdId: string,
  ) {
    super(`No hold ${holdId} for ${account}`);
    this.name = 'UnknownHoldError';
  }
}
