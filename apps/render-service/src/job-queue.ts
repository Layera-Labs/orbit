import type { Pool as PoolType } from "pg";
import type { Job, JobStatus } from "./jobs.js";

/**
 * A render queue every replica shares.
 *
 * `JobRegistry` keeps jobs in the process that created them, which is honest
 * for one box and a hard ceiling everywhere else: the render happens on
 * whichever machine the load balancer happened to pick, so capacity cannot be
 * added by adding machines, and the job vanishes if that one restarts.
 *
 * With a table in front, accepting a render and performing it come apart. Any
 * instance can take the request, any instance can do the work, and `GET
 * /v1/render/:id` answers from anywhere. Adding a machine adds capacity.
 *
 * It needs the OTHER half to be true as well: workers must be able to read the
 * uploads and write the output, which is what `storage.ts` is for. On local
 * disk this would hand a worker a token whose file only exists on the box that
 * received the upload — so the queue turns itself off unless durable storage is
 * configured, rather than failing one render in N for reasons nobody could
 * diagnose.
 */
export interface QueuedJob extends Job {
  project: unknown;
  output?: unknown;
  /** Who is working on it, for the stale-claim sweep. */
  claimedBy?: string;
}

export class PgJobQueue {
  private ready: Promise<void>;

  constructor(
    private pool: PoolType,
    /** How long a claim survives without a heartbeat before it is up for grabs. */
    private staleMs = 15 * 60_000,
  ) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS render_jobs (
        id          TEXT PRIMARY KEY,
        status      TEXT NOT NULL,
        project     JSONB NOT NULL,
        output      JSONB,
        url         TEXT,
        error       TEXT,
        claimed_by  TEXT,
        claimed_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ
      )
    `);
    // The claim query filters on exactly this, and without the index every
    // worker poll is a sequential scan over the whole history.
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS render_jobs_queued ON render_jobs (status, created_at)`,
    );
    // Added after the table shipped, so ALTER rather than a column in the
    // CREATE — a deployed instance already has the table and would never run
    // the new definition. NULL on old rows means "from before ownership", and
    // the read side treats that as visible rather than as nobody's.
    await this.pool.query(
      `ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS account TEXT`,
    );
  }

  async enqueue(
    id: string,
    project: unknown,
    output?: unknown,
    account?: string,
  ): Promise<Job> {
    await this.ready;
    const res = await this.pool.query(
      `INSERT INTO render_jobs (id, status, project, output, account)
       VALUES ($1, 'queued', $2, $3, $4)
       RETURNING id, status, created_at, account`,
      [
        id,
        JSON.stringify(project),
        output == null ? null : JSON.stringify(output),
        account ?? null,
      ],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      status: row.status as JobStatus,
      createdAt: new Date(row.created_at).getTime(),
      account: row.account ?? undefined,
    };
  }

  /**
   * Take the oldest unclaimed job, or one whose worker has gone quiet.
   *
   * `FOR UPDATE SKIP LOCKED` is the whole trick: two workers polling at the
   * same instant get two DIFFERENT rows instead of blocking on each other or —
   * far worse — both rendering the same job and both charging for it.
   *
   * The stale clause is what makes a killed worker recoverable. Without it a
   * job claimed by a machine that then died would sit in `running` forever,
   * because nothing else would ever consider it again.
   */
  async claim(workerId: string): Promise<QueuedJob | null> {
    await this.ready;
    const res = await this.pool.query(
      `UPDATE render_jobs SET status = 'running', claimed_by = $1, claimed_at = now()
       WHERE id = (
         SELECT id FROM render_jobs
         WHERE status = 'queued'
            OR (status = 'running' AND claimed_at < now() - ($2 || ' milliseconds')::interval)
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, status, project, output, created_at, claimed_by, account`,
      [workerId, String(this.staleMs)],
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      status: row.status as JobStatus,
      createdAt: new Date(row.created_at).getTime(),
      project: row.project,
      output: row.output ?? undefined,
      claimedBy: row.claimed_by ?? undefined,
      account: row.account ?? undefined,
    };
  }

  /**
   * Still working — pushes the stale deadline out.
   *
   * Guarded on the claim, like `finish` and `fail`. A worker that was declared
   * stale and superseded must not be able to reach back into a job that now
   * belongs to someone else, whichever of the three calls it makes next.
   */
  async heartbeat(id: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE render_jobs SET claimed_at = now()
       WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
      [id, workerId],
    );
  }

  async finish(id: string, url: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE render_jobs SET status = 'done', url = $2, finished_at = now()
       WHERE id = $1 AND claimed_by = $3`,
      [id, url, workerId],
    );
  }

  async fail(id: string, error: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE render_jobs SET status = 'error', error = $2, finished_at = now()
       WHERE id = $1 AND claimed_by = $3`,
      [id, error.slice(0, 2000), workerId],
    );
  }

  /**
   * Give a claimed job back, unstarted.
   *
   * What a worker does on the way out. Without it a deploy strands whatever was
   * mid-encode in `running` until the stale sweep notices — fifteen minutes by
   * default, during which the client polls a job nobody is working on and the
   * queue looks busy while it is idle. Releasing turns a rolling restart into a
   * few seconds of delay instead.
   *
   * Guarded on the claim so a superseded worker cannot yank a job out from
   * under the one that legitimately took it over.
   */
  async release(id: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE render_jobs SET status = 'queued', claimed_by = NULL, claimed_at = NULL
       WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
      [id, workerId],
    );
  }

  async get(id: string): Promise<Job | null> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT id, status, url, error, created_at, finished_at, account FROM render_jobs WHERE id = $1`,
      [id],
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      status: row.status as JobStatus,
      createdAt: new Date(row.created_at).getTime(),
      finishedAt: row.finished_at ? new Date(row.finished_at).getTime() : undefined,
      url: row.url ?? undefined,
      error: row.error ?? undefined,
      account: row.account ?? undefined,
    };
  }

  /** Rows still in flight, for /health. */
  async depth(): Promise<{ queued: number; running: number }> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT status, count(*)::int AS n FROM render_jobs
       WHERE status IN ('queued','running') GROUP BY status`,
    );
    const by = Object.fromEntries(res.rows.map((r) => [r.status, r.n]));
    return { queued: by.queued ?? 0, running: by.running ?? 0 };
  }

  /** Finished rows older than `ms`, so the table does not grow without end. */
  async sweep(ms: number): Promise<number> {
    await this.ready;
    const res = await this.pool.query(
      `DELETE FROM render_jobs
       WHERE finished_at IS NOT NULL AND finished_at < now() - ($1 || ' milliseconds')::interval`,
      [String(ms)],
    );
    return res.rowCount ?? 0;
  }
}
