import type { Pool as PoolType } from "pg";
import type {
  GenerationJob,
  GenerationQueue,
  GenerationStatus,
  StepLog,
  StepRecord,
} from "@layera-labs/orbit-pipeline";

/**
 * The generation queue and step log, in SQL.
 *
 * Both interfaces live in `@layera-labs/orbit-pipeline` with in-memory implementations, and
 * everything about their BEHAVIOUR is proven there — which matters, because the
 * tests in this file are gated on `TEST_DATABASE_URL` and do not run in
 * ordinary CI. There is deliberately no logic here beyond the queries.
 *
 * ## Two tables, not a `step` column
 *
 * The obvious shape puts a `step` column on the job and calls it done. It
 * cannot work: one generation completes many steps, and each one's RESULT has
 * to survive so a resumed job can carry it forward. A single column holds one
 * string and overwrites it.
 *
 * So `generation_jobs.step` is what the job is doing right now, for display,
 * and `generation_steps` is the record of what has been completed and what each
 * step produced. The first is overwritten constantly; the second never is.
 *
 * ## Why the child table cascades
 *
 * `sweep` deletes finished jobs so the table does not grow without end. Without
 * `ON DELETE CASCADE` their step rows would outlive them — forever, since
 * nothing else knows those job ids ever existed. The cascade is what keeps the
 * two tables the same age.
 */

const STALE_DEFAULT_MS = 30 * 60_000;

export class PgGenerationQueue implements GenerationQueue {
  private ready: Promise<void>;

  constructor(
    private pool: PoolType,
    /**
     * How long a claim survives without a heartbeat before it is up for grabs.
     *
     * Deliberately twice the render queue's fifteen minutes. A render is
     * seconds of ffmpeg; a generation is minutes of waiting on other people's
     * APIs, and re-offering one that is merely slow means paying every provider
     * a second time for a job that was going to finish.
     */
    private staleMs = STALE_DEFAULT_MS,
  ) {
    this.ready = this.init();
  }

  /** Resolves once the schema exists, so a bad one fails the deploy. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS generation_jobs (
        id          TEXT PRIMARY KEY,
        status      TEXT NOT NULL,
        input       JSONB NOT NULL,
        result      JSONB,
        step        TEXT,
        error       TEXT,
        account     TEXT,
        request_id  TEXT,
        claimed_by  TEXT,
        claimed_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ
      )
    `);
    // The claim query filters on exactly this; without it every worker poll is
    // a sequential scan over the whole history.
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS generation_jobs_queued ON generation_jobs (status, created_at)`,
    );
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS generation_steps (
        job_id       TEXT NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
        step         TEXT NOT NULL,
        result       JSONB,
        attempts     INTEGER NOT NULL DEFAULT 1,
        started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        PRIMARY KEY (job_id, step)
      )
    `);
  }

  async enqueue(
    id: string,
    input: unknown,
    opts: { account?: string; requestId?: string } = {},
  ): Promise<GenerationJob> {
    await this.ready;
    const res = await this.pool.query(
      `INSERT INTO generation_jobs (id, status, input, account, request_id)
       VALUES ($1, 'queued', $2, $3, $4)
       RETURNING id, status, created_at, account, request_id`,
      [id, JSON.stringify(input), opts.account ?? null, opts.requestId ?? null],
    );
    return rowToJob({ ...res.rows[0], input });
  }

  /**
   * Take the oldest unclaimed job, or one whose worker has gone quiet.
   *
   * `FOR UPDATE SKIP LOCKED` is the whole trick: two workers polling at the
   * same instant get two DIFFERENT rows instead of blocking on each other or —
   * far worse — both generating the same job and both paying for it.
   */
  async claim(workerId: string): Promise<GenerationJob | null> {
    await this.ready;
    const res = await this.pool.query(
      `UPDATE generation_jobs SET status = 'running', claimed_by = $1, claimed_at = now()
       WHERE id = (
         SELECT id FROM generation_jobs
         WHERE status = 'queued'
            OR (status = 'running' AND claimed_at < now() - ($2 || ' milliseconds')::interval)
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, status, input, step, account, request_id, created_at`,
      [workerId, String(this.staleMs)],
    );
    return res.rows.length ? rowToJob(res.rows[0]) : null;
  }

