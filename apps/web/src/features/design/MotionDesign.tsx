'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VideoProject, VisualTrackClip } from '@orbit/video/browser';
import { Icon } from '@/brand/Icon';
import { getMedia } from '@/db/media';
import { setThumbnail } from '@/db/projects';
import { mediaSrc, type MediaRow, type ProjectRow } from '@/db/schema';
import { ExportError, exportProject, type ExportProgress } from '@/net/renderClient';
import { useDesign } from '@/store/designStore';
import {
  appendAudio,
  appendVisual,
  duplicateClip,
  duplicateOverlay,
  findClip,
  findOverlay,
  moveClip,
  removeClip,
  removeOverlay,
  rippleDeleteClip,
  rippleDeleteOverlay,
  setClipTrack,
  splitAt,
  useVideo,
} from '@/store/videoStore';
import { usePreview } from '@/video/engine/usePreview';
import { boxOf, pickAt } from './motion/pick';
import { DesignBar } from './DesignBar';
import { DesignFrame, ToolPanel } from './Frame';
import { ToolRail } from './ToolRail';
import { AiPanel } from './panels/AiPanel';
import { MediaPanel, mediaKind } from './panels/MediaPanel';
import {
  EffectsPanel,
  MotionDesignPanel,
  MotionTextPanel,
  TransitionsPanel,
} from './panels/MotionPanels';
import { StockPanel } from './panels/StockPanel';
import { ClipBar, OverlayBar } from './toolbar/ClipBar';
import { StickersPanel } from './panels/StickersPanel';
import { Timeline } from './timeline/Timeline';
import panel from './panels/Panels.module.css';
import styles from './Design.module.css';

/** A still with no intrinsic length has to be given one. */
const STILL_SECONDS = 4;

