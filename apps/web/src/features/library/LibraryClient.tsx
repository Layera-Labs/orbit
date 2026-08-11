'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@layera-labs/orbit-brand';
import { GraduatedRule } from '@/features/shell/GraduatedRule';
import { addMedia, deleteMedia, listMedia } from '@/db/media';
import type { MediaRow } from '@/db/schema';
import styles from '@/features/shell/Index.module.css';

/** Every asset this browser holds — uploads and generations in one place. */
export function LibraryClient() {
  const [rows, setRows] = useState<MediaRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listMedia()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(refresh, [refresh]);

  const add = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      for (const file of Array.from(files))
        await addMedia({ blob: file, name: file.name, origin: 'upload', mime: file.type });
      refresh();
    },
    [refresh],
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Library</h1>
          <p className={styles.blurb}>
            Everything you have uploaded or generated, stored in this browser. Nothing is
            sent anywhere until you export.
          </p>
        </div>
        <button className={styles.new} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} />
          Add files
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="video/*,image/*,audio/*"
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = '';
          }}
        />
      </header>

      <GraduatedRule className={styles.rule} />

      {rows === null ? null : rows.length === 0 ? (
        <p className={styles.empty}>Nothing here yet.</p>
      ) : (
        <div className={styles.grid}>
          {rows.map((row) => (
            <Asset
              key={row.id}
              row={row}
              onDelete={async () => {
                await deleteMedia(row.id);
                refresh();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Asset({ row, onDelete }: { row: MediaRow; onDelete: () => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(row.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [row.blob]);

  const isVideo = row.mime.startsWith('video/');
  const isAudio = row.mime.startsWith('audio/');

  return (
    <article className={styles.card}>
      <div className={styles.thumb}>
        {url && !isAudio ? (
          isVideo ? (
            <video src={url} muted playsInline />
          ) : (
            <img src={url} alt={row.name} />
          )
        ) : (
          <Icon name={isAudio ? 'sound' : 'image'} size={26} className={styles.ghost} />
        )}
      </div>
      <div className={styles.body}>
        <span className={styles.name} title={row.prompt ?? row.name}>
          {row.prompt ?? row.name}
        </span>
        <button className={styles.delete} onClick={() => void onDelete()} aria-label="Delete">
          <Icon name="trash" size={15} />
        </button>
      </div>
    </article>
  );
}
