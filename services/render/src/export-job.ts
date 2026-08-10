import type { Job } from "./jobs.js";

/**
 * The service's job, in the shape the client already expects.
 *
 * `ExportJobPoller` (`packages/core/src/video-export/job-poller.ts`) has been
 * written against `ExportJob` from `@layera-labs/orbit-shared` since long before anything
 * served it, and the two vocabularies do NOT line up. Left unmapped this is not
 * a cosmetic mismatch, it is a hang:
 *
 *     server            client
 *     ------            ------
 *     running     ->    processing
 *     error       ->    failed
 *     id          ->    jobId
 *     error: string     error: { code, message, retryable }
 *
 * The client stops when it sees `done`, `failed` or `cancelled`. A server
 * sending `error` therefore means the stream is never closed and the polling
 * fallback polls forever — on a job that has already failed. That is the reason
 * this file exists, and it is why the mapping is a tested function rather than
 * an object literal inlined at the route.
 *
 * `cancelled` has no server-side counterpart at all. Nothing can cancel a
 * render today, so nothing emits it; it stays in the union because the client
 * already handles it and removing it there would be a change to a published
 * package for no gain.
 */

export type ExportStatus =
  | "pending"
  | "uploading"
  | "queued"
  | "processing"
  | "done"
  | "failed"
  | "cancelled";

export interface ExportJobDTO {
  jobId: string;
  status: ExportStatus;
  progress: number;
  url?: string;
  error?: { code: string; message: string; retryable: boolean };
}

const STATUS: Record<Job["status"], ExportStatus> = {
  queued: "queued",
  running: "processing",
  done: "done",
  error: "failed",
};

/**
 * Is trying again likely to do anything?
 *
 * Only claimed where it is actually true. A missing upload IS recoverable and
 * both clients already know how — they forget the named tokens, re-upload and
 * resubmit, which is the one retry loop that exists. Everything else is a
 * project that will fail the same way every time: an unparseable transition, a
 * filtergraph error, a codec the box does not have. Marking those retryable
 * invites a client to burn a render slot proving it.
 */
function classify(message: string): { code: string; retryable: boolean } {
  if (/missing_uploads|no longer on the device|missing upload/i.test(message))
    return { code: "missing_uploads", retryable: true };
  return { code: "render_failed", retryable: false };
}

export function toExportJob(job: Job): ExportJobDTO {
  const status = STATUS[job.status];
  return {
    jobId: job.id,
    status,
    /*
     * `progress` is absent until ffmpeg reports something, and the client's
     * field is a required number — so the absence has to collapse somewhere.
     * It collapses to 0 here rather than to a made-up value, and `done` is
     * pinned to 1 because a finished job showing 0.87 forever is worse than a
     * bar that never moved.
     */
    progress: status === "done" ? 1 : (job.progress ?? 0),
    ...(job.url ? { url: job.url } : {}),
    ...(status === "failed"
      ? {
          error: {
            ...classify(job.error ?? ""),
            message: job.error ?? "the render failed",
          },
        }
      : {}),
  };
}

/** The three the client treats as final. Nothing is sent after one of these. */
export function isTerminal(status: ExportStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}
