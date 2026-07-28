'use client';

import { useCallback, useEffect, useState } from 'react';
import { PicsumPhotoProvider } from '@orbit/providers';
import type { Photo } from '@orbit/providers';
import { Icon } from '@/brand/Icon';
import { getMedia, importRemote } from '@/db/media';
import type { MediaRow } from '@/db/schema';
import styles from './Panels.module.css';

const PER_PAGE = 12;
const provider = new PicsumPhotoProvider();

/**
 * Stock photos on the motion side.
 *
 * NO SEARCH FIELD, deliberately. The built-in `PicsumPhotoProvider` is a
 * zero-config demo source: it hashes whatever string it is given into a seed and
 * returns that many random images. A box labelled "Search photos" over it would
 * return results that have nothing to do with what was typed — a control that
 * appears to work and does not. Paging is the interaction it can honestly
 * support, so paging is what this offers.
 *
 * Swap a real `PhotoProvider` (Unsplash, Pexels) into the registry and a search
 * field becomes truthful; that is the point of the interface.
 */
export function StockPanel({ onInsert }: { onInsert(row: MediaRow): void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async (p: number, append: boolean) => {
    setLoading(true);
    try {
      const next = await provider.search('', { page: p, perPage: PER_PAGE });
      setPhotos((prev) => (append ? [...prev, ...next] : next));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  /**
   * Pull the file local before using it, via the same `importRemote` that
   * generated media goes through.
   *
   * The project COULD just hold the remote https URL — the render service
   * accepts those — but the preview would then be drawing a cross-origin image,
   * which taints the canvas: thumbnails die, and the chroma-key shader's
   * `texImage2D` throws outright. Local also means the picture survives the
   * source going away.
   */
  const insert = async (photo: Photo) => {
    setBusy(photo.id);
    setFailed(null);
    try {
      const { id } = await importRemote(photo.src, {
        name: `Stock ${photo.id}`,
        origin: 'stock',
        width: photo.width,
        height: photo.height,
      });
      const row = await getMedia(id);
      if (row) onInsert(row);
    } catch {
      setFailed('That image could not be fetched. Check the connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.stack}>
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>Stock</h3>
        <div className={styles.grid}>
          {photos.map((photo) => (
            <button
              key={photo.id}
              className={styles.tile}
              disabled={busy === photo.id}
              onClick={() => void insert(photo)}
              title="Add to the timeline"
            >
              <span className={styles.tileArt}>
                {/* Loads immediately and shows the real picture — nothing here
                    waits on an animation or a decode to become visible. */}
                <img src={photo.thumbnail} alt="" loading="lazy" />
              </span>
              <span className={styles.tileName}>
                {busy === photo.id ? 'Adding…' : (photo.author?.name ?? 'Stock')}
              </span>
            </button>
          ))}
        </div>

        {failed && <p className={styles.note}>{failed}</p>}

        <button
          className={styles.action}
          disabled={loading}
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void load(next, true);
          }}
        >
          <Icon name="reading" size={14} />
          {loading ? 'Loading…' : 'Show more'}
        </button>

        <p className={styles.note}>
          Picsum, the built-in demo source — the pictures are random rather than
          searchable. A real provider drops into the same interface.
        </p>
      </div>
    </div>
  );
}
