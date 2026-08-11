'use client';

import type { ReactNode } from 'react';
import { Icon } from '@layera-labs/orbit-brand';
import styles from './Design.module.css';

/**
 * The editor's three docks plus the strip along the bottom.
 *
 * There is no right-hand inspector any more: a selection is edited through the
 * floating property bar over the canvas, so the space it used to take is the
 * artwork's.
 *
 * Slots rather than children so the grid areas are assigned here, once, and no
 * surface can accidentally position itself over another.
 */
export function DesignFrame({
  bar,
  rail,
  panel,
  canvas,
  strip,
}: {
  bar: ReactNode;
  rail: ReactNode;
  panel: ReactNode;
  canvas: ReactNode;
  strip: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <header className={styles.bar}>{bar}</header>
      <div className={styles.rail}>{rail}</div>
      {/* Not rendered at all when closed — an `auto` column with no content is
          zero wide, so the canvas actually gets the space back. */}
      {panel && <div className={styles.panel}>{panel}</div>}
      <div className={styles.canvasCol}>{canvas}</div>
      <div className={styles.strip}>{strip}</div>
    </div>
  );
}

export function ToolPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <section className={styles.panelInner} aria-label={title}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <button className={styles.iconButton} onClick={onClose} aria-label="Close panel">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}
