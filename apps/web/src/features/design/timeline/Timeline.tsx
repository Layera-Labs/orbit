'use client';

import { Fragment, useCallback, useMemo, useRef } from 'react';
import type {
  AudioTrack,
  Overlay,
  VideoProject,
  VisualTrack,
} from '@layera-labs/orbit-video/browser';
import { Icon } from '@/brand/Icon';
import { useDesign, PX_PER_SECOND_MAX, PX_PER_SECOND_MIN } from '@/store/designStore';
import { addVisualTrack, byStart, overlayLabel, useVideo } from '@/store/videoStore';
import { Clip, type ClipView } from './Clip';
import { useClipDrag, type LaneRect } from './useClipDrag';
import styles from './Timeline.module.css';

/**
 * A lane. Discriminated on `kind` so `row.track` narrows to the right track
 * type — without the explicit union TypeScript widens both fields independently
 * and a visual-only field like `transitionIn` stops resolving.
 */
type Row =
  | { id: string; kind: 'visual'; track: VisualTrack; base: boolean }
  | { id: string; kind: 'audio'; track: AudioTrack; base: boolean }
  /** One lane per caption `layer`, so overlapping titles never sit on top of
   *  each other and become unclickable. */
  | { id: string; kind: 'text'; layer: number; overlays: Overlay[]; base: false };

/** Seconds of empty runway past the end, so a clip can be dragged later. */
const TAIL_SECONDS = 6;
const MIN_SPAN = 10;

export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}

/**
 * Ruler labels, not the transport clock.
 *
 * The playhead readout wants hundredths; a graduation does not — a row of
 * `0:02.00` `0:04.00` is noise, and at close zoom the labels crowd each other.
 * Sub-second steps get one decimal, everything else gets none.
 */
function formatTick(seconds: number, step: number): string {
  const m = Math.floor(seconds / 60);
  const rest = seconds - m * 60;
  const digits = step < 1 ? 1 : 0;
  return `${m}:${rest.toFixed(digits).padStart(digits ? 4 : 2, '0')}`;
}

/** A ruler interval that lands on a round number at the current zoom. */
function tickStep(pxPerSec: number): number {
  const target = 96 / pxPerSec;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s >= target) ?? 600;
}

