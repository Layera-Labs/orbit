'use client';

/**
 * The pinned credit balance.
 *
 * Four states, and none of them is a spinner sitting where a number will be:
 * the slot reserves its own height so the sidebar never reflows when the figure
 * lands. Signed out shows nothing at all rather than a zero — a zero balance
 * and an unknown balance mean very different things, and showing one as the
 * other would tell a signed-out visitor their account is empty.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCredits } from '@/lib/orbit';
import styles from './Balance.module.css';

type State =
  | { s: 'loading' }
  | { s: 'ok'; balance: number }
  | { s: 'out' }
  | { s: 'down' };

/** Below this, an integration is about to start failing mid-render. */
const LOW = 50;

export function Balance() {
  const [state, setState] = useState<State>({ s: 'loading' });

  useEffect(() => {
    let alive = true;
    void getCredits().then((r) => {
      if (!alive) return;
      if (r.ok) setState({ s: 'ok', balance: r.value.balance });
      else if (r.kind === 'unauthenticated') setState({ s: 'out' });
      else setState({ s: 'down' });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state.s === 'out') return null;

  const low = state.s === 'ok' && state.balance < LOW;

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Balance</span>
      <span className={`${styles.value} ${low ? styles.low : ''}`}>
        {state.s === 'ok' ? state.balance.toLocaleString() : '—'}
      </span>
      {state.s === 'down' && <span className={styles.note}>service unreachable</span>}
      {low && (
        <Link href="/app/credits" className={styles.top}>
          Top up
        </Link>
      )}
    </div>
  );
}
