/**
 * Reading and understanding the credit ledger.
 *
 * ## What a ledger row actually looks like
 *
 * The row's own `reason` is the MECHANISM — `hold`, `settle`, `release`,
 * `topup` — and the semantic reason lives in `meta.reason` (`render`,
 * `render-failed`, `generate`). That split is not an accident: a hold and its
 * settle are two rows describing one render, and the pair has to stay
 * distinguishable so a balance can be reconstructed from the deltas alone.
 *
 * It does mean neither field alone tells a reader what happened, which is what
 * `describe()` is for.
 *
 * A render's hold also carries `tier` and `billedSec`, recorded when metering
 * was built precisely so a usage screen could say what a charge was FOR
 * without any new bookkeeping.
 */
import { getHistory, type Failure, type Result } from './orbit';

export interface LedgerEntry {
  id: string;
  /** Signed: positive credits, negative debits. */
  delta: number;
  /** The mechanism: hold, settle, release, topup, or an operation name. */
  reason: string;
  /** Running balance after this entry. */
  balanceAfter: number;
  /** ISO 8601. */
  at: string;
  meta?: {
    reason?: string;
    tier?: string;
    billedSec?: number;
    holdId?: string;
    held?: number;
    actual?: number;
    [k: string]: unknown;
  };
}

export interface HistoryPage {
  entries: LedgerEntry[];
  nextCursor?: string;
}

/** How many pages `loadSince` will walk before it stops and says so. */
const MAX_PAGES = 10;
const PAGE = 200;

export interface Loaded {
  entries: LedgerEntry[];
  /**
   * True when the walk hit `MAX_PAGES` with more still available, so the
   * screen can SAY the window is partial. A silently truncated total reads as
   * a complete one, and on a page about money that is the worst kind of wrong.
   */
  truncated: boolean;
}

/**
 * Every entry at or after `since`, oldest-last.
 *
 * Pages until the rows go older than the window, because the API is
 * newest-first and cannot filter by date — the alternative is asking the
 * server for a date range it does not offer, or loading the whole ledger,
 * which is the thing `historyPage` exists to avoid.
 */
export async function loadSince(since: Date): Promise<Result<Loaded>> {
  const entries: LedgerEntry[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const r: Result<HistoryPage> = await getHistory({ limit: PAGE, before: cursor });
    if (!r.ok) return r;

    for (const e of r.value.entries) {
      if (new Date(e.at) >= since) entries.push(e);
    }

    const oldest = r.value.entries[r.value.entries.length - 1];
    // Stop as soon as the page runs off the end of the window: everything
    // beyond it is older still, so there is nothing left to find.
    if (!r.value.nextCursor || (oldest && new Date(oldest.at) < since)) {
      return { ok: true, value: { entries, truncated: false } };
    }
    cursor = r.value.nextCursor;
  }

  return { ok: true, value: { entries, truncated: true } };
}

/** A human label and a sign for one row. */
export function describe(e: LedgerEntry): { label: string; detail?: string } {
  const kind = e.meta?.reason;

  if (e.reason === 'hold' && kind === 'render') {
    return {
      label: 'Render',
      detail: [e.meta?.tier, e.meta?.billedSec != null ? `${e.meta.billedSec}s` : null]
        .filter(Boolean)
        .join(' · '),
    };
  }
  if (e.reason === 'hold' && kind === 'generate') return { label: 'Generation' };
  if (e.reason === 'hold') return { label: 'Reserved' };

  if (e.reason === 'settle') {
    // A settle's delta is the correction between estimate and actual, so zero
    // is the normal case and worth saying rather than showing a bare 0.
    return {
      label: 'Settled',
      detail: e.delta === 0 ? 'estimate was exact' : undefined,
    };
  }
  if (e.reason === 'release') {
    return { label: kind === 'render-failed' ? 'Refunded, render failed' : 'Refunded' };
  }
  if (e.reason === 'topup' || e.reason === 'purchase') return { label: 'Credits added' };
  if (e.reason === 'free-tier' || e.reason === 'signup-bonus') return { label: 'Welcome credits' };

  // An operation name (generate_image, tts, caption…) reads fine as a label
  // once the underscores are gone, and inventing a lookup table would only go
  // stale the next time one is added.
  return { label: e.reason.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase()) };
}

