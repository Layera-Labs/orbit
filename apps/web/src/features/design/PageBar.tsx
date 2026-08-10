'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorState, useStore } from '@layera-labs/orbit-editor';
import type { ID } from '@layera-labs/orbit-model';
import { Icon } from '@/brand/Icon';
import { useDesign } from '@/store/designStore';
import styles from './PageBar.module.css';

/**
 * The page bar, pinned along the bottom of the editor.
 *
 * It replaces the SDK's floating page strip, which sat in the bottom-left corner
 * over the artwork and collided with the zoom pill on a narrow canvas. A page
 * rail is not transient chrome — it is where you are in the document — so it
 * gets a real edge to sit on instead of hovering over the thing it indexes.
 */
export function PageBar() {
  const store = useStore();
  const state = useEditorState();
  const [overview, setOverview] = useState(false);
  const showRuler = useDesign((s) => s.showRuler);
  const showGrid = useDesign((s) => s.showGrid);
  const toggleRuler = useDesign((s) => s.toggleRuler);
  const toggleGrid = useDesign((s) => s.toggleGrid);

  const pages = state.doc.pages;
  const activeId = state.activePageId;
  const index = Math.max(0, pages.findIndex((p) => p.id === activeId));

  return (
    <>
      <div className={styles.bar}>
        <div className={styles.strip} role="tablist" aria-label="Pages">
          {pages.map((page, i) => (
            <button
              key={page.id}
              role="tab"
              aria-selected={page.id === activeId}
              className={styles.thumb}
              data-on={page.id === activeId}
              title={page.name ?? `Page ${i + 1}`}
              onClick={() => store.setActivePage(page.id)}
            >
              <PageThumb page={page} />
              <span className={`${styles.thumbIndex} w-data`}>{i + 1}</span>
            </button>
          ))}
          <button
            className={styles.add}
            onClick={() => store.addPage()}
            aria-label="Add a page"
            title="Add a page"
          >
            <Icon name="plus" size={15} />
          </button>
        </div>

        <span className={styles.spacer} />

        <span className={`${styles.count} w-data`}>
          {index + 1} / {pages.length}
        </span>

        <span className={styles.sep} aria-hidden="true" />

        <button
          className={styles.tool}
          data-on={overview}
          onClick={() => setOverview((o) => !o)}
          aria-label="All pages"
          title="All pages"
        >
          <Icon name="pages" size={16} />
        </button>
        <button
          className={styles.tool}
          data-on={showRuler}
          aria-pressed={showRuler}
          onClick={toggleRuler}
          aria-label="Rulers"
          title="Rulers"
        >
          <Icon name="ruler" size={16} />
        </button>
        <button
          className={styles.tool}
          data-on={showGrid}
          aria-pressed={showGrid}
          onClick={toggleGrid}
          aria-label="Grid"
          title="Grid"
        >
          <Icon name="grid" size={16} />
        </button>
        <FullscreenButton />
      </div>

      {overview && <PagesOverview onClose={() => setOverview(false)} />}
    </>
  );
}

/** A page at its true proportions, filled with its own background. */
/** A page's own background as a CSS value, or the neutral surface when it has none. */
function pageFill(bg: { type?: string; color?: string; css?: string } | undefined): string {
  if (bg?.type === 'solid' && bg.color) return bg.color;
  if (bg?.type === 'gradient' && bg.css) return bg.css;
  return 'var(--w-s2)';
}

function PageThumb({ page }: { page: { width: number; height: number; background: unknown } }) {
  const ratio = page.width / page.height;
  const cap = 30;
  const w = ratio >= 1 ? cap : cap * ratio;
  const h = ratio >= 1 ? cap / ratio : cap;
  const bg = page.background as { type?: string; color?: string; css?: string } | undefined;
  return (
    <span
      className={styles.thumbArt}
      style={{
        width: Math.round(w),
        height: Math.round(h),
        background: pageFill(bg),
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Fullscreen, driven by the real Fullscreen API.
 *
 * State is read from `document.fullscreenElement` on the browser's own event
 * rather than from a local boolean — pressing Escape exits fullscreen without
 * telling React, and a local flag would then be lying about it.
 */
function FullscreenButton() {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  return (
    <button
      className={styles.tool}
      data-on={full}
      aria-pressed={full}
      aria-label={full ? 'Leave fullscreen' : 'Fullscreen'}
      title={full ? 'Leave fullscreen' : 'Fullscreen'}
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      }}
    >
      <Icon name="fullscreen" size={16} />
    </button>
  );
}

/** Every page at once, with its title editable in place. */
function PagesOverview({ onClose }: { onClose(): void }) {
  const store = useStore();
  const state = useEditorState();
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(onClose, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className={styles.overview}
      role="dialog"
      aria-label="All pages"
      ref={ref}
      onPointerDown={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className={styles.overviewInner}>
        <header className={styles.overviewHead}>
          <h2 className={styles.overviewTitle}>Pages</h2>
          <span className={`${styles.count} w-data`}>{state.doc.pages.length}</span>
          <button className={styles.tool} onClick={close} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className={styles.overviewGrid}>
          {state.doc.pages.map((page, i) => (
            <article key={page.id} className={styles.card} data-on={page.id === state.activePageId}>
              <button
                className={styles.cardArt}
                onClick={() => {
                  store.setActivePage(page.id);
                  close();
                }}
                aria-label={`Open ${page.name ?? `page ${i + 1}`}`}
                style={{ aspectRatio: `${page.width} / ${page.height}` }}
              >
                <span
                  className={styles.cardFill}
                  style={{ background: pageFill(page.background) }}
                />
                <span className={`${styles.cardIndex} w-data`}>{i + 1}</span>
              </button>
              <PageTitleField id={page.id} name={page.name ?? ''} index={i} />
              <div className={styles.cardActions}>
                <button
                  className={styles.tool}
                  onClick={() => store.duplicatePage(page.id)}
                  aria-label={`Duplicate page ${i + 1}`}
                  title="Duplicate"
                >
                  <Icon name="duplicate" size={14} />
                </button>
                <button
                  className={`${styles.tool} ${styles.danger}`}
                  onClick={() => store.deletePage(page.id)}
                  disabled={state.doc.pages.length <= 1}
                  aria-label={`Delete page ${i + 1}`}
                  title="Delete"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </article>
          ))}

          <button
            className={styles.addCard}
            onClick={() => store.addPage()}
            aria-label="Add a page"
          >
            <Icon name="plus" size={18} />
            Add a page
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The page title.
 *
 * Held locally while focused and committed on blur/Enter, so every keystroke is
 * not a document transaction — that would put one undo entry per character.
 */
function PageTitleField({ id, name, index }: { id: ID; name: string; index: number }) {
  const store = useStore();
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      className={styles.cardTitle}
      value={draft ?? name}
      placeholder={`Page ${index + 1}`}
      aria-label={`Title for page ${index + 1}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null && draft !== name) store.renamePage(id, draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
