/**
 * A generation queue, and the worker loop that drains it.
 *
 * Modelled deliberately on `PgJobQueue` — claim with `FOR UPDATE SKIP LOCKED`,
 * heartbeat, stale sweep, release on the way out. That pattern is already
 * proven in this repo against a real Postgres, and copying it is cheaper and
 * safer than introducing Redis or BullMQ for a second kind of job.
 *
 * ## Why the interface lives here and the SQL does not
 *
 * Same reason as `StepLog`. `@orbit/pipeline` decides; it does not talk to a
 * database, and it must not pull `pg` into its dependency tree. What lives here
 * is the contract plus an in-memory implementation, so the loop below can be
 * tested without a database — which matters more than it sounds, because the
 * Postgres implementation's tests are gated on `TEST_DATABASE_URL` and do not
 * run in ordinary CI. Everything about the worker's BEHAVIOUR is proven here;
 * the Postgres class is then only SQL.
 *
 * ## What a generation is, and why it is not a render
 *
 * A render is one expensive thing that either happened or did not, over
 * seconds. A generation is five or more provider calls over minutes, each of
 * which spends money somewhere else. So the queue carries the job and
 * `StepLog` carries what has already been paid for — and a job re-offered
 * after a worker died resumes rather than restarts. The two are separate on
 * purpose: the queue's claim decides WHO runs a job, and the step log decides
 * WHAT still needs running. Merging them would make a re-offer either
 * impossible or free of memory.
 */

export type GenerationStatus = 'queued' | 'running' | 'done' | 'error';

export interface GenerationJob {
  id: string;
  status: GenerationStatus;
  /**
   * The brief. Opaque here on purpose — the queue moves jobs around and has no
   * opinion about what a job is, which is what lets the planner's input shape
   * change without touching any of this.
   */
  input: unknown;
  account?: string;
  /**
   * Which step it is on RIGHT NOW.
   *
   * Not the same thing as the step log, and worth being clear about because
   * the two look alike. This is one string for display — "what is it doing" —
   * and it is overwritten as the job advances. The log is the record of what
   * has been completed and what each step produced, and it is never
   * overwritten. A single `step` column cannot serve as the log: one job has
   * many completed steps, each with a result to carry forward.
   */
  step?: string;
  /** Whatever the pipeline returned. Set once, on success. */
  result?: unknown;
  error?: string;
  createdAt: number;
  finishedAt?: number;
  /** The request that queued it, so a worker's logs join to it. */
  requestId?: string;
}

/**
 * Every write here is guarded on the claim.
 *
 * A worker that was declared stale and superseded must not be able to reach
 * back into a job that now belongs to someone else — and it WILL try, because
 * being declared stale does not stop a process, it only means nobody heard
 * from it in a while. The guard is what turns that from data loss into a
 * no-op. Any implementation that drops it will pass a naive test suite and
 * corrupt jobs in production, so `InMemoryGenerationQueue` enforces it too.
 */
export interface GenerationQueue {
  /**
   * Put a job in.
   *
   * On the interface rather than left to each implementation, which is not
   * bookkeeping: the in-memory one took `(input, opts)` and the Postgres one
   * `(id, input, opts)` for exactly as long as nothing declared it, and the
   * service could not call both. Two implementations of one concept drift the
   * moment the shared shape stops naming a method.
   *
   * The caller supplies the id, because it usually has to answer with it before
   * the write is confirmed.
   */
  enqueue(
    id: string,
    input: unknown,
    opts?: { account?: string; requestId?: string },
  ): Promise<GenerationJob>;
  get(id: string): Promise<GenerationJob | null>;
  /** Take the oldest unclaimed job, or one whose worker has gone quiet. */
  claim(workerId: string): Promise<GenerationJob | null>;
  /** Still alive — pushes the stale deadline out. */
  heartbeat(id: string, workerId: string): Promise<void>;
  /** Say where the job has got to. Doubles as a heartbeat. */
  setStep(id: string, step: string, workerId: string): Promise<void>;
  finish(id: string, result: unknown, workerId: string): Promise<void>;
  fail(id: string, error: string, workerId: string): Promise<void>;
  /** Hand a claimed job back, unstarted, for whoever is still up. */
  release(id: string, workerId: string): Promise<void>;
}

export interface WorkerOptions {
  queue: GenerationQueue;
  /** Identifies this process in claims. Must be stable for the process's life. */
  workerId: string;
  /**
   * Do the work. Given the job and a way to report progress; whatever it
   * returns becomes the job's result.
   */
  handle: (job: GenerationJob, setStep: (step: string) => void) => Promise<unknown>;
  /** How long to wait when the queue is empty. */
  pollMs?: number;
  /**
   * How often to say we are alive.
   *
   * Must be comfortably under the queue's stale window, or a long generation
   * gets handed to a second worker and runs twice — at full provider cost,
   * since a second worker has its own view of nothing being done yet.
   */
  heartbeatMs?: number;
  /** Told about anything that went wrong. Never throws into the loop. */
  onError?: (event: string, err: unknown, job?: GenerationJob) => void;
}

