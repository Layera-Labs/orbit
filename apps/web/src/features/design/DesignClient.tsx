'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProject } from '@/db/projects';
import type { ProjectRow } from '@/db/schema';
import { MotionDesign } from './MotionDesign';
import { StillDesign } from './StillDesign';
import '@/styles/orbit-editor-skin.css';
import styles from './Design.module.css';

/**
 * One editor, two document kinds.
 *
 * The kinds branch into separate components rather than one component with
 * conditionals, because each owns a different set of hooks — a still builds an
 * `OrbitStore` and an `EditorProvider`, motion drives a canvas preview loop and
 * the video store. Sharing one component would mean calling hooks conditionally.
 */
export function DesignClient({ projectId }: { projectId: string }) {
  const [row, setRow] = useState<ProjectRow | null>(null);
  /*
   * Absent and unreadable are different, and saying the wrong one is its own
   * bug: telling someone their project is "not in this browser" when the
   * database merely failed to open invites them to give up on work that is
   * still there.
   */
  const [failure, setFailure] = useState<{ title: string; detail?: string } | null>(null);

  useEffect(() => {
    let live = true;
    getProject(projectId)
      .then((found) => {
        if (!live) return;
        if (found) setRow(found);
        else setFailure({ title: 'That project is not in this browser’s storage.' });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setFailure({
          title: 'Orbit could not open its local storage.',
          detail: err instanceof Error ? err.message : undefined,
        });
      });
    return () => {
      live = false;
    };
  }, [projectId]);

  if (failure)
    return (
      <div className={styles.missing}>
        <p>{failure.title}</p>
        {failure.detail && <p className={styles.detail}>{failure.detail}</p>}
        <Link href="/" className={styles.ghost}>
          Back to your work
        </Link>
      </div>
    );

  // Nothing is rendered until the row is read: both shells need the document to
  // build their state, and mounting them against a placeholder would build a
  // store we immediately throw away.
  if (!row) return <div className={styles.frame} />;

  const rename = (name: string) => setRow({ ...row, name });

  return row.kind === 'video' ? (
    <MotionDesign row={row} onRename={rename} />
  ) : (
    <StillDesign row={row} onRename={rename} />
  );
}
