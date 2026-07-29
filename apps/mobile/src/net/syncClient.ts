/**
 * Cloud sync for the phone. The same contract as web's `db/sync.ts`, and
 * deliberately the same RULES — two clients that reconcile differently against
 * one server is a data-loss bug waiting for the first person who owns both.
 *
 * Documents only. A project's footage lives in the app's own media directory
 * and is uploaded on export as an `upload:` token; pushing those blobs here
 * would turn a two-kilobyte sync into a several-hundred-megabyte one. What
 * travels is the edit — timings, text, effects, structure.
 *
 * Only signed-in accounts sync. A guest has no password, so the identity dies
 * with the app's storage, and the server refuses it (403 `guest`) rather than
 * promising that work will follow someone whose account cannot outlive a
 * reinstall.
 */
import { authHeaders } from './session';
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
  type StoredProject,
} from '../storage/projects';

export type SyncStatus =
  | { state: 'off' }
  | { state: 'guest' }
  | { state: 'syncing' }
  | { state: 'ok'; at: number; pulled: number; pushed: number; conflicts: number }
  | { state: 'failed'; error: string };

interface RemoteMeta {
  id: string;
  kind: string;
  name: string;
  updatedAt: number;
  deleted: boolean;
}

const clean = (base: string) => base.replace(/\/+$/, '');

/**
 * The watermark lives with the projects, not in the keychain — it is not a
 * secret, and losing it costs one extra full pull rather than anything real.
 */
import { Directory, File, Paths } from 'expo-file-system';

const markFile = () => new File(new Directory(Paths.document), 'sync-mark.json');

function readMark(): number {
  try {
    const f = markFile();
    return f.exists ? (JSON.parse(f.textSync()) as { at?: number }).at ?? 0 : 0;
  } catch {
    return 0;
  }
}

function writeMark(at: number): void {
  try {
    markFile().write(JSON.stringify({ at }));
  } catch {
    /* a lost watermark means one redundant full pull, nothing worse */
  }
}

/**
 * Deletes that have not reached the server yet.
 *
 * A delete made on a train used to be lost outright: the local copy went, the
 * server never heard, and the project came back on the next full pull. An
 * absent tombstone is indistinguishable from a project this phone has simply
 * never seen, so it is dutifully downloaded again.
 */
const pendingFile = () => new File(new Directory(Paths.document), 'sync-pending-deletes.json');

