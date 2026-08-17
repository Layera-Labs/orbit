import type { Metadata } from 'next';
import { ApiKeys } from '@/components/app/ApiKeys';
import styles from '../app.module.css';

export const metadata: Metadata = {
  title: 'API keys',
};

/**
 * The keys screen.
 *
 * The two-token-kinds note sits here rather than in the docs, because this is
 * where the distinction bites: a developer holding a key and wondering why it
 * cannot mint another one is standing on this page when the question occurs to
 * them.
 */
export default function KeysPage() {
  return (
    <>
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>API keys</h1>
      </header>

      <p className={styles.pageLede}>
        A key authenticates <em>your server</em> — unattended, with no browser and
        no session to refresh — and bills to this account. Your own sign-in is a
        different kind of token, and a key cannot manage keys: one that could
        would outlive revoking the one that leaked.
      </p>

      <ApiKeys />
    </>
  );
}