export function MotionDesign({
  row,
  onRename,
}: {
  row: ProjectRow;
  onRename(name: string): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useVideo((s) => s.project);
  const selection = useVideo((s) => s.selection);
  const load = useVideo((s) => s.load);
  const apply = useVideo((s) => s.apply);
  const select = useVideo((s) => s.select);
  const undo = useVideo((s) => s.undo);
  const redo = useVideo((s) => s.redo);
  const canUndo = useVideo((s) => s.past.length > 0);
  const canRedo = useVideo((s) => s.future.length > 0);

  const tool = useDesign((s) => s.tool);
  const setTool = useDesign((s) => s.setTool);

  /*
   * Load ONCE per project.
   *
   * `row` is the snapshot read at mount and is never refetched, so keying this
   * on `row.data` (or `row.name`, which the rename handler replaces) would let a
   * later render push that stale original document back into the store and wipe
   * every edit made since. The id is the only part that identifies a different
   * document.
   */
  useEffect(() => {
    const opened = useVideo.getState();
    if (opened.projectId === row.id && opened.project) return;
    load(row.id, row.name, row.data as VideoProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, load]);

  // The name is what `apply` writes alongside the document, so a rename has to
  // reach the store — but on its own, without re-seeding the project.
  useEffect(() => {
    useVideo.getState().setName(row.name);
  }, [row.name]);

  // A stable stand-in so the preview hook keeps a single identity across the
  // first render, before the store has the real project.
  const blank = useMemo<VideoProject>(
    () => ({
      id: 'blank',
      schemaVersion: 2,
      width: 1080,
      height: 1920,
      fps: 30,
      background: { type: 'color', color: '#000000' },
      clips: [],
      overlays: [],
      audio: [],
      tracks: [],
    }),
    [],
  );

  const live = project ?? blank;
  const preview = usePreview(canvasRef, live);
  const hasClips = !!live.tracks?.some((t) => t.clips.length) || !!live.overlays?.length;
  const selected = useMemo(() => findClip(live, selection), [live, selection]);
  const selectedText = useMemo(() => findOverlay(live, selection), [live, selection]);

  /*
   * Keyboard.
   *
   * Scoped to when focus is NOT in a field — the text inspector is full of
   * inputs, and swallowing the space bar or Delete while someone is typing a
   * caption would be worse than having no shortcuts at all.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
        return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const id = useVideo.getState().selection;

      if (mod && key === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        preview.toggle();
        return;
      }
      if (!id) return;

      if (mod && key === 'd') {
        e.preventDefault();
        apply((p) => (findOverlay(p, id) ? duplicateOverlay(p, id) : duplicateClip(p, id)));
        return;
      }
      if (key === 's') {
        e.preventDefault();
        apply((p) => splitAt(p, id, preview.time));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const ripple = e.shiftKey;
        apply((p) =>
          findOverlay(p, id)
            ? ripple
              ? rippleDeleteOverlay(p, id)
              : removeOverlay(p, id)
            : ripple
              ? rippleDeleteClip(p, id)
              : removeClip(p, id),
        );
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply, select, undo, redo, preview]);

  /* ------------------------------------------------------------ insertion --- */

  const insertMedia = useCallback(
    (media: MediaRow, at?: number, trackId?: string) => {
      const kind = mediaKind(media);
      const src = mediaSrc(media.id);
      if (kind === 'audio') {
        apply((p) => appendAudio(p, src, media.duration ?? 10));
        return;
      }
      apply((p) => {
        const next = appendVisual(p, {
          type: kind === 'video' ? 'video' : 'image',
          src,
          duration: kind === 'video' ? (media.duration ?? STILL_SECONDS) : STILL_SECONDS,
          note: media.prompt?.slice(0, 40) ?? media.name,
        } as Omit<VisualTrackClip, 'id' | 'start'>);
        if (at == null) return next;
        // `appendVisual` lands the clip at the end of the base track; a drop
        // wants it where the pointer was, on the lane it was dropped on.
        const added = lastClipId(next);
        if (!added) return next;
        return trackId ? placeOn(next, added, trackId, at) : moveClip(next, added, at);
      });
    },
    [apply],
  );

  const dropMedia = useCallback(
    (mediaId: string, trackId: string, at: number) => {
      void getMedia(mediaId).then((media) => {
        if (!media) return;
        const track = (useVideo.getState().project?.tracks ?? []).find((t) => t.id === trackId);
        // Audio only makes sense on an audio lane and picture only on a visual
        // one; a cross-kind drop falls back to appending where it belongs.
        const wrongLane =
          !track ||
          (mediaKind(media) === 'audio') !== (track.kind === 'audio');
        insertMedia(media, wrongLane ? undefined : at, wrongLane ? undefined : trackId);
      });
    },
    [insertMedia],
  );

  /* --------------------------------------------------------------- export --- */

  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const runExport = useCallback(async () => {
    if (!project) return;
    setError(null);
    setResult(null);
    try {
      const { url } = await exportProject(project, { onProgress: setProgress });
      setResult(url);
      const still = await preview.snapshot();
      if (still) await setThumbnail(row.id, still);
    } catch (err) {
      setError(
        err instanceof ExportError ? err.message : `Export failed: ${(err as Error).message}`,
      );
    } finally {
      setProgress(null);
    }
  }, [project, preview, row.id]);

  /* ---------------------------------------------------------------- panel --- */

  const panelBody = () => {
    switch (tool) {
      case 'design':
        return <MotionDesignPanel project={live} />;
      case 'video':
        return (
          <MediaPanel
            filter="visual"
            accept="video/*,image/*"
            empty="No footage yet. Add a file, or generate one."
            onInsert={(m) => insertMedia(m)}
          />
        );
      case 'audio':
        return (
          <MediaPanel
            filter="audio"
            accept="audio/*"
            empty="No sound yet. Add a file, or generate speech."
            onInsert={(m) => insertMedia(m)}
          />
        );
      case 'uploads':
        return (
          <MediaPanel
            filter="all"
            empty="Nothing uploaded yet. Files you add stay in this browser."
            onInsert={(m) => insertMedia(m)}
          />
        );
      case 'text':
        return (
          <MotionTextPanel
            project={live}
            time={preview.time}
            selection={selection}
            onSelect={select}
          />
        );
      case 'photos':
        return <StockPanel onInsert={(m) => insertMedia(m)} />;
      case 'stickers':
        return <StickersPanel time={preview.time} />;
      case 'effects':
        return <EffectsPanel clip={asVisual(selected?.clip)} />;
      case 'transitions':
        return <TransitionsPanel clip={asVisual(selected?.clip)} />;
      case 'ai':
        return <AiPanel onInsert={(m) => insertMedia(m)} />;
      default:
        return null;
    }
  };

  const label =
    tool === 'ai' ? 'Generate' : tool ? tool[0].toUpperCase() + tool.slice(1) : '';

  return (
    <DesignFrame
      bar={
        <DesignBar
          project={row}
          meta={`${live.width} × ${live.height} · ${live.fps ?? 30} fps`}
          history={{ canUndo, canRedo, undo, redo }}
          onRename={onRename}
        >
          {error && <span className={styles.meta}>{error}</span>}
          {result && (
            <a className={styles.ghost} href={result} download={`${row.name}.mp4`}>
              <Icon name="download" size={14} />
              Save MP4
            </a>
          )}
          <button
            className={styles.primary}
            onClick={() => void runExport()}
            disabled={!hasClips || !!progress}
          >
            <Icon name="download" size={14} />
            {progress ? stageLabel(progress) : 'Export'}
          </button>
        </DesignBar>
      }
      rail={<ToolRail kind="video" />}
      panel={
        tool ? (
          <ToolPanel title={label} onClose={() => setTool(null)}>
            {panelBody()}
          </ToolPanel>
        ) : null
      }
      canvas={
        <div className={styles.stage}>
          {/* Anchored to the stage, so it reads over the picture the clip is
              actually producing rather than over the timeline row. */}
          {selectedText ? (
            <OverlayBar overlay={selectedText} />
          ) : selected ? (
            <ClipBar
              clip={selected.clip}
              project={live}
              time={preview.time}
              onOpenEffects={() => setTool('effects')}
            />
          ) : null}
          {hasClips ? (
            /*
             * The canvas and its selection chrome share a box, so the outline
             * can be positioned in the canvas's own displayed pixels. The
             * outline is a DOM element and NOT painted into the 2D context on
             * purpose: that bitmap is the export-parity render, and drawing
             * editor furniture into it would put a selection rectangle into
             * anything ever read back out of it.
             */
            <div className={styles.canvasWrap}>
              <canvas
                ref={canvasRef}
                className={styles.canvas}
                onPointerDown={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  // Displayed pixels → project pixels. The canvas is sized to
                  // the project and scaled down by CSS, so one factor does it.
                  const scale = live.width / r.width;
                  select(
                    pickAt(
                      live,
                      preview.time,
                      (e.clientX - r.left) * scale,
                      (e.clientY - r.top) * scale,
                    ),
                  );
                }}
              />
              <SelectionFrame project={live} time={preview.time} id={selection} />
            </div>
          ) : (
            <div className={styles.stageEmpty}>
              <Icon name="video" size={26} />
              <p>
                Add footage, a still or a sound file from the rail. Everything stays in this
                browser until you export.
              </p>
              <button className={styles.ghost} onClick={() => setTool('video')}>
                <Icon name="plus" size={14} />
                Add media
              </button>
            </div>
          )}
        </div>
      }
      strip={
        <Timeline
          project={live}
          time={preview.time}
          duration={preview.duration}
          playing={preview.playing}
          selection={selection}
          onSeek={preview.seek}
          onTogglePlay={preview.toggle}
          onSelect={select}
          onEditTransition={() => setTool('transitions')}
          onDropMedia={dropMedia}
        />
      }
    />
  );
}

/**
 * The outline over whatever is selected.
 *
 * Percentages rather than pixels, so it tracks the canvas through every resize
 * without measuring anything or listening to anything — the wrapper is sized by
 * the canvas, and the canvas is the project's own aspect.
 *
 * Nothing is drawn when the selection is not on screen at this instant, which
 * is the honest answer: a clip that starts at 0:08 genuinely has no box at
 * 0:00. The timeline still shows which row is selected.
 */
function SelectionFrame({
  project,
  time,
  id,
}: {
  project: VideoProject;
  time: number;
  id: string | null;
}) {
  const box = useMemo(() => boxOf(project, time, id), [project, time, id]);
  if (!box) return null;
  const pc = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div
      className={styles.selectFrame}
      style={{
        left: pc(box.x, project.width),
        top: pc(box.y, project.height),
        width: pc(box.w, project.width),
        height: pc(box.h, project.height),
      }}
      aria-hidden="true"
    />
  );
}

const asVisual = (clip: unknown): VisualTrackClip | null =>
  clip && typeof clip === 'object' && 'type' in clip ? (clip as VisualTrackClip) : null;

/** The clip `appendVisual` just added — always the last on the base track. */
function lastClipId(p: VideoProject): string | null {
  const track = (p.tracks ?? []).find((t) => t.kind === 'visual');
  const clips = track?.clips ?? [];
  return clips.length ? clips[clips.length - 1].id : null;
}

function placeOn(p: VideoProject, clipId: string, trackId: string, at: number): VideoProject {
  const track = (p.tracks ?? []).find((t) => t.id === trackId);
  if (!track || track.kind !== 'visual') return moveClip(p, clipId, at);
  // The same op the drag gesture commits, so a drop and a drag land a clip
  // through exactly one code path.
  return setClipTrack(p, clipId, trackId, at);
}

function stageLabel(p: ExportProgress): string {
  if (p.stage === 'uploading')
    return p.total ? `Uploading ${(p.current ?? 0) + 1}/${p.total}` : 'Uploading';
  if (p.stage === 'rendering') return 'Rendering';
  if (p.stage === 'downloading') return 'Downloading';
  return 'Done';
}