const dayKey = (iso: string) => iso.slice(0, 10);

/** Credits SPENT per day across the window, oldest first, with empty days kept. */
export function spendByDay(entries: LedgerEntry[], since: Date, until: Date) {
  const spend = new Map<string, number>();
  for (const e of entries) {
    // Only debits, and only real ones: a hold that is later released nets to
    // zero, and counting the hold alone would show spend that never happened.
    if (e.delta < 0) {
      spend.set(dayKey(e.at), (spend.get(dayKey(e.at)) ?? 0) + -e.delta);
    } else if (e.reason === 'release' || e.reason === 'settle') {
      spend.set(dayKey(e.at), (spend.get(dayKey(e.at)) ?? 0) - e.delta);
    }
  }

  const days: { day: string; credits: number }[] = [];
  for (let d = new Date(since); d <= until; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    // Empty days are kept, so the chart's x-axis is TIME rather than a list of
    // days that happened to have activity — otherwise a quiet week compresses
    // and the shape lies.
    days.push({ day: key, credits: Math.max(0, spend.get(key) ?? 0) });
  }
  return days;
}

/**
 * Credits spent per quality tier, biggest first.
 *
 * Built from `renderRows` rather than from the hold rows directly, so a
 * refunded render contributes its COUNT but not its credits. Summing the holds
 * instead put a breakdown of 291 under a headline of 271 — two numbers on one
 * screen that a reader can add up and find disagree, with nothing on the page
 * explaining why. The refunds were the difference, and a render that cost
 * nothing has no business appearing as spend.
 */
export function spendByTier(rows: RenderRow[]) {
  const byTier = new Map<string, { credits: number; renders: number; failed: number }>();
  for (const r of rows) {
    const tier = String(r.tier ?? 'unknown');
    const at = byTier.get(tier) ?? { credits: 0, renders: 0, failed: 0 };
    at.credits += r.charged;
    at.renders += 1;
    if (r.failed) at.failed += 1;
    byTier.set(tier, at);
  }
  return [...byTier.entries()]
    .map(([tier, v]) => ({ tier, ...v }))
    .sort((a, b) => b.credits - a.credits);
}

export interface RenderRow {
  id: string;
  at: string;
  tier?: string;
  billedSec?: number;
  /** What the hold reserved. */
  held: number;
  /** What it finally cost: 0 when the render failed and was refunded. */
  charged: number;
  failed: boolean;
}

/**
 * One row per render, by pairing each hold with whatever closed it.
 *
 * A failed render shows 0 charged rather than being hidden, because "I was not
 * billed for that" is the single thing a reader most wants confirmed, and a
 * missing row confirms nothing.
 */
export function renderRows(entries: LedgerEntry[]): RenderRow[] {
  const closes = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const id = e.meta?.closes as string | undefined;
    if (id) closes.set(id, [...(closes.get(id) ?? []), e]);
  }

  return entries
    .filter((e) => e.reason === 'hold' && e.meta?.reason === 'render')
    .map((hold) => {
      const holdId = String(hold.meta?.holdId ?? '');
      const closers = closes.get(holdId) ?? [];
      const released = closers.find((c) => c.reason === 'release');
      const settled = closers.find((c) => c.reason === 'settle');
      const held = -hold.delta;
      return {
        id: hold.id,
        at: hold.at,
        tier: hold.meta?.tier,
        billedSec: hold.meta?.billedSec,
        held,
        charged: released ? 0 : held - (settled?.delta ?? 0),
        failed: Boolean(released),
      };
    });
}

export type { Failure };
