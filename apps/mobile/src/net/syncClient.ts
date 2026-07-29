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

  try {
    const since = readMark();
    const listed = await req(base, `v1/projects?since=${since}`);
    if (listed.status === 403) return { state: 'guest' };
    if (listed.status === 503) return { state: 'off' };
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
      saveProject({ ...full.data, id: meta.id, name: full.name, updatedAt: full.updatedAt });
      pulled += 1;
    }

    // ---- push ----
    for (const p of listProjects()) {
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

/** Tell the server a project is gone; best-effort, the local delete already ran. */
export async function syncDelete(base: string, id: string): Promise<void> {
  try {
    await req(base, `v1/projects/${id}`, { method: 'DELETE' });
  } catch {
    /* the project stays in the cloud until deleted from a device that can reach
       the service — better than blocking the local delete on the network */
  }
}