export function Timeline({
  project,
  time,
  duration,
  selection,
  playing,
  onSeek,
  onTogglePlay,
  onSelect,
  onEditTransition,
  onDropMedia,
}: {
  project: VideoProject;
  time: number;
  duration: number;
  selection: string | null;
  playing: boolean;
  onSeek(t: number): void;
  onTogglePlay(): void;
  onSelect(id: string | null): void;
  onEditTransition(clipId: string): void;
  /** A tile dragged out of a panel and dropped on a lane. */
  onDropMedia(mediaId: string, trackId: string, at: number): void;
}) {
  const pxPerSec = useDesign((s) => s.pxPerSec);
  const zoomBy = useDesign((s) => s.zoomBy);
  const snap = useDesign((s) => s.snap);
  const setSnap = useDesign((s) => s.setSnap);
  const apply = useVideo((s) => s.apply);

  const lanes = useRef(new Map<string, HTMLDivElement>());
  const drag = useClipDrag({ project, pxPerSec, snap, playhead: time });

  const tracks = project.tracks ?? [];
  const visual = useMemo(
    () => tracks.filter((t): t is VisualTrack => t.kind === 'visual'),
    [tracks],
  );
  const audio = useMemo(
    () => tracks.filter((t): t is AudioTrack => t.kind === 'audio'),
    [tracks],
  );

  /**
   * Lanes top-to-bottom. Visual tracks are REVERSED because array order is
   * z-order — the last track is composited last, so it belongs at the top of the
   * stack on screen too. Getting this backwards would make the timeline disagree
   * with the export about which layer is on top.
   */
  /** Caption lanes, one per `layer`, highest layer first. */
  const textRows = useMemo<Row[]>(() => {
    const byLayer = new Map<number, Overlay[]>();
    for (const o of project.overlays ?? []) {
      const layer = o.layer ?? 0;
      const list = byLayer.get(layer);
      if (list) list.push(o);
      else byLayer.set(layer, [o]);
    }
    return [...byLayer.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([layer, overlays]) => ({
        id: `text_${layer}`,
        kind: 'text' as const,
        layer,
        overlays,
        base: false as const,
      }));
  }, [project.overlays]);

  const rows = useMemo<Row[]>(
    () => [
      // Captions composite LAST in the export, so they belong at the top of the
      // stack on screen too.
      ...textRows,
      ...[...visual].reverse().map((track, i) => ({
        id: track.id,
        track,
        kind: 'visual' as const,
        // The FIRST visual track in the array is the base — the only one whose
        // transitions the ffmpeg export actually applies.
        base: i === visual.length - 1,
      })),
      ...audio.map((track) => ({
        id: track.id,
        track,
        kind: 'audio' as const,
        base: false,
      })),
    ],
    [textRows, visual, audio],
  );

  const span = Math.max(MIN_SPAN, duration + TAIL_SECONDS);
  const contentWidth = Math.round(span * pxPerSec);
  const step = tickStep(pxPerSec);

  const laneRects = useCallback((): LaneRect[] => {
    const out: LaneRect[] = [];
    for (const row of rows) {
      const el = lanes.current.get(row.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      out.push({ trackId: row.id, kind: row.kind, top: r.top, bottom: r.bottom });
    }
    return out;
  }, [rows]);

  /** Every bar on a lane, flattened to the one shape the timeline draws. */
  const viewsFor = useCallback((row: Row): ClipView[] => {
    if (row.kind === 'text')
      return [...row.overlays]
        .sort((a, b) => a.start - b.start)
        .map((o) => ({
          id: o.id,
          start: o.start,
          duration: Math.max(0.05, o.end - o.start),
          label: overlayLabel(o),
          variant: 'text' as const,
        }));

    if (row.kind === 'audio')
      return byStart(row.track.clips).map((c) => ({
        id: c.id,
        start: c.start,
        duration: c.duration,
        label: 'Sound',
        variant: 'audio' as const,
        art: { kind: 'wave' as const, src: c.src, trimIn: c.trimIn ?? 0 },
      }));

    return byStart(row.track.clips).map((c) => ({
      id: c.id,
      start: c.start,
      duration: c.duration,
      // `note` is the model's authoring-only annotation — it survives save/load
      // and the renderer ignores it, which makes it the right place for a name.
      label: c.note ?? (c.type === 'video' ? 'Video' : 'Still'),
      variant: c.type,
      muted: c.muted,
      art: {
        kind: 'film' as const,
        src: c.src,
        trimIn: c.trimIn ?? 0,
        speed: c.speed && c.speed > 0 ? c.speed : 1,
        still: c.type === 'image',
      },
    }));
  }, []);

  /* ------------------------------------------------------------ scrubbing --- */

  const scrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onSeek(Math.max(0, (event.clientX - rect.left) / pxPerSec));
    },
    [onSeek, pxPerSec],
  );

  const ticks = [];
  for (let t = 0; t <= span; t += step) ticks.push(t);

  return (
    <div className={styles.strip}>
      <div className={styles.transport}>
        <button
          className={styles.playButton}
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={15} />
        </button>
        <span className={`${styles.clock} w-data`}>
          <b>{formatClock(time)}</b> / {formatClock(duration)}
        </span>

        <span className={styles.spacer} />

        <button
          className={styles.iconButton}
          data-on={snap}
          onClick={() => setSnap(!snap)}
          aria-pressed={snap}
          title="Snap to edges (hold ⌥ to override)"
        >
          <Icon name="snap" size={16} />
        </button>
        <button
          className={styles.iconButton}
          onClick={() => zoomBy(1 / 1.5)}
          disabled={pxPerSec <= PX_PER_SECOND_MIN}
          aria-label="Zoom out"
        >
          <Icon name="zoomOut" size={16} />
        </button>
        <button
          className={styles.iconButton}
          onClick={() => zoomBy(1.5)}
          disabled={pxPerSec >= PX_PER_SECOND_MAX}
          aria-label="Zoom in"
        >
          <Icon name="zoomIn" size={16} />
        </button>
        <button
          className={styles.ghost}
          onClick={() => apply((p) => addVisualTrack(p))}
          title="Add a layer above the current ones"
          aria-label="Add track"
        >
          <Icon name="plus" size={14} />
          {/* Shed below 560px, where the row would otherwise run past the
              window and this — the last item — is what gets sliced. The mark
              and the aria-label carry it alone. */}
          <span className={styles.ghostLabel}>Track</span>
        </button>
      </div>

      <div
        className={styles.body}
        onPointerMove={drag.move}
        onPointerUp={drag.end}
        onPointerCancel={drag.end}
        onWheel={(e) => {
          // ⌘/ctrl-wheel zooms, matching every timeline the user already knows.
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
        }}
      >
        <div className={styles.grid}>
          <div className={styles.corner} />
          <div
            className={styles.ruler}
            style={{ width: contentWidth }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrub(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) scrub(e);
            }}
            role="slider"
            tabIndex={0}
            aria-label="Playhead"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') onSeek(Math.max(0, time - step));
              if (e.key === 'ArrowRight') onSeek(Math.min(duration, time + step));
            }}
          >
            {ticks.map((t) => (
              <span key={t} className={styles.tick} style={{ left: t * pxPerSec }}>
                <span className={`${styles.tickLabel} w-data`}>{formatTick(t, step)}</span>
              </span>
            ))}
            <span className={styles.playheadHead} style={{ left: time * pxPerSec }} />
          </div>

          {rows.map((row) => {
            const tall = row.kind === 'visual';
            const height = tall ? 'var(--w-lane)' : 'var(--w-lane-audio)';
            const views = viewsFor(row);
            const label =
              row.kind === 'text'
                ? row.layer === 0
                  ? 'Text'
                  : `Text ${row.layer + 1}`
                : (row.track.name ?? (row.kind === 'visual' ? 'Layer' : 'Audio'));
            const icon = row.kind === 'visual' ? 'video' : row.kind === 'audio' ? 'music' : 'text';
            return (
              <div key={row.id} style={{ display: 'contents' }}>
                <div className={styles.header} style={{ height }}>
                  <Icon name={icon} size={15} />
                  <span className={styles.headerName}>{label}</span>
                  {row.base && <span className={styles.headerFlag}>base</span>}
                </div>
                <div
                  className={styles.lane}
                  data-kind={row.kind}
                  style={{ width: contentWidth, height }}
                  ref={(el) => {
                    if (el) lanes.current.set(row.id, el);
                    else lanes.current.delete(row.id);
                  }}
                  onPointerDown={(e) => {
                    // Clicking empty lane clears the selection.
                    if (e.target === e.currentTarget) onSelect(null);
                  }}
                  onDragOver={(e) => {
                    // Media cannot be dropped on a caption lane.
                    if (row.kind === 'text') return;
                    if (!e.dataTransfer.types.includes('application/orbit-media')) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(e) => {
                    if (row.kind === 'text') return;
                    const id = e.dataTransfer.getData('application/orbit-media');
                    if (!id) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onDropMedia(id, row.id, Math.max(0, (e.clientX - rect.left) / pxPerSec));
                  }}
                >
                  {views.map((view) => {
                    const live =
                      drag.preview?.id === view.id && drag.preview.trackId === row.id
                        ? drag.preview
                        : null;
                    // A clip being carried to ANOTHER lane must not also draw here.
                    if (drag.preview?.id === view.id && drag.preview.trackId !== row.id)
                      return null;
                    const start = live?.start ?? view.start;
                    const length = live?.duration ?? view.duration;
                    return (
                      <Clip
                        key={view.id}
                        view={view}
                        left={Math.round(start * pxPerSec)}
                        width={Math.max(6, Math.round(length * pxPerSec))}
                        height={tall ? 52 : 40}
                        selected={selection === view.id}
                        dragging={!!live}
                        onSelect={() => onSelect(view.id)}
                        onPointerDown={(e, mode) =>
                          drag.begin(e, view, row.id, row.kind, mode, laneRects())
                        }
                      />
                    );
                  })}

                  {/* A transition lives at the HEAD of a clip, and only the base
                      visual track's transitions survive the export — so this is
                      the only lane that offers them. */}
                  {row.kind === 'visual' &&
                    row.base &&
                    byStart(row.track.clips).map((clip, i, cs) => {
                      if (i === 0) return null;
                      /*
                       * A transition is an OVERLAP: the incoming clip starts
                       * before the outgoing one ends, and the two are on screen
                       * together for exactly that long. The band shows where —
                       * without it the later clip simply appears to tuck under
                       * its neighbour — and the badge sits at the MIDDLE of it,
                       * because on a long transition the clip's start and the
                       * join the badge stands for are seconds apart.
                       */
                      const prev = cs[i - 1];
                      const overlap = Math.max(
                        0,
                        prev.start + prev.duration - clip.start,
                      );
                      const set = !!clip.transitionIn && clip.transitionIn.type !== 'cut';
                      return (
                        <Fragment key={`tx_${clip.id}`}>
                          {overlap > 0 && (
                            <span
                              className={styles.transitionBand}
                              aria-hidden
                              style={{
                                left: Math.round(clip.start * pxPerSec),
                                width: Math.round(overlap * pxPerSec),
                              }}
                            />
                          )}
                          <button
                            className={styles.transitionBadge}
                            data-set={set}
                            style={{
                              left: Math.round((clip.start + overlap / 2) * pxPerSec),
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(clip.id);
                              onEditTransition(clip.id);
                            }}
                            title={
                              set
                                ? `Fade, ${clip.transitionIn!.duration}s`
                                : 'Add a transition'
                            }
                          >
                            <Icon name="transition" size={13} />
                          </button>
                        </Fragment>
                      );
                    })}

                  {/* Drawn in the drag layer of the lane it is over. */}
                  {drag.preview?.snappedTo != null &&
                    drag.preview.trackId === row.id && (
                      <span
                        className={styles.snapGuide}
                        style={{ left: Math.round(drag.preview.snappedTo * pxPerSec) }}
                      />
                    )}

                  <span
                    className={styles.playhead}
                    style={{ left: Math.round(time * pxPerSec) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
