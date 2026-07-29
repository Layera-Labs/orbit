'use client';

import Link from 'next/link';
import styles from './Failure.module.css';

/**
 * What the app shows when something threw.
 *
 * There were no error boundaries at all before this, which in React 18 means a
 * single throw during render unmounts the entire tree — the editor becomes a
 * white page with no explanation and no way back. That is the worst possible
 * outcome for an app whose work lives in the browser: it looks exactly like
 * losing everything, even when the project is still safely in IndexedDB.
 *
 * It deliberately shows the real message. "Something went wrong" is a shrug; a
 * person can paste an actual error into a bug report, and the difference
 * between a quota failure and a decode failure is the difference between
 * knowing what to do and not.
 */
export function Failure({
  title,
  body = 'Your projects are stored in this browser and were not touched by this. Reloading is usually enough.',
  error,
  onRetry,
  retryLabel = 'Try again',
}: {
  title: string;
  /** The reassurance line. A 404 is not a crash and must not claim to be one. */
  body?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const message = error instanceof Error ? error.message : error ? String(error) : undefined;
  // A `digest` is all a production build gives you for a server error; it is the
  // only handle on the server-side log, so it must be shown.
  const digest = (error as { digest?: string } | undefined)?.digest;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>{body}</p>
      {(message || digest) && (
        <p className={styles.detail}>
          {message}
          {digest ? `\n\nreference: ${digest}` : ''}
        </p>
      )}
      <div className={styles.actions}>
        {onRetry && (
          <button type="button" className={styles.primary} onClick={onRetry}>
            {retryLabel}
          </button>
        )}
        <Link href="/" className={styles.quiet}>
          Back to your work
        </Link>
      </div>
    </div>
  );
}
