import type { Metadata } from 'next';
import { Credits } from '@/components/app/Credits';
import styles from '../app.module.css';

export const metadata: Metadata = { title: 'Credits' };

/** PLATE 07 — balance, packs, and the ledger behind them. */
export default function CreditsPage() {
  return (
    <>
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Credits</h1>
      </header>
      <p className={styles.pageLede}>
        One credit is one second of 1080p output. Every movement is a row below:
        a hold when a render starts, a settle when it finishes, a refund in full
        when it fails.
      </p>
      <Credits />
    </>
  );
}
