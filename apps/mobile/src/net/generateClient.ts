/**
 * Topic in, video out — the client half of `POST /v1/generate`.
 *
 * Separate from `genClient.ts`, which talks to the single-asset routes
 * (`/v1/generate-image`, `/v1/generate-video`, `/v1/tts`). Those answer with a
 * finished asset on one long request. This one is a JOB: it answers 202 with an
 * id, and the work — a language model, one text-to-speech call per scene, a
 * stock search per scene, then a render — runs for minutes on the server. So
 * the shape here is start-then-poll, like `renderClient`'s async export, rather
 * than await-one-response.
 *
 * The error vocabulary is `genClient`'s `GenError`, deliberately. A screen
 * showing "out of credits" should not have to know which of the two clients
 * produced it, and two enums for one meaning is how two screens end up
 * disagreeing about what 402 means.
 */
import { authHeaders, discardIfGuest } from "./session";
import { GenError } from "./genClient";
import { absoluteUrl } from "./renderClient";

/**
 * The steps the server reports, in the order they run.
 *
 * A hand-mirror of `generate()` in `@orbit/pipeline` — mobile is outside the
 * pnpm workspace and cannot import it. The list is used only to say WHERE a job
 * has got to, so a step the server adds later simply falls off the end of the
 * progress lane rather than breaking anything: `stepIndex` answers -1 and the
 * label falls back to the raw name.
 */
export const GEN_STEPS = [
  { key: "plan", label: "Writing the scenes" },
  { key: "speak", label: "Recording the voice" },
  { key: "align", label: "Timing the captions" },
  { key: "visuals", label: "Finding the pictures" },
  { key: "compose", label: "Cutting the edit" },
  { key: "render", label: "Rendering" },
] as const;

export type GenStep = (typeof GEN_STEPS)[number]["key"];

/** How far through the run a step is, or -1 for one this build has never heard of. */
export const stepIndex = (step?: string): number =>
  GEN_STEPS.findIndex((s) => s.key === step);

export function stepLabel(step?: string): string {
  const i = stepIndex(step);
  if (i >= 0) return GEN_STEPS[i].label;
  // A job that has been claimed but has not reported a step yet, or a step from
  // a newer server. Neither is an error and neither deserves a blank line.
  return step ? step : "Starting";
}

/** The aspects the server accepts. Mirrors `parseGenerationRequest`. */
export const GEN_ASPECTS = ["9:16", "1:1", "16:9"] as const;
export type GenAspect = (typeof GEN_ASPECTS)[number];

/**
 * The bounds the server validates against, repeated here so the field can stop
 * the user at the limit rather than let them write past it and be refused.
 *
 * If these drift the server still wins — it revalidates — and the symptom is a
 * 400 the screen shows verbatim rather than silent truncation.
 */
export const MAX_TOPIC = 400;
export const MAX_NOTES = 1_000;

/** Pixel dimensions per aspect. Mirrors `frameSize` in `@orbit/pipeline`. */
export function frameSizeFor(aspect: GenAspect): { width: number; height: number } {
  if (aspect === "1:1") return { width: 1080, height: 1080 };
  if (aspect === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}

export interface GenerationRequest {
  topic: string;
  aspect: GenAspect;
  notes?: string;
  /** Only `story` exists today; the server 400s on anything else. */
  format?: string;
}

export interface GenerationResult {
  url: string;
  durationSec?: number;
  /** Present when word timings could not be produced; the captions are per scene. */
  alignmentSkipped?: string;
  compromises?: { scene: number; gave: string[] }[];
}

export interface GenerationJob {
  id: string;
  status: "queued" | "running" | "done" | "error";
  step?: string;
  result?: GenerationResult;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

const clean = (base: string) => base.replace(/\/+$/, "");

function unreachable(): never {
  throw new GenError(
    "no-server",
    "Could not reach the render server. Check the server URL in settings.",
  );
}

/**
 * Ask for a video. Answers with a job id; nothing has been generated yet.
 *
 * 503 is the case that actually happens on a fresh deployment and it is NOT a
 * failure of this request — the box has no language model configured, and will
 * not have one a moment later, so the screen shows the reason instead of a
 * retry that cannot succeed.
 */
export async function startGeneration(
  base: string,
  req: GenerationRequest,
): Promise<string> {
  const send = async (): Promise<Response> => {
    try {
      return await fetch(`${clean(base)}/v1/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await authHeaders(base)),
        },
        body: JSON.stringify({
          topic: req.topic,
          aspect: req.aspect,
          ...(req.format ? { format: req.format } : {}),
          ...(req.notes ? { notes: req.notes } : {}),
        }),
      });
    } catch {
      unreachable();
    }
  };

  let res = await send();
  /*
   * Once, and only for a guest. A member's 401 is a real expiry and swapping
   * them onto a fresh anonymous account would detach them from their own
   * credits; retrying more than once just mints accounts.
   */
  if (res.status === 401 && (await discardIfGuest())) res = await send();

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
    kind?: string;
  };
  if (res.status === 401)
    throw new GenError("unauthenticated", "Please sign in to generate a video.");
  if (res.status === 402)
    throw new GenError("out-of-credits", data.error ?? "Not enough credits.");
  if (res.status === 503)
    throw new GenError(
      "not-configured",
      data.error ?? "This server is not set up to generate videos yet.",
    );
  if (res.status === 429)
    throw new GenError("failed", "Too many requests just now. Try again in a moment.");
  if (!res.ok || !data.id)
    throw new GenError("failed", data.error ?? `Could not start (HTTP ${res.status}).`);
  return data.id;
}

/**
 * Where a job has got to.
 *
 * A 404 means the server has no such job FOR THIS ACCOUNT — it answers the same
 * way for a job that expired and for one belonging to somebody else, which is
 * the right answer to give a stranger and an unhelpful one to give the owner.
 * Named rather than folded into a generic failure, because the recovery differs:
 * there is nothing to wait for.
 */
export async function fetchGeneration(base: string, id: string): Promise<GenerationJob> {
  let res: Response;
  try {
    res = await fetch(`${clean(base)}/v1/generate/${encodeURIComponent(id)}`, {
      headers: await authHeaders(base),
    });
  } catch {
    unreachable();
  }
  if (res.status === 404)
    throw new GenError("failed", "That generation is no longer on the server.");
  if (res.status === 401)
    throw new GenError("unauthenticated", "Please sign in to generate a video.");
  if (!res.ok) throw new GenError("failed", `Could not read the job (HTTP ${res.status}).`);

  const job = (await res.json()) as GenerationJob;
  /*
   * Made absolute HERE, once, so nothing downstream has to remember. On local
   * disk the service returns a path (`/files/…`) and on S3 a presigned URL, and
   * a relative one handed to `downloadToMedia` fails with a message about a
   * malformed URL rather than about the server it came from.
   */
  if (job.result?.url)
    job.result = { ...job.result, url: absoluteUrl(clean(base), job.result.url) };
  return job;
}

/**
 * How long to wait before asking again.
 *
 * A generation is minutes, not seconds, so this settles much slower than the
 * render poll: the first few checks are quick because a misconfigured server
 * fails almost immediately, and then it backs off to once every four seconds.
 * The read route is rate-limited, and a tight loop across a five-minute job is
 * exactly the traffic that trips it.
 */
export const pollDelay = (attempt: number): number =>
  Math.min(1000 * Math.pow(1.6, attempt), 4000);

export const isSettled = (job: GenerationJob): boolean =>
  job.status === "done" || job.status === "error";
