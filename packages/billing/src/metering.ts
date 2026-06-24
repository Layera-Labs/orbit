import type { AccountId, CostTable, LedgerEntry, Operation } from './types';
import { Ledger } from './ledger';

/** Default credit costs. Cheap features (caption/tts) low; image/video high. */
export const DEFAULT_COSTS: CostTable = {
  caption: 1,
  tts: 5,
  edit_image: 8,
  generate_image: 10,
  generate_video: 100,
};

/**
 * Meter a generative operation: look up its credit cost and debit the ledger.
 * Throws if the operation has no configured cost, or InsufficientCreditsError
 * if the account can't afford it — so callers can't run generation for free.
 */
export async function meter(
  ledger: Ledger,
  account: AccountId,
  op: Operation,
  costs: CostTable = DEFAULT_COSTS,
  meta?: Record<string, unknown>,
): Promise<LedgerEntry> {
  const cost = costs[op];
  if (cost == null) throw new Error(`No cost configured for operation: ${op}`);
  return ledger.debit(account, cost, op, { ...meta, op });
}
