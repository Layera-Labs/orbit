'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/brand/Icon';
import { useDesign } from '@/store/designStore';
import styles from './Design.module.css';

/**
 * The editor's four docks plus the strip along the bottom.
 *
 * Slots rather than children so the grid areas are assigned here, once, and no
 * surface can accidentally position itself over another.
 */
export function DesignFrame({
  bar,
  rail,
  panel,
  canvas,
  inspector,
  strip,
}: {
  bar: ReactNode;
  rail: ReactNode;
  panel: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
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
      <div className={styles.inspector}>{inspector}</div>
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

export function InspectorShell({
  title,
  kind,
  children,
}: {
  title: string;
  kind?: string;
  children: ReactNode;
}) {
  const open = useDesign((s) => s.inspectorOpen);
  const setOpen = useDesign((s) => s.setInspectorOpen);

  if (!open)
    return (
      <div className={styles.inspectorStub}>
        <button
          className={styles.iconButton}
          onClick={() => setOpen(true)}
          aria-label="Show inspector"
        >
          <Icon name="sliders" size={17} />
        </button>
      </div>
    );

  return (
    <section className={styles.inspectorInner} aria-label="Inspector">
      <div className={styles.inspectorHead}>
        <h2 className={styles.inspectorTitle}>{title}</h2>
        {kind && <span className={`${styles.inspectorKind} w-data`}>{kind}</span>}
        <button
          className={styles.iconButton}
          onClick={() => setOpen(false)}
          aria-label="Hide inspector"
        >
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
      <div className={styles.inspectorBody}>{children}</div>
    </section>
  );
}
