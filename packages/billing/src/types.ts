/**
 * Billing/credit primitives. Headless and storage-agnostic: the `LedgerStore`
 * interface lets the same `Ledger` run over an in-memory store (dev/tests) or a
 * real database in production. Every generative call debits this ledger.
 */
export type AccountId = string; // conventionally `${licenseKey}:${endUserId}`
export type Operation = string;

export interface LedgerEntry {
  id: string;
  account: AccountId;
  /** Signed: positive credits, negative debits. */
  delta: number;
  reason: string;
  /** Running balance after this entry. */
  balanceAfter: number;
  /** ISO 8601 timestamp. */
  at: string;
  meta?: Record<string, unknown>;
}

export interface License {
  /** `orbit_sk_…` key issued to an SDK customer. */
  key: string;
  tier: string;
  active: boolean;
  /** Optional credit grant size for accounts under this license. */
  monthlyCredits?: number;
}

/** Credit cost per operation. */
export type CostTable = Record<Operation, number>;
