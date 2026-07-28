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
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    getProject(projectId)
      .then((found) => {
        if (!live) return;
        if (!found) setMissing(true);
        else setRow(found);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [projectId]);

  if (missing)
    return (
      <div className={styles.missing}>
        <p>That project is not in this browser&rsquo;s storage.</p>
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
