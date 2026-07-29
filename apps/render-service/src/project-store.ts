/**
 * Cloud project sync — the documents, not the footage.
 *
 * A project is small: JSON describing clips, overlays, timings and effects. Its
 * MEDIA is not, and does not travel here. Both clients already rewrite local
 * media into `upload:<id>` tokens for export, and the service already stores
 * those durably, so a synced project NAMES its footage instead of carrying it.
 * That keeps a sync a few kilobytes instead of a few hundred megabytes and
 * reuses the one media path that is already proven.
 *
 * The cost is stated rather than hidden: media survives a sync only when
 * storage is durable. On local disk the media dir is a byte-budgeted cache and
 * eviction is real deletion, so a project opened on a second device can find
 * its document intact and its footage gone. `/health` reports both, and the
 * document is still worth syncing on its own — timings, text and structure are
 * most of the work.
 *
 * Conflicts are last-write-wins BY THE CLIENT'S OWN `updatedAt`, and the loser
 * is never destroyed silently: a stale write is refused with the stored copy
 * attached, so the client can keep both. Two devices editing the same project
 * offline is rare; losing an afternoon to it is not acceptable when the fix is
 * to hand the caller what it was about to overwrite.
 */
import type { Pool as PoolType } from 'pg';

export interface SyncedProject {
  id: string;
  kind: string;
  name: string;
  /** Client-authored, and the ordering authority for conflicts. */
  updatedAt: number;
  data: unknown;
}

export interface SyncedProjectMeta {
  id: string;
  kind: string;
  name: string;
  updatedAt: number;
  deleted: boolean;
}

export class PgProjectStore {
  private ready: Promise<void>;

  constructor(private pool: PoolType) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        account     TEXT NOT NULL,
        id          TEXT NOT NULL,
        kind        TEXT NOT NULL,
        name        TEXT NOT NULL,
        data        JSONB NOT NULL,
        -- The CLIENT's timestamp, in ms. Not now(): the client is the authority
        -- on when the edit happened, and it is what both sides compare.
        updated_at  BIGINT NOT NULL,
        -- Soft delete, because a hard one cannot propagate. A device that was
        -- offline when a project was deleted has to LEARN about the deletion,
        -- and a row that is simply absent is indistinguishable from one it has
        -- not synced yet — so it would helpfully restore it.
        deleted_at  BIGINT,
        PRIMARY KEY (account, id)
      )
    `);
    // Every read is "this account's rows, newer than X".
    await this.pool.query(
      'CREATE INDEX IF NOT EXISTS projects_account_updated ON projects (account, updated_at)',
    );
  }

  /** Everything this account has touched since `since` (0 = all of it). */
  async list(account: string, since = 0): Promise<SyncedProjectMeta[]> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT id, kind, name, updated_at, deleted_at FROM projects
       WHERE account = $1 AND updated_at > $2 ORDER BY updated_at`,
      [account, since],
    );
    return res.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      updatedAt: Number(r.updated_at),
      deleted: r.deleted_at != null,
    }));
  }

  async get(account: string, id: string): Promise<SyncedProject | null> {
    await this.ready;
    const res = await this.pool.query(
      'SELECT id, kind, name, data, updated_at FROM projects WHERE account = $1 AND id = $2 AND deleted_at IS NULL',
      [account, id],
    );
    const r = res.rows[0];
    return r
      ? { id: r.id, kind: r.kind, name: r.name, data: r.data, updatedAt: Number(r.updated_at) }
      : null;
  }

  /**
   * Store a project, unless the copy already here is newer.
   *
   * The `WHERE ... < EXCLUDED.updated_at` is what makes this safe to call from
   * two devices at once: the older write becomes a no-op instead of clobbering
   * the newer one, and `RETURNING` tells us whether it landed. Doing the
   * comparison in SQL rather than read-then-write means there is no window
   * between the two for the other device to slip through.
   */
  async put(
    account: string,
    p: SyncedProject,
  ): Promise<{ stored: true } | { stored: false; current: SyncedProject }> {
    await this.ready;
    const res = await this.pool.query(
      `INSERT INTO projects (account, id, kind, name, data, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NULL)
       ON CONFLICT (account, id) DO UPDATE
         SET kind = EXCLUDED.kind, name = EXCLUDED.name, data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at, deleted_at = NULL
         WHERE projects.updated_at < EXCLUDED.updated_at
       RETURNING id`,
      [account, p.id, p.kind, p.name, JSON.stringify(p.data), p.updatedAt],
    );
    if (res.rowCount) return { stored: true };
    // Refused: hand back what is here so the caller can keep both copies.
    const current = await this.get(account, p.id);
    return current
      ? { stored: false, current }
      : // Only reachable if it was deleted between the two statements. Treat as
        // stored rather than inventing a conflict against nothing.
        { stored: true };
  }

  /** Soft-delete, so other devices can learn about it. */
  async remove(account: string, id: string, at: number): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO projects (account, id, kind, name, data, updated_at, deleted_at)
       VALUES ($1, $2, 'deleted', '', '{}'::jsonb, $3, $3)
       ON CONFLICT (account, id) DO UPDATE
         SET deleted_at = $3, updated_at = $3, data = '{}'::jsonb
         WHERE projects.updated_at <= $3`,
      [account, id, at],
    );
  }
}
