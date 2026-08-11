'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Icon } from '@layera-labs/orbit-brand';
import { renameProject } from '@/db/projects';
import type { ProjectRow } from '@/db/schema';
import styles from './ProjectBar.module.css';

/**
 * The project's identity bar.
 *
 * The host owns the name deliberately: `@layera-labs/orbit-editor`'s own TopBar keeps its
 * title in local state and never writes it to the document, so the editor is
 * not a place a name can be read back from.
 */
export function ProjectBar({
  project,
  onRename,
  children,
}: {
  project: ProjectRow;
  onRename?: (name: string) => void;
  children?: ReactNode;
}) {
  const [name, setName] = useState(project.name);

  const commit = () => {
    const next = name.trim() || 'Untitled';
    if (next !== name) setName(next);
    if (next === project.name) return;
    void renameProject(project.id, next);
    onRename?.(next);
  };

  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.back} aria-label="Back to the bench">
        <Icon name="chevronLeft" size={18} />
      </Link>
      <input
        className={styles.name}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label="Project name"
        spellCheck={false}
      />
      <span className={`${styles.meta} w-data`}>
        {'width' in project.data ? `${project.data.width}×${project.data.height}` : ''}
      </span>
      <div className={styles.actions}>{children}</div>
    </header>
  );
}
