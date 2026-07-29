'use client';

/**
 * Cloud sync for the web client.
 *
 * The reconciliation is deliberately dumb, because a clever one that is subtly
 * wrong loses work: each side is a set of documents with a client-authored
 * `updatedAt`, newer wins, and nothing is ever deleted to resolve a conflict.
 *
 * What it does NOT do, and should not: sync media. A project references its
 * footage by `orbit-media:` locally and `upload:` once exported, and the
 * service stores the latter durably. Pushing blobs through here would turn a
 * two-kilobyte sync into a two-hundred-megabyte one for no gain.
 *
 * Only signed-in accounts sync. A guest identity dies with this browser's
 * storage, so the server refuses it (403 `guest`) and this reports that plainly
 * rather than retrying something that cannot work.
 */
import { db } from './idb';
import { getProject, listProjects, saveProject } from './projects';
import { newId } from './idb';
import type { ProjectRow } from './schema';
import { authHeaders } from '@/net/session';

const BASE = '/api/orbit';
/** Last successful pull, so a sync only asks for what changed. */
const MARK = 'orbit.sync.mark';

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

const mark = {
  get(): number {
    try {
      return Number(localStorage.getItem(MARK) ?? 0) || 0;
    } catch {
      return 0;
    }
  },
  set(v: number): void {
    try {
      localStorage.setItem(MARK, String(v));
    } catch {
      /* private mode: sync still works, it just re-reads everything */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(MARK);
    } catch {
      /* nothing to do */
    }
  },
};

/** Forget the watermark, so the next sync pulls the account's whole history. */
export const resetSyncMark = mark.clear;

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}/${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(await authHeaders()), ...init.headers },
  });
}

/**
 * Pull, then push. One pass, and it returns what it did rather than a boolean —
 * the UI needs to be able to say "3 projects came down" and, more importantly,
 * that a conflict was kept rather than resolved.
 */
export async function syncNow(): Promise<SyncStatus> {
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
   * duplicated as "(this browser)".
   */
  const justPulled = new Set<string>();

  try {
    const since = mark.get();
    const listed = await req(`v1/projects?since=${since}`);
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
      const local = await getProject(meta.id);
      if (meta.deleted) {
        /*
         * A tombstone only wins if the local copy has not been edited SINCE the
         * delete. Otherwise someone deleted it on one device and kept working
         * on another, and honouring the delete would throw that work away.
         */
        if (local && local.updatedAt <= meta.updatedAt) await (await db()).delete('projects', meta.id);
        continue;
      }
      if (local && local.updatedAt >= meta.updatedAt) continue;
      const res = await req(`v1/projects/${meta.id}`);
      if (!res.ok) continue;
      const full = (await res.json()) as { kind: string; name: string; data: unknown; updatedAt: number };

      /*
       * Both sides changed, and THEIRS is newer. Overwriting here is the quiet
       * data loss the push-side 409 handler exists to prevent — and it gets
       * there first, so that handler almost never runs. `updatedAt > since` is
       * what "edited in this browser since the last successful sync" means, and
       * it is the only signal that the copy about to be replaced is not simply
       * an older download.
       */
      if (local && local.updatedAt > since) {
        await saveProject({
          id: newId(local.kind === 'video' ? 'vid' : 'img'),
          kind: local.kind,
          name: `${local.name} (this browser)`,
          data: local.data,
        });
        conflicts += 1;
      } else {
        pulled += 1;
      }

      await saveProject({
        id: meta.id,
        kind: full.kind as ProjectRow['kind'],
        name: full.name,
        data: full.data as ProjectRow['data'],
        createdAt: local?.createdAt,
        // The SERVER'S timestamp, not now. Stamping local time makes the copy
        // we just pulled look newer than the one we pulled it from, so the next
        // push sends it back and the two devices trade it forever.
        updatedAt: full.updatedAt,
      });
      justPulled.add(meta.id);
    }

    // ---- push ----
    // Everything touched since the last successful sync. On a first run `since`
    // is 0, so this is the whole local library — which is exactly right: that
    // is the upload that makes an existing browser's work available elsewhere.
    for (const row of await listProjects()) {
      if (justPulled.has(row.id)) continue;
      if (row.updatedAt <= since) continue;
      const res = await req(`v1/projects/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          kind: row.kind,
          name: row.name,
          updatedAt: row.updatedAt,
          data: row.data,
        }),
      });
      if (res.ok) {
        pushed += 1;
        continue;
      }
      if (res.status !== 409) continue;
      /*
       * Both sides changed. Keep BOTH: the server's copy takes the id (so every
       * device converges on the same document) and ours is saved beside it
       * under a new id. Nobody has to be told their afternoon was discarded,
       * because it wasn't.
       */
      const { current } = (await res.json()) as {
        current: { kind: string; name: string; data: unknown; updatedAt: number };
      };
      await saveProject({
        id: newId(row.kind === 'video' ? 'vid' : 'img'),
        kind: row.kind,
        name: `${row.name} (this browser)`,
        data: row.data,
      });
      await saveProject({
        id: row.id,
        kind: current.kind as ProjectRow['kind'],
        name: current.name,
        data: current.data as ProjectRow['data'],
        createdAt: row.createdAt,
        updatedAt: current.updatedAt,
      });
      conflicts += 1;
    }

    /*
     * Advance the watermark only after BOTH halves succeeded. Moving it after
     * the pull would mean a push that then failed is never retried — the local
     * edit would look synced forever.
     */
    mark.set(now);
    return { state: 'ok', at: Date.now(), pulled, pushed, conflicts };
  } catch (err) {
    return { state: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Tell the server a project is gone. Best-effort: local delete already happened. */
export async function syncDelete(id: string): Promise<void> {
  try {
    await req(`v1/projects/${id}`, { method: 'DELETE' });
  } catch {
    /*
     * The next full sync will not re-push a project that no longer exists
     * locally, but it also cannot tell the server about it — so a delete lost
     * here means the project stays in the cloud until it is deleted again from
     * a device that can reach the service. Better than blocking the local
     * delete on a network call.
     */
  }
}
