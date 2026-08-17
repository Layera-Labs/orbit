'use client';

/**
 * Usage — PLATE 08.
 *
 * The screen a developer opens when a bill surprises them, so it has to answer
 * "why", not just "how much": a shape over time, then where the money goes by
 * tier, then the individual renders. Each layer explains the one above it.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  describe,
  loadSince,
  renderRows,
  spendByDay,
  spendByTier,
  type Failure,
  type LedgerEntry,
} from '@/lib/ledger';
import { Spend } from './Spend';
import styles from './Usage.module.css';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

type State =
  | { s: 'loading' }
  | { s: 'ready'; entries: LedgerEntry[]; truncated: boolean }
  | { s: 'failed'; why: Failure };

export function Usage() {
  const [days, setDays] = useState(30);
  const [state, setState] = useState<State>({ s: 'loading' });

  const load = useCallback(async (window: number) => {
    setState({ s: 'loading' });
    const since = new Date();
    since.setDate(since.getDate() - window);
    const r = await loadSince(since);
    setState(
      r.ok
        ? { s: 'ready', entries: r.value.entries, truncated: r.value.truncated }
        : { s: 'failed', why: r },
    );
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const entries = state.s === 'ready' ? state.entries : [];
  const byDay = spendByDay(entries, since, new Date());
  const renders = renderRows(entries);
  const byTier = spendByTier(renders);
  const total = byDay.reduce((n, d) => n + d.credits, 0);
  const maxTier = byTier[0]?.credits ?? 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.range} role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            aria-pressed={r.days === days}
            className={`${styles.rangeBtn} ${r.days === days ? styles.on : ''}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {state.s === 'failed' ? (
        <Trouble why={state.why} retry={() => void load(days)} />
      ) : (
        <>
          <section className={styles.chartBlock}>
            <div className={styles.chartHead}>
              <span className={styles.total}>{total.toLocaleString()}</span>
              <span className={styles.totalLabel}>
                credits spent in {days} days
              </span>
            </div>
            <Spend days={byDay} loading={state.s === 'loading'} />
          </section>

          {state.s === 'ready' && state.truncated && (
            <p className={styles.truncated} role="status">
              This window is partial — there were more entries than one read
              covers, so the oldest are not counted here.
            </p>
          )}

          <section>
            <h2 className={styles.head}>Renders by tier</h2>
            <p className={styles.sectionNote}>
              Refunded renders are counted but cost nothing, so these credits are
              what renders actually took. Generation is metered separately.
            </p>
            {byTier.length === 0 ? (
              <p className={styles.quiet}>
                {state.s === 'loading' ? 'Reading the ledger…' : 'No renders in this window.'}
              </p>
            ) : (
              <ul className={styles.tiers}>
                {byTier.map((t) => (
                  <li key={t.tier} className={styles.tier}>
                    <span className={styles.tierName}>{t.tier}</span>
                    {/* The bar is the comparison; the number is the fact. */}
                    <span className={styles.barTrack} aria-hidden="true">
                      <span
                        className={styles.bar}
                        style={{ width: `${maxTier ? (t.credits / maxTier) * 100 : 0}%` }}
                      />
                    </span>
                    <span className={styles.tierRenders}>
                      {t.renders} {t.renders === 1 ? 'render' : 'renders'}
                      {t.failed > 0 ? `, ${t.failed} refunded` : ''}
                    </span>
                    <span className={styles.tierCredits}>{t.credits.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className={styles.head}>Renders</h2>
            {renders.length === 0 ? (
              <p className={styles.quiet}>
                {state.s === 'loading' ? 'Reading the ledger…' : 'Nothing rendered in this window.'}
              </p>
            ) : (
              <ul className={styles.log}>
                {renders.map((r) => (
                  <li key={r.id} className={styles.logRow}>
                    <span className={styles.when}>
                      {new Date(r.at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className={styles.tierTag}>{r.tier ?? '—'}</span>
                    <span className={styles.secs}>
                      {r.billedSec != null ? `${r.billedSec}s` : '—'}
                    </span>
                    {/*
                      A failed render is shown, not hidden, with 0 charged. The
                      refund policy is only believable if you can see it happen.
                    */}
                    <span className={r.failed ? styles.failed : styles.done}>
                      {r.failed ? 'failed, refunded' : 'rendered'}
                    </span>
                    <span className={styles.charged}>{r.charged.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function Trouble({ why, retry }: { why: Failure; retry: () => void }) {
  if (why.kind === 'unauthenticated') {
    return (
      <div className={styles.empty}>
        <h3>Sign in to see your usage</h3>
        <p>Usage belongs to an account, so this page needs a session. Sign-in is not wired up yet.</p>
      </div>
    );
  }
  return (
    <div className={styles.empty}>
      <h3>
        {why.kind === 'upstream_down'
          ? 'The render service is not reachable'
          : 'Could not read the ledger'}
      </h3>
      <p>{why.kind === 'upstream_down' ? 'Your history is unaffected.' : why.message}</p>
      <button type="button" className={styles.retry} onClick={retry}>
        Try again
      </button>
    </div>
  );
}

export { describe };
