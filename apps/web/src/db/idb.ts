/**
 * IndexedDB access. Every export here is browser-only and must not be called
 * during SSR — `db()` throws a clear error rather than a cryptic one if it is.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  type MediaRow,
  type ProjectRow,
  type WaveformRow,
} from './schema';

interface OrbitDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectRow;
    indexes: { updatedAt: number };
  };
  media: {
    key: string;
    value: MediaRow;
    indexes: { createdAt: number; origin: string };
  };
  waveforms: {
    key: string;
    value: WaveformRow;
    indexes: { mediaId: string };
  };
}

let handle: Promise<IDBPDatabase<OrbitDB>> | null = null;

export function db(): Promise<IDBPDatabase<OrbitDB>> {
  if (typeof indexedDB === 'undefined')
    throw new Error('IndexedDB is unavailable here — this code must run in the browser.');
  handle ??= openDB<OrbitDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('projects')) {
        const projects = database.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
      }
      if (!database.objectStoreNames.contains('media')) {
        const media = database.createObjectStore('media', { keyPath: 'id' });
        media.createIndex('createdAt', 'createdAt');
        media.createIndex('origin', 'origin');
      }
      // v2. Guarded by name rather than by version number so the upgrade is
      // idempotent whichever version a given browser is coming from.
      if (!database.objectStoreNames.contains('waveforms')) {
        const waveforms = database.createObjectStore('waveforms', { keyPath: 'id' });
        waveforms.createIndex('mediaId', 'mediaId');
      }
    },
  });
  return handle;
}

/** Short, sortable, collision-resistant enough for a local store. */
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}
