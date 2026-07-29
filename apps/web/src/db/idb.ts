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

/**
 * A blocked upgrade used to hang the whole app, silently and forever.
 *
 * `openDB` returns a promise that simply never settles while another
 * connection holds the old version open — and since every screen awaits this
 * one promise, they all sit in their loading state with no error, no timeout
 * and nothing in the console. For the editor that loading state is an empty
 * frame, so the symptom is a blank page that never resolves. Reproduced
 * exactly that way: a second connection to this database was enough.
 *
 * The real trigger is ordinary. Someone has Orbit open in two tabs, a deploy
 * bumps `DB_VERSION`, and the tab they reload blocks on the tab they forgot.
 *
 * `blocking` is what actually fixes it: the OLD connection steps aside so the
 * new one can upgrade. `blocked` covers the case where something else is
 * holding the lock and rejects with a sentence a person can act on, instead of
 * waiting out the heat death of the universe.
 */
export class DatabaseBlockedError extends Error {
  constructor() {
    super(
      'Orbit is open in another tab running an older version. Close it (or reload it) and try again.',
    );
    this.name = 'DatabaseBlockedError';
  }
}

export function db(): Promise<IDBPDatabase<OrbitDB>> {
  if (typeof indexedDB === 'undefined')
    throw new Error('IndexedDB is unavailable here — this code must run in the browser.');
  handle ??= openDB<OrbitDB>(DB_NAME, DB_VERSION, {
    /*
     * Another tab is upgrading and we are what is in its way. Close, so it can
     * proceed; the next call here reopens at the new version. Without this the
     * OTHER tab is the one that hangs, which is worse — the user is looking at
     * it.
     */
    blocking(_current, _blocked, event) {
      (event.target as IDBPDatabase<OrbitDB> | null)?.close();
      handle = null;
    },
    /*
     * We are the one being blocked. Fail loudly rather than never settling: a
     * stated problem the user can fix beats a spinner that means nothing.
     */
    blocked() {
      handle = null;
      throw new DatabaseBlockedError();
    },
    /* The browser dropped the connection (storage pressure, or the user cleared
       site data). Forget it so the next call opens a fresh one. */
    terminated() {
      handle = null;
    },
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
  }).catch((err) => {
    /*
     * Do NOT keep a rejected promise. `handle ??=` caches whatever the first
     * call produced, so one transient failure — a blocked upgrade, a quota
     * refusal during a private-mode session — used to make the database
     * permanently unavailable for the life of the page, with every retry
     * getting the same stale rejection back. Clearing it means the next call
     * genuinely tries again.
     */
    handle = null;
    throw err;
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
