'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/brand/Icon';
import { paintFilmstrip } from './filmstrip';
import { paintWaveform } from './waveform';
import styles from './Timeline.module.css';

/**
 * What the timeline needs to draw ONE bar, whatever it is underneath.
 *
 * A shot, a sound cue and a caption are three different shapes in the model —
 * `start`/`duration` on a track versus `start`/`end` in `project.overlays` — and
 * flattening them here is what lets a single component, a single drag hook and a
 * single set of trim handles serve all three.
 */
export interface ClipView {
  id: string;
  start: number;
  duration: number;
  label: string;
  variant: 'video' | 'image' | 'audio' | 'text';
  /** Decorative strip. Absent, slow or failed changes nothing about editing. */
  art?:
    | { kind: 'film'; src: string; trimIn: number; speed: number; still: boolean }
    | { kind: 'wave'; src: string; trimIn: number };
  muted?: boolean;
}

export function Clip({
  view,
  width,
  left,
  height,
  selected,
  dragging,
  onPointerDown,
  onSelect,
}: {
  view: ClipView;
  width: number;
  left: number;
  height: number;
  selected: boolean;
  dragging: boolean;
  onPointerDown(event: React.PointerEvent, mode: 'move' | 'trim-in' | 'trim-out'): void;
  onSelect(): void;
}) {
  const artRef = useRef<HTMLCanvasElement>(null);
  const { art } = view;
  // Rounded so a sub-pixel width change doesn't re-decode the whole strip.
  const artWidth = Math.max(1, Math.round(width));
  const artHeight = Math.max(1, Math.round(height));

  useEffect(() => {
    const canvas = artRef.current;
    if (!canvas || !art) return;
    if (art.kind === 'film')
      return paintFilmstrip(canvas, {
        src: art.src,
        kind: art.still ? 'image' : 'video',
        trimIn: art.trimIn,
        duration: view.duration,
        speed: art.speed,
        width: artWidth,
        height: artHeight,
      });
    return paintWaveform(canvas, {
      src: art.src,
      trimIn: art.trimIn,
      duration: view.duration,
      width: artWidth,
      height: artHeight,
      colour: 'rgba(244, 241, 236, 0.34)',
    });
  }, [art, view.duration, artWidth, artHeight]);

  return (
    <div
      className={styles.clip}
      data-kind={view.variant}
      data-selected={selected}
      data-dragging={dragging}
      style={{ left, width, height }}
      onPointerDown={(e) => {
        // Left button only — a right-click must not start a drag.
        if (e.button !== 0) return;
        onPointerDown(e, 'move');
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`${view.label}, ${view.duration.toFixed(2)} seconds`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Present only when there is art to paint, so a caption bar has no
          stray empty canvas layered over it. */}
      {art && <canvas ref={artRef} className={styles.clipArt} aria-hidden="true" />}

      <div className={styles.clipLabel}>
        {view.variant === 'text' && <Icon name="text" size={12} />}
        <span className={styles.clipName}>{view.label}</span>
        {width > 96 && (
          <span className={`${styles.clipTime} w-data`}>{view.duration.toFixed(1)}s</span>
        )}
      </div>

      {view.muted && (
        <span className={styles.clipFlag} title="Muted">
          <Icon name="mute" size={12} />
        </span>
      )}

      <span
        className={`${styles.handle} ${styles.handleIn}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          onPointerDown(e, 'trim-in');
        }}
        role="presentation"
      />
      <span
        className={`${styles.handle} ${styles.handleOut}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          onPointerDown(e, 'trim-out');
        }}
        role="presentation"
      />
    </div>
  );
}