  async heartbeat(id: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE generation_jobs SET claimed_at = now()
       WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
      [id, workerId],
    );
  }

  /** Doubles as a heartbeat: a worker reporting a step is self-evidently alive. */
  async setStep(id: string, step: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE generation_jobs SET step = $2, claimed_at = now()
       WHERE id = $1 AND status = 'running' AND claimed_by = $3`,
      [id, step, workerId],
    );
  }

  async finish(id: string, result: unknown, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE generation_jobs SET status = 'done', result = $2, finished_at = now()
       WHERE id = $1 AND claimed_by = $3`,
      [id, JSON.stringify(result ?? null), workerId],
    );
  }

  async fail(id: string, error: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE generation_jobs SET status = 'error', error = $2, finished_at = now()
       WHERE id = $1 AND claimed_by = $3`,
      [id, error.slice(0, 2000), workerId],
    );
  }

  /**
   * Give a claimed job back, unstarted.
   *
   * What a worker does on the way out. The steps it already completed stay in
   * `generation_steps`, so whoever picks it up resumes rather than restarts —
   * which is the entire reason the two tables are separate.
   */
  async release(id: string, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE generation_jobs SET status = 'queued', claimed_by = NULL, claimed_at = NULL
       WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
      [id, workerId],
    );
  }

  async get(id: string): Promise<GenerationJob | null> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT id, status, input, result, step, error, account, request_id, created_at, finished_at
       FROM generation_jobs WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToJob(res.rows[0]) : null;
  }

  /** Rows still in flight, for /health. */
  async depth(): Promise<{ queued: number; running: number }> {
    await this.ready;
    const res = await this.pool.query(
      `SELECT status, count(*)::int AS n FROM generation_jobs
       WHERE status IN ('queued','running') GROUP BY status`,
    );
    const by = Object.fromEntries(res.rows.map((r) => [r.status, r.n]));
    return { queued: by.queued ?? 0, running: by.running ?? 0 };
  }

  /** Finished rows older than `ms`. Their steps cascade away with them. */
  async sweep(ms: number): Promise<number> {
    await this.ready;
    const res = await this.pool.query(
      `DELETE FROM generation_jobs
       WHERE finished_at IS NOT NULL AND finished_at < now() - ($1 || ' milliseconds')::interval`,
      [String(ms)],
    );
    return res.rowCount ?? 0;
  }
}

interface JobRow {
  id: string;
  status: string;
  input?: unknown;
  result?: unknown;
  step?: string | null;
  error?: string | null;
  account?: string | null;
  request_id?: string | null;
  created_at: string | Date;
  finished_at?: string | Date | null;
}

function rowToJob(row: JobRow): GenerationJob {
  return {
    id: row.id,
    status: row.status as GenerationStatus,
    input: row.input ?? null,
    createdAt: new Date(row.created_at).getTime(),
    ...(row.result == null ? {} : { result: row.result }),
    ...(row.step ? { step: row.step } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.account ? { account: row.account } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {}),
    ...(row.finished_at ? { finishedAt: new Date(row.finished_at).getTime() } : {}),
  };
}

/**
 * The step log, keyed by `(job_id, step)`.
 *
 * ## `completed_at` is what "done" means, not a non-null result
 *
 * `begin` writes the row before the step runs, so the row's existence cannot
 * mean completion. Filtering on `result IS NOT NULL` would be the obvious
 * alternative and it is wrong in a way that is very hard to see: a step that
 * legitimately produces `null` stores JSONB `null`, which is NOT SQL NULL, and
 * one that crashed before writing stores SQL NULL. Two different things that a
 * naive `IS NULL` gets right by accident and any refactor gets wrong. A
 * timestamp says exactly what it means.
 */
export class PgStepLog implements StepLog {
  constructor(private queue: PgGenerationQueue, private pool: PoolType) {}

  async completed(job: string): Promise<StepRecord[]> {
    await this.queue.whenReady();
    const res = await this.pool.query(
      `SELECT step, result, attempts, completed_at FROM generation_steps
       WHERE job_id = $1 AND completed_at IS NOT NULL
       ORDER BY completed_at`,
      [job],
    );
    return res.rows.map((r) => ({
      step: r.step,
      result: r.result,
      at: new Date(r.completed_at).toISOString(),
      attempts: r.attempts,
    }));
  }

  /**
   * Note that a step is about to run, and count it.
   *
   * The count is the point. A step that always crashes between the provider
   * returning and the record being written looks, in the log, like a step that
   * never ran — so `attempts` climbing above 1 is the only signal that money is
   * being spent repeatedly for nothing.
   */
  async begin(job: string, step: string): Promise<number> {
    await this.queue.whenReady();
    const res = await this.pool.query(
      `INSERT INTO generation_steps (job_id, step, attempts, started_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (job_id, step) DO UPDATE
         SET attempts = generation_steps.attempts + 1, started_at = now()
       RETURNING attempts`,
      [job, step],
    );
    return res.rows[0].attempts;
  }

  /**
   * Record a result. The FIRST completion wins.
   *
   * One statement rather than a check and then a write, because two workers can
   * be inside this at once — and if they disagree, every later step has to see
   * the same value or the video is assembled from two different sets of assets.
   *
   * `DO UPDATE` with a self-referencing SET, not `DO NOTHING`. `DO NOTHING`
   * returns ZERO rows on conflict, so the loser would come back with nothing to
   * return and have to issue a second query to find out what it lost to. The
   * no-op update makes `RETURNING` hand back the winner's row in one round
   * trip.
   *
   * One honest divergence from the in-memory log: a step returning `undefined`
   * is stored and read back as `null`, because JSON has no `undefined`. It does
   * not arise in practice — every step's output feeds the next — but a step
   * written to return nothing would resume differently here than in a test.
   */
  async complete<T>(job: string, step: string, result: T): Promise<StepRecord<T>> {
    await this.queue.whenReady();
    const res = await this.pool.query(
      `INSERT INTO generation_steps (job_id, step, result, attempts, started_at, completed_at)
       VALUES ($1, $2, $3::jsonb, 1, now(), now())
       ON CONFLICT (job_id, step) DO UPDATE
         SET result = CASE WHEN generation_steps.completed_at IS NULL
                           THEN EXCLUDED.result ELSE generation_steps.result END,
             completed_at = COALESCE(generation_steps.completed_at, EXCLUDED.completed_at)
       RETURNING step, result, attempts, completed_at`,
      [job, step, JSON.stringify(result ?? null)],
    );
    const row = res.rows[0];
    return {
      step: row.step,
      result: row.result as T,
      at: new Date(row.completed_at).toISOString(),
      attempts: row.attempts,
    };
  }
}
