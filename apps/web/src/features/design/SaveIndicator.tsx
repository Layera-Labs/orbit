'use client';

/**
 * Whether the work is actually on disk.
 *
 * Autosave was completely invisible in both directions — no confirmation, and
 * more importantly no warning. A failed write (quota is the realistic one; a
 * video project carries its media) left the user editing a document that was
 * no longer being saved, with nothing to tell them.
 *
 * So this stays quiet while things are fine and becomes loud only when they
 * are not. `idle` renders nothing at all: an indicator that is always present
 * is furniture people stop seeing, which defeats the point of the state that
 * matters.
 */
import { useSaveState } from '@/db/persist';
import { Icon } from '@/brand/Icon';
import styles from './Design.module.css';

export function SaveIndicator() {
  const { status, error } = useSaveState();

  if (status === 'idle') return null;

  if (status === 'failed')
    return (
      <span className={styles.saveFailed} role="alert" title={error}>
        <Icon name="alert" size={14} />
        Not saved
      </span>
    );

  return (
    <span className={`${styles.saveState} w-data`} aria-live="polite">
      {status === 'saving' ? 'Saving' : 'Saved'}
    </span>
  );
}