export interface GenerationWorker {
  /**
   * Stop taking work and hand back whatever is held.
   *
   * It does NOT wait for the running handler — a generation runs for minutes
   * and a deploy cannot wait that long. The job goes back on the queue for
   * whoever is still up, and the abandoned handler's eventual `finish` is a
   * no-op because the claim guard rejects it. That ordering matters: release
   * first, so the guard is already failing by the time the old worker returns.
   */
  stop(): Promise<void>;
  /** For tests and /health: is this worker holding a job? */
  inFlight(): string | null;
}

export function startGenerationWorker(opts: WorkerOptions): GenerationWorker {
  const { queue, workerId, handle } = opts;
  const pollMs = opts.pollMs ?? 2000;
  const heartbeatMs = opts.heartbeatMs ?? 30_000;
  const onError = opts.onError ?? (() => undefined);

  let stopping = false;
  let held: string | null = null;
  /** Set while the loop is sleeping, so `stop` does not wait out a poll. */
  let wake: (() => void) | null = null;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      // Node keeps the process alive for a pending timer, and an idle worker
      // polling forever would stop `node` from ever exiting on its own.
      (timer as { unref?: () => void }).unref?.();
      wake = done;
    });

  const loop = async () => {
    while (!stopping) {
      let job: GenerationJob | null = null;
      try {
        job = await queue.claim(workerId);
      } catch (err) {
        // A database blip must not end the loop. Ending it would take this
        // worker out of the cluster silently, and the only symptom would be
        // jobs taking longer.
        onError('generation-claim-failed', err);
      }
      if (!job) {
        await sleep(pollMs);
        continue;
      }
      /*
       * Claimed between the check above and here: put it straight back. Without
       * this a job claimed during a shutdown is held by a process that is about
       * to exit, and nobody sees it again until the stale sweep.
       */
      if (stopping) {
        await queue.release(job.id, workerId).catch(() => undefined);
        break;
      }
      held = job.id;
      const beat = setInterval(() => {
        void queue.heartbeat(job!.id, workerId).catch(() => undefined);
      }, heartbeatMs);
      (beat as { unref?: () => void }).unref?.();
      try {
        const result = await handle(job, (step) => {
          void queue.setStep(job!.id, step, workerId).catch(() => undefined);
        });
        await queue.finish(job.id, result, workerId);
      } catch (err) {
        onError('generation-failed', err, job);
        await queue
          .fail(job.id, err instanceof Error ? err.message : String(err), workerId)
          .catch(() => undefined);
      } finally {
        // A leaked interval keeps saying a dead job is alive, which is the one
        // thing that stops the stale sweep from ever recovering it.
        clearInterval(beat);
        held = null;
      }
    }
  };

  void loop();

  return {
    inFlight: () => held,
    async stop() {
      stopping = true;
      wake?.();
      if (held) await queue.release(held, workerId).catch(() => undefined);
    },
  };
}

/** In-memory `GenerationQueue`, for tests and single-process runs. */
export class InMemoryGenerationQueue implements GenerationQueue {
  private jobs = new Map<string, GenerationJob>();
  private claimedBy = new Map<string, string>();
  private claimedAt = new Map<string, number>();

  constructor(
    /** How long a claim survives without a heartbeat before it is up for grabs. */
    private staleMs = 15 * 60_000,
    private now: () => number = () => Date.now(),
  ) {}

  async enqueue(
    id: string,
    input: unknown,
    opts: { account?: string; requestId?: string } = {},
  ): Promise<GenerationJob> {
    const job: GenerationJob = {
      id,
      status: 'queued',
      input,
      createdAt: this.now(),
      ...(opts.account ? { account: opts.account } : {}),
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async get(id: string): Promise<GenerationJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async claim(workerId: string): Promise<GenerationJob | null> {
    const cutoff = this.now() - this.staleMs;
    const next = [...this.jobs.values()]
      .filter(
        (j) =>
          j.status === 'queued' ||
          (j.status === 'running' && (this.claimedAt.get(j.id) ?? 0) < cutoff),
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return null;
    next.status = 'running';
    this.claimedBy.set(next.id, workerId);
    this.claimedAt.set(next.id, this.now());
    return next;
  }

  /** The claim guard, in one place. See the note on `GenerationQueue`. */
  private owned(id: string, workerId: string): GenerationJob | null {
    const job = this.jobs.get(id);
    if (!job || this.claimedBy.get(id) !== workerId) return null;
    return job;
  }

  async heartbeat(id: string, workerId: string): Promise<void> {
    if (this.owned(id, workerId)) this.claimedAt.set(id, this.now());
  }

  async setStep(id: string, step: string, workerId: string): Promise<void> {
    const job = this.owned(id, workerId);
    if (!job) return;
    job.step = step;
    this.claimedAt.set(id, this.now());
  }

  async finish(id: string, result: unknown, workerId: string): Promise<void> {
    const job = this.owned(id, workerId);
    if (!job) return;
    job.status = 'done';
    job.result = result;
    job.finishedAt = this.now();
  }

  async fail(id: string, error: string, workerId: string): Promise<void> {
    const job = this.owned(id, workerId);
    if (!job) return;
    job.status = 'error';
    job.error = error.slice(0, 2000);
    job.finishedAt = this.now();
  }

  async release(id: string, workerId: string): Promise<void> {
    const job = this.owned(id, workerId);
    if (!job || job.status !== 'running') return;
    job.status = 'queued';
    this.claimedBy.delete(id);
    this.claimedAt.delete(id);
  }
}
