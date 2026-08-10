'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/brand/Icon';
import { ThemeSwitch } from '@/brand/ThemeSwitch';
import { Plate } from '@/brand/Plate';
import { renameProject } from '@/db/projects';
import type { ProjectRow } from '@/db/schema';
import { SaveIndicator } from './SaveIndicator';
import styles from './Design.module.css';

export interface HistoryApi {
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
}

/**
 * The host owns the project name. `@layera-labs/orbit-editor`'s own TopBar keeps its title
 * in local state and never writes it back to the document, so reading it from
 * there would be reading a value nothing persists.
 */
export function DesignBar({
  project,
  meta,
  history,
  onRename,
  children,
}: {
  project: ProjectRow;
  meta: string;
  history: HistoryApi;
  onRename(name: string): void;
  children?: ReactNode;
}) {
  const [name, setName] = useState(project.name);

  useEffect(() => setName(project.name), [project.name]);

  const commit = () => {
    const next = name.trim() || 'Untitled';
    if (next === project.name) return setName(next);
    setName(next);
    onRename(next);
    void renameProject(project.id, next);
  };

  return (
    <>
      <Link href="/" className={styles.mark} aria-label="Orbit home">
        <Plate size={26} detail="mark" />
      </Link>

      <input
        className={styles.name}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setName(project.name);
            e.currentTarget.blur();
          }
        }}
        aria-label="Project name"
        spellCheck={false}
      />
      <span className={`${styles.meta} w-data`}>{meta}</span>

      <span className={styles.divider} aria-hidden="true" />

      <button
        className={styles.iconButton}
        onClick={history.undo}
        disabled={!history.canUndo}
        aria-label="Undo"
      >
        <Icon name="undo" size={16} />
      </button>
      <button
        className={styles.iconButton}
        onClick={history.redo}
        disabled={!history.canRedo}
        aria-label="Redo"
      >
        <Icon name="redo" size={16} />
      </button>

      <span className={styles.barSpacer} />
      <SaveIndicator />
      <ThemeSwitch />
      <span className={styles.divider} aria-hidden="true" />
      {children}
    </>
  );
}
