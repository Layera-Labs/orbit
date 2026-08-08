'use client';

import { useEditorState, useStore } from '@orbit/editor';
import { ColourRow, SwatchGrid } from '@/brand/Colour';
import styles from './Panels.module.css';

const SIZES = [
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Story', w: 1080, h: 1920 },
  { label: 'Portrait', w: 1080, h: 1350 },
  { label: 'Wide', w: 1920, h: 1080 },
  { label: 'A4', w: 2480, h: 3508 },
  { label: 'Banner', w: 1500, h: 500 },
];

const SOLIDS = [
  '#ffffff',
  '#f4f1ec',
  '#100f0e',
  '#211f1d',
  '#c4553d',
  '#6f8f63',
  '#8a8580',
  '#2f4858',
  '#d8cfc0',
];

/**
 * Frame and backdrop for a still.
 *
 * The SDK ships `SizeBackgroundBar` for this, but it is a floating pill designed
 * to sit over a canvas — in a docked column it would be a popover inside a
 * panel, which is one layer of chrome too many.
 */
export function StillDesignPanel() {
  const store = useStore();
  const state = useEditorState();
  const page = state.doc.pages.find((p) => p.id === state.activePageId) ?? state.doc.pages[0];

  return (
    <div className={styles.stack}>
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Size</h3>
        <div className={styles.presets}>
          {SIZES.map((s) => (
            <button
              key={s.label}
              className={styles.preset}
              data-on={page?.width === s.w && page?.height === s.h}
              aria-pressed={page?.width === s.w && page?.height === s.h}
              onClick={() => store.resizePage(s.w, s.h)}
            >
              <span
                className={styles.presetSwatch}
                style={{
                  width: `${Math.min(100, (s.w / s.h) * 46)}%`,
                  height: 34,
                  margin: '0 auto',
                }}
              />
              {s.label}
            </button>
          ))}
        </div>
        {page && (
          <p className={`${styles.note} w-data`}>
            {page.width} × {page.height} px
          </p>
        )}
      </div>

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Backdrop</h3>
        {/* Small squares in a grid, and the selected one is ringed rather than
            sat on a tinted plate — a plate behind a swatch mixes with the very
            colour it is meant to be showing. */}
        <SwatchGrid
          label="Backdrop"
          colours={SOLIDS}
          value={page?.background?.type === 'solid' ? page.background.color : undefined}
          onChange={(colour) => store.setBackground({ type: 'solid', color: colour })}
        />
        {/* The Gradient tab appears here and NOT on an element's fill, because
            `Page.background` is the only thing in the model that can store one —
            an element's `fill` is a plain colour string. */}
        <ColourRow
          label="Custom"
          value={page?.background?.type === 'solid' ? page.background.color : '#ffffff'}
          onChange={(colour) => store.setBackground({ type: 'solid', color: colour })}
          gradient={{
            value: page?.background?.type === 'gradient' ? page.background.css : null,
            onChange: (css) => store.setBackground({ type: 'gradient', css }),
          }}
        />
      </div>

      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Pages</h3>
        <button className={styles.action} onClick={() => store.addPage()}>
          Add a page
        </button>
        {state.doc.pages.length > 1 && (
          <button
            className={`${styles.action} ${styles.danger}`}
            onClick={() => store.deletePage(state.activePageId)}
          >
            Delete this page
          </button>
        )}
      </div>
    </div>
  );
}
