'use client';

import { useEditorState } from '@orbit/editor';
import { useDesign } from '@/store/designStore';
import styles from './CanvasGuides.module.css';

/** Ruler steps in DOCUMENT pixels; the first that is wide enough on screen wins. */
const STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const MIN_TICK_PX = 64;
const GRID_MIN_PX = 8;

function stepFor(zoom: number, min: number): number {
  return STEPS.find((s) => s * zoom >= min) ?? STEPS[STEPS.length - 1];
}

/**
 * Rulers and an alignment grid, drawn in HTML over the canvas.
 *
 * Deliberately NOT inside the Konva stage. Putting them there would mean editing
 * `packages/render` — a shared SDK package — to carry an app-level preference,
 * and the grid would then be rasterized into anything the stage exports. As an
 * overlay it can never end up in a rendered PNG.
 *
 * Both read the SAME viewport the stage is drawn with, so a tick genuinely lands
 * on the document coordinate it names at any zoom or pan.
 */
export function CanvasGuides() {
  const state = useEditorState();
  const showRuler = useDesign((s) => s.showRuler);
  const showGrid = useDesign((s) => s.showGrid);

  const page = state.doc.pages.find((p) => p.id === state.activePageId) ?? state.doc.pages[0];
  const { zoom, x, y } = state.viewport;
  if (!page || (!showRuler && !showGrid)) return null;

  const pageW = page.width * zoom;
  const pageH = page.height * zoom;

  return (
    <>
      {showGrid && (
        <div
          className={styles.grid}
          aria-hidden="true"
          style={{
            left: x,
            top: y,
            width: pageW,
            height: pageH,
            // Clipped to the page itself: a grid running across the whole
            // workspace is graph-paper decoration, not an alignment aid.
            backgroundSize: `${stepFor(zoom, GRID_MIN_PX) * zoom}px ${
              stepFor(zoom, GRID_MIN_PX) * zoom
            }px`,
          }}
        />
      )}

      {showRuler && (
        <>
          <Ruler axis="x" zoom={zoom} offset={x} />
          <Ruler axis="y" zoom={zoom} offset={y} />
          {/* The corner where the two meet, so neither ruler's first tick is
              left sitting on the other's track. */}
          <div className={styles.corner} aria-hidden="true" />
        </>
      )}
    </>
  );
}

function Ruler({ axis, zoom, offset }: { axis: 'x' | 'y'; zoom: number; offset: number }) {
  const step = stepFor(zoom, MIN_TICK_PX);
  const px = step * zoom;
  // First tick at or before the visible origin, so ticks do not drift on pan.
  const first = Math.floor(-offset / px) * px + offset;
  const span = axis === 'x' ? window.innerWidth : window.innerHeight;
  const ticks: { at: number; value: number }[] = [];
  for (let at = first; at < span + px; at += px) {
    ticks.push({ at, value: Math.round((at - offset) / zoom) });
  }

  return (
    <div className={axis === 'x' ? styles.rulerX : styles.rulerY} aria-hidden="true">
      {ticks.map((t) => (
        <span
          key={t.value}
          className={styles.tick}
          style={axis === 'x' ? { left: t.at } : { top: t.at }}
        >
          <span className={`${styles.tickLabel} w-data`}>{t.value}</span>
        </span>
      ))}
    </div>
  );
}
