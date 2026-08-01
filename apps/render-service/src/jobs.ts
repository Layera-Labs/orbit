/**
 * Render jobs, so an export is not one long HTTP request.
 *
 * A synchronous `/v1/render` holds the connection for the whole encode. Every
 * proxy in front of this — a load balancer, nginx, a platform's router — has an
 * idle timeout well under what a minute of 1080p takes, and when it fires the
 * client sees a network error while the box keeps burning CPU on a render
 * nobody will collect. Worse, the work is unrecoverable: there is no id to ask
 * about afterwards.
 *
 * So a caller can ask for a job instead, get an id immediately, and poll. The
 * synchronous path stays the default and is untouched, because both shipped
 * clients use it.
 *
 * This registry is IN-PROCESS and deliberately so: the render it tracks is also
 * in this process, so a shared store would buy nothing until rendering itself
 * moves to a worker pool. The trade is explicit — a restart loses the record of
 * jobs whose encodes died with it anyway.
 */
export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  url?: string;
  error?: string;
  /**
   * How far through the encode, 0..1, straight from ffmpeg's own reporting.
   *
   * Absent until the encoder says something. A client showing a bar has to be
   * able to tell "no measurement yet" from "measured, and it is zero" — the
   * first is an indeterminate bar and the second is an empty one.
   */
  progress?: number;
  /**
   * Who asked for it. `GET /v1/render/:id` matches on this, so one caller
   * cannot collect another's finished MP4 by guessing an id.
   */
  account?: string;
}

/** How long a finished job stays readable before it is swept. */
export const JOB_TTL_MS = 30 * 60_000;

export class JobRegistry {
  private readonly jobs = new Map<string, Job>();
  private seq = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = JOB_TTL_MS,
  ) {}

  /**
   * Register a job and run `work` in the background.
   *
   * The promise is deliberately NOT returned: the caller has already replied
   * 202 by the time this resolves, and an unhandled rejection here would take
   * the process down. Every failure lands on the job instead.
   */
  start(
    work: (
      markRunning: () => void,
      setProgress: (fraction: number) => void,
    ) => Promise<string>,
    account?: string,
  ): Job {
    const id = `job_${++this.seq}_${this.now().toString(36)}`;
    const job: Job = { id, status: "queued", createdAt: this.now(), account };
    this.jobs.set(id, job);
    this.sweep();

    /*
     * `queued` until the work says otherwise — and it is the WORK that says so,
     * not this function. Flipping to `running` here would report an encode that
     * has begun while it is in fact still waiting behind the render semaphore,
     * which is exactly the state a caller polling this wants to tell apart.
     */
    const markRunning = () => {
      if (job.status !== "queued") return;
      job.status = "running";
      job.startedAt = this.now();
    };

    /*
     * Progress only means anything while the encode is live. A late chunk
     * arriving after a failure must not push a dead job back to a hopeful 60%.
     */
    const setProgress = (fraction: number) => {
      if (job.status !== "running") return;
      job.progress = Math.max(0, Math.min(1, fraction));
    };

    void (async () => {
      try {
        job.url = await work(markRunning, setProgress);
        job.status = "done";
        job.progress = 1;
      } catch (err) {
        job.status = "error";
        job.error = err instanceof Error ? err.message : String(err);
        /*
         * Log it, for the same reason the synchronous path does: without this
         * a failed render leaves NO trace on the server. The only record of it
         * travels to whichever client polls the job, so a user reports "export
         * failed" and the box has nothing to show — the request log shows the
         * 202 and a run of healthy 200s from polling, and then simply stops.
         *
         * That gap is not theoretical; it is how the async path shipped. The
         * sync path carries a comment saying an unlogged ffmpeg error is
         * undebuggable, and the reasoning was never carried across when jobs
         * were added — so the moment async became the default for both
         * clients, every real failure became invisible here.
         */
        console.error(
          `[orbit] render job ${job.id} failed:`,
          err instanceof Error ? (err.stack ?? err.message) : err,
        );
      } finally {
        job.finishedAt = this.now();
      }
    })();

    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** Finished jobs older than the TTL. A running one is never swept, however
   *  long it has been going — that would lose the only handle on live work. */
  sweep(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, job] of this.jobs)
      if (job.finishedAt !== undefined && job.finishedAt < cutoff) this.jobs.delete(id);
  }

  get size(): number {
    return this.jobs.size;
  }
}
