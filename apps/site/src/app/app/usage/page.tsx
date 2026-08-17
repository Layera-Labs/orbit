import type { Metadata } from 'next';
import { Usage } from '@/components/app/Usage';
import styles from '../app.module.css';

export const metadata: Metadata = { title: 'Usage' };

/** PLATE 08 — where the credits went, and why. */
export default function UsagePage() {
  return (
    <>
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Usage</h1>
      </header>
      <p className={styles.pageLede}>
        Every render places a hold before ffmpeg starts and settles against the
        real output, so what you see here is what actually happened — including
        the renders that failed and cost nothing.
      </p>
      <Usage />
    </>
  );
}
