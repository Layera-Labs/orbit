'use client';

/**
 * Credits — PLATE 07.
 *
 * Balance, top-up, and the ledger. The ledger is the trust surface: holds,
 * settles and refunds are all rows, so a developer can reconcile any charge
 * against the render that caused it. That is the whole reason to show it
 * rather than a single "spent this month" figure.
 *
 * Top-up is honestly unavailable. There is no checkout and no price per credit
 * yet, and a button that opens nothing is worse than a sentence saying so.
 */
import { useCallback, useEffect, useState } from 'react';
import { getCredits, getHistory } from '@/lib/orbit';
import { describe, type Failure, type LedgerEntry } from '@/lib/ledger';
import { Trouble } from './Usage';
import styles from './Credits.module.css';

/** Mirrors DEFAULT_CREDIT_PACKS in services/render/src/server.ts. */
const PACKS = [
  { id: 'credits_100', credits: 100 },
  { id: 'credits_500', credits: 550 },
  { id: 'credits_1200', credits: 1400 },
];

type State =
  | { s: 'loading' }
  | { s: 'ready'; balance: number }
  | { s: 'failed'; why: Failure };

export function Credits() {
  const [state, setState] = useState<State>({ s: 'loading' });
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const first = useCallback(async () => {
    const [bal, page] = await Promise.all([getCredits(), getHistory({ limit: 25 })]);
    if (!bal.ok) {
      setState({ s: 'failed', why: bal });
      return;
    }
    setState({ s: 'ready', balance: bal.value.balance });
    if (page.ok) {
      setRows(page.value.entries);
      setCursor(page.value.nextCursor);
      setMore(Boolean(page.value.nextCursor));
    }
  }, []);

  useEffect(() => {
    void first();
  }, [first]);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    const page = await getHistory({ limit: 25, before: cursor });
    setBusy(false);
    if (!page.ok) return;
    setRows((r) => [...r, ...page.value.entries]);
    setCursor(page.value.nextCursor);
    setMore(Boolean(page.value.nextCursor));
  }

  if (state.s === 'failed') return <Trouble why={state.why} retry={first} />;

  return (
    <div className={styles.wrap}>
      <section className={styles.balanceRow}>
        <div>
          <span className={styles.balanceLabel}>Balance</span>
          <span className={styles.balance}>
            {state.s === 'ready' ? state.balance.toLocaleString() : '—'}
          </span>
          <span className={styles.unit}>credits</span>
        </div>
        <p className={styles.unavailable}>
          Buying credits is not live yet. The price per credit is still being
          set — email us and we will top you up by hand in the meantime.
        </p>
      </section>

      <section>
        <h2 className={styles.head}>Packs</h2>
        <ul className={styles.packs}>
          {PACKS.map((p) => {
            const base = PACKS[0].credits / Number(PACKS[0].id.split('_')[1]);
            const rate = p.credits / Number(p.id.split('_')[1]);
            const bonus = Math.round((rate / base - 1) * 100);
            return (
              <li key={p.id} className={styles.pack}>
                <span className={styles.packCredits}>{p.credits.toLocaleString()}</span>
                <span className={styles.packLabel}>credits</span>
                <span className={styles.packBonus}>
                  {bonus > 0 ? `${bonus}% more per credit` : 'base rate'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className={styles.head}>Ledger</h2>
        {rows.length === 0 ? (
          <p className={styles.quiet}>
            {state.s === 'loading' ? 'Reading the ledger…' : 'Nothing has happened on this account yet.'}
          </p>
        ) : (
          <>
            <ul className={styles.ledger}>
              {rows.map((e) => {
                const { label, detail } = describe(e);
                return (
                  <li key={e.id} className={styles.entry}>
                    <span className={styles.when}>
                      {new Date(e.at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className={styles.what}>{label}</span>
                    <span className={styles.detail}>{detail ?? ''}</span>
                    {/*
                      Signed and tabular, so a column of them can be scanned
                      and, if anyone wants to, added up.
                    */}
                    <span className={e.delta < 0 ? styles.debit : styles.credit}>
                      {e.delta > 0 ? '+' : ''}
                      {e.delta.toLocaleString()}
                    </span>
                    <span className={styles.after}>{e.balanceAfter.toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
            {more && (
              <button type="button" className={styles.moreBtn} onClick={() => void loadMore()} disabled={busy}>
                {busy ? 'Loading…' : 'Show older'}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
