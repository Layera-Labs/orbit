'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@layera-labs/orbit-brand';
import { addMedia, listMedia } from '@/db/media';
import type { MediaOrigin, MediaRow } from '@/db/schema';
import { useJobs } from '@/store/jobsStore';
import styles from './Panels.module.css';

export type MediaFilter = 'all' | 'visual' | 'video' | 'image' | 'audio';

export const mediaKind = (row: MediaRow): 'video' | 'audio' | 'image' =>
  row.mime.startsWith('video/') ? 'video' : row.mime.startsWith('audio/') ? 'audio' : 'image';

const MATCH: Record<MediaFilter, (row: MediaRow) => boolean> = {
  all: () => true,
  visual: (r) => mediaKind(r) !== 'audio',
  video: (r) => mediaKind(r) === 'video',
  image: (r) => mediaKind(r) === 'image',
  audio: (r) => mediaKind(r) === 'audio',
};

/**
 * The library, filtered — the same component behind Uploads, Video and Audio.
 *
 * Clicking a tile inserts into the OPEN document. Dragging one carries it to a
 * lane; the timeline reads `application/orbit-media` on drop.
 */
export function MediaPanel({
  filter,
  origin,
  accept,
  allowUpload = true,
  empty,
  onInsert,
}: {
  filter: MediaFilter;
  /** Narrow to one provenance — the Generate dock lists only what it made. */
  origin?: MediaOrigin;
  accept?: string;
  allowUpload?: boolean;
  empty: string;
  onInsert(row: MediaRow): void;
}) {
  const [rows, setRows] = useState<MediaRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Re-read when a generation lands, so a result appears here without a reload.
  const completedAt = useJobs((s) => s.completedAt);

  const refresh = useCallback(() => {
    listMedia()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(refresh, [refresh, completedAt]);

  const visible = useMemo(
    () => (rows ?? []).filter((r) => MATCH[filter](r) && (!origin || r.origin === origin)),
    [rows, filter, origin],
  );

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      try {
        for (const file of Array.from(files)) {
          const kind = file.type.startsWith('video/')
            ? 'video'
            : file.type.startsWith('audio/')
              ? 'audio'
              : 'image';
          const meta = await probe(file, kind);
          await addMedia({
            blob: file,
            name: file.name,
            origin: 'upload',
            mime: file.type,
            ...meta,
          });
        }
        refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return (
    <div className={styles.stack}>
      {allowUpload && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={accept ?? 'video/*,image/*,audio/*'}
            multiple
            hidden
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            className={styles.action}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Icon name="upload" size={15} />
            {busy ? 'Adding…' : 'Add files'}
          </button>
        </>
      )}

      {/* `rows === null` is "still reading", which is not the same as "empty" —
          saying "nothing here" before the read finishes is a small lie. */}
      {rows === null ? null : visible.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <div className={styles.grid}>
          {visible.map((row) => (
            <MediaTile key={row.id} row={row} onInsert={() => onInsert(row)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaTile({ row, onInsert }: { row: MediaRow; onInsert(): void }) {
  const url = useMemo(() => URL.createObjectURL(row.blob), [row.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const kind = mediaKind(row);

  return (
    <button
      className={styles.tile}
      onClick={onInsert}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/orbit-media', row.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={row.prompt ?? row.name}
    >
      <span className={styles.tileArt}>
        {kind === 'video' ? (
          // `#t=0.1` is load-bearing: with `preload="metadata"` alone the element
          // has dimensions but has painted nothing, so the tile renders as an
          // empty box. The media fragment makes it seek and show that frame.
          <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
        ) : kind === 'audio' ? (
          <Icon name="music" size={22} />
        ) : (
          <img src={url} alt="" />
        )}
        {row.duration != null && (
          <span className={`${styles.tileBadge} w-data`}>{row.duration.toFixed(1)}s</span>
        )}
      </span>
      <span className={styles.tileName}>{row.prompt ?? row.name}</span>
    </button>
  );
}

/** Natural size and duration, read before the file goes on a timeline. */
export async function probe(
  file: Blob,
  kind: 'video' | 'image' | 'audio',
): Promise<{ width?: number; height?: number; duration?: number }> {
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'image') {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      return { width: img.naturalWidth, height: img.naturalHeight };
    }
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
    await new Promise((res, rej) => {
      el.onloadedmetadata = res;
      el.onerror = rej;
      el.src = url;
    });
    const v = el as HTMLVideoElement;
    return {
      width: v.videoWidth || undefined,
      height: v.videoHeight || undefined,
      duration: Number.isFinite(el.duration) ? el.duration : undefined,
    };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}