function pendingDeletes(): string[] {
  try {
    const f = pendingFile();
    if (!f.exists) return [];
    const raw = JSON.parse(f.textSync()) as unknown;
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function setPendingDeletes(ids: string[]): void {
  try {
    pendingFile().write(JSON.stringify(ids));
  } catch {
    /* the delete still happened locally; it may just come back */
  }
}

export function resetSyncMark(): void {
  try {
    const f = markFile();
    if (f.exists) f.delete();
  } catch {
    /* nothing to do */
  }
}

async function req(base: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${clean(base)}/${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(await authHeaders(base)),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

/** Pull, then push. Returns what it did, so the UI can be specific. */
export async function syncNow(base: string): Promise<SyncStatus> {
  let pulled = 0;
  let pushed = 0;
  let conflicts = 0;
  /*
   * What the pull just wrote, so the push does not send it straight back.
   *
   * `since` is still the OLD watermark while the push runs, so a
   * freshly-pulled project looks like a local edit and gets pushed — at the
   * exact timestamp it came down with. The server refuses an equal timestamp
   * (correctly: for two real writers that is a coin flip), the client reads
   * 409 as "both sides changed", and every project on a first sync is
   * duplicated as "(this phone)".
   */
  const justPulled = new Set<string>();

  try {
    /*
     * Before the listing, not after. A delete that never landed has to become a
     * tombstone BEFORE we ask what changed, or the pull hands back the very
     * project we are trying to delete and we save it again.
     */
    await flushPendingDeletes(base);

    const since = readMark();
    const listed = await req(base, `v1/projects?since=${since}`);
    if (listed.status === 403) return { state: 'guest' };
    if (listed.status === 503) return { state: 'off' };
    /*
     * A member's 401 is a real expiry, not something to retry — `discardIfGuest`
     * deliberately will not swap them onto a guest account, because that would
     * detach them from their own credits. So say what to do about it: "HTTP 401"
     * tells someone nothing they can act on.
     */
    if (listed.status === 401)
      return { state: 'failed', error: 'Your session expired. Sign in again to keep syncing.' };
    if (!listed.ok) return { state: 'failed', error: `HTTP ${listed.status}` };

    const { projects: remote, now } = (await listed.json()) as {
      projects: RemoteMeta[];
      now: number;
    };

    // ---- pull ----
    for (const meta of remote) {
      const local = loadProject(meta.id);
      if (meta.deleted) {
        // Only honour a delete the local copy has not been edited past —
        // otherwise it was deleted on one device and kept on another, and the
        // work here is newer than the deletion.
        if (local && local.updatedAt <= meta.updatedAt) deleteProject(meta.id);
        continue;
      }
      if (local && local.updatedAt >= meta.updatedAt) continue;
      const res = await req(base, `v1/projects/${meta.id}`);
      if (!res.ok) continue;
      const full = (await res.json()) as { name: string; data: StoredProject; updatedAt: number };

      /*
       * Both sides changed, and THEIRS is newer. Overwriting here is the quiet
       * data loss the push-side 409 handler was written to prevent — and it
       * gets there first, so that handler almost never runs. `updatedAt > since`
       * is what "edited on this phone since the last successful sync" means, and
       * it is the only signal that the copy about to be replaced is not just an
       * older download.
       */
      if (local && local.updatedAt > since) {
        saveProject({
          ...local,
          id: `${local.id}-local-${Date.now().toString(36)}`,
          name: `${local.name} (this phone)`,
        });
        conflicts += 1;
      } else {
        pulled += 1;
      }

      saveProject({ ...full.data, id: meta.id, name: full.name, updatedAt: full.updatedAt });
      justPulled.add(meta.id);
    }

    // ---- push ----
    for (const p of listProjects()) {
      if (justPulled.has(p.id)) continue;
      if (p.updatedAt <= since) continue;
      const res = await req(base, `v1/projects/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          kind: 'video',
          name: p.name,
          updatedAt: p.updatedAt,
          data: p,
        }),
      });
      if (res.ok) {
        pushed += 1;
        continue;
      }
      if (res.status !== 409) continue;
      /*
       * Both sides changed. Keep both: the server's copy takes the id so every
       * device converges, and this phone's becomes a separate project. Losing
       * an edit silently is the one outcome that is not acceptable.
       */
      const { current } = (await res.json()) as {
        current: { name: string; data: StoredProject; updatedAt: number };
      };
      saveProject({
        ...p,
        id: `${p.id}-local-${Date.now().toString(36)}`,
        name: `${p.name} (this phone)`,
      });
      saveProject({
        ...current.data,
        id: p.id,
        name: current.name,
        updatedAt: current.updatedAt,
      });
      conflicts += 1;
    }

    // Only once BOTH halves are done: advancing after the pull would leave a
    // failed push looking synced forever.
    writeMark(now);
    return { state: 'ok', at: Date.now(), pulled, pushed, conflicts };
  } catch (err) {
    return { state: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** True once the server knows. A 404 counts — it does not have it either. */
async function tellServerDeleted(base: string, id: string): Promise<boolean> {
  try {
    const res = await req(base, `v1/projects/${id}`, { method: 'DELETE' });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** Try every remembered delete again, keeping the ones that still fail. */
async function flushPendingDeletes(base: string): Promise<void> {
  const queued = pendingDeletes();
  if (!queued.length) return;
  const stillPending: string[] = [];
  for (const id of queued) if (!(await tellServerDeleted(base, id))) stillPending.push(id);
  setPendingDeletes(stillPending);
}

/**
 * Tell the server a project is gone. The local delete has already happened, so
 * this never blocks it — but a failure is REMEMBERED rather than shrugged off.
 *
 * The old version only caught a thrown error, so a 500 or an expired session
 * answered it successfully and the delete was dropped on the floor.
 */
export async function syncDelete(base: string, id: string): Promise<void> {
  if (await tellServerDeleted(base, id)) return;
  const queued = pendingDeletes();
  if (!queued.includes(id)) setPendingDeletes([...queued, id]);
}
