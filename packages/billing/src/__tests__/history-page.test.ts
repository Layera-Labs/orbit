/**
 * Paging over the ledger.
 *
 * The properties worth pinning are the ones a portal breaks on: a page must be
 * bounded whatever the caller asks for, cursors must be stable while new
 * entries land at the head, and a bad cursor must not silently restart from the
 * newest row — which is how a paginating client ends up in an infinite loop
 * over the same page.
 */
import { describe, expect, it } from 'vitest';
import { InMemoryLedgerStore, pageLimit } from '../store';
import { Ledger } from '../ledger';

const ACCOUNT = 'acct_1';

async function seeded(n: number) {
  const store = new InMemoryLedgerStore();
  const ledger = new Ledger(store);
  for (let i = 1; i <= n; i++) {
    await ledger.credit(ACCOUNT, 1, `entry_${i}`);
  }
  return ledger;
}

describe('pageLimit', () => {
  it('defaults, floors and caps', () => {
    expect(pageLimit(undefined)).toBe(50);
    expect(pageLimit(0)).toBe(50);
    expect(pageLimit(-5)).toBe(50);
    expect(pageLimit(Number.NaN)).toBe(50);
    expect(pageLimit(10.9)).toBe(10);
    // The cap is the point: a caller must not be able to ask for the table.
    expect(pageLimit(10_000)).toBe(200);
  });
});

describe('historyPage', () => {
  it('returns the newest entries first', async () => {
    const ledger = await seeded(5);
    const page = await ledger.historyPage(ACCOUNT, { limit: 3 });
    expect(page.entries.map((e) => e.reason)).toEqual(['entry_5', 'entry_4', 'entry_3']);
  });

  it('walks the whole history without repeating or skipping a row', async () => {
    const ledger = await seeded(7);
    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = await ledger.historyPage(ACCOUNT, { limit: 2, before: cursor });
      seen.push(...page.entries.map((e) => e.reason));
      cursor = page.nextCursor;
    } while (cursor && ++guard < 20);

    expect(seen).toEqual([
      'entry_7', 'entry_6', 'entry_5', 'entry_4', 'entry_3', 'entry_2', 'entry_1',
    ]);
    expect(new Set(seen).size).toBe(7);
  });

  it('omits the cursor on the last page', async () => {
    const ledger = await seeded(4);
    const page = await ledger.historyPage(ACCOUNT, { limit: 10 });
    expect(page.entries).toHaveLength(4);
    expect(page.nextCursor).toBeUndefined();
  });

  it('omits the cursor when the history divides exactly by the limit', async () => {
    // The case that catches `entries.length === limit` as a "there is more"
    // test: four rows at four per page is the last page, not a promise of a
    // fifth that would come back empty.
    const ledger = await seeded(4);
    const page = await ledger.historyPage(ACCOUNT, { limit: 4 });
    expect(page.entries).toHaveLength(4);
    expect(page.nextCursor).toBeUndefined();
  });

  it('is stable when new entries land while paging', async () => {
    const ledger = await seeded(4);
    const first = await ledger.historyPage(ACCOUNT, { limit: 2 });
    expect(first.entries.map((e) => e.reason)).toEqual(['entry_4', 'entry_3']);

    // Someone runs a render mid-scroll.
    await ledger.credit(ACCOUNT, 1, 'entry_5');

    const second = await ledger.historyPage(ACCOUNT, { limit: 2, before: first.nextCursor });
    // Keyset: the new head does not shift the window. An OFFSET would have
    // handed back entry_3 a second time here.
    expect(second.entries.map((e) => e.reason)).toEqual(['entry_2', 'entry_1']);
  });

  it('returns nothing for an unknown cursor rather than the newest page', async () => {
    const ledger = await seeded(3);
    const page = await ledger.historyPage(ACCOUNT, { before: 'le_nope' });
    expect(page.entries).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
  });

  it('caps a caller who asks for everything', async () => {
    const ledger = await seeded(250);
    const page = await ledger.historyPage(ACCOUNT, { limit: 100_000 });
    expect(page.entries).toHaveLength(200);
  });

  it('never shows one account another account rows', async () => {
    const store = new InMemoryLedgerStore();
    const ledger = new Ledger(store);
    await ledger.credit(ACCOUNT, 1, 'mine');
    await ledger.credit('acct_2', 1, 'theirs');

    const page = await ledger.historyPage(ACCOUNT);
    expect(page.entries.map((e) => e.reason)).toEqual(['mine']);
  });

  it('is empty for an account that has never been touched', async () => {
    const ledger = new Ledger(new InMemoryLedgerStore());
    const page = await ledger.historyPage('acct_new');
    expect(page.entries).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
  });
});
