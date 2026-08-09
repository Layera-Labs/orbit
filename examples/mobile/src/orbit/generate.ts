/**
 * A topic goes in one end and a video comes out the other — `POST /v1/generate`.
 *
 * This is a JOB, not a request that returns a file. The server answers 202 with
 * an id and then spends minutes on it: a language model writes the scenes, a
 * text-to-speech call records each one, the words are aligned into captions, a
 * stock search finds a picture per scene, the edit is composed, and finally
 * ffmpeg renders it. So the shape here is start-then-poll.
 *
 * Credits are HELD when the job is accepted and settled only once a file
 * exists. A generation that fails gives them back — which is why a 402 arrives
 * at `start` and never mid-run.
 */
import { authHeaders, discardIfGuest } from './session';
import { absoluteUrl } from './server';

/**
 * The steps the server reports, in the order they run.
 *
 * Used only to say WHERE a job has got to, so a step a newer server adds simply
 * falls off the end of the lane: `stepIndex` answers -1 and `stepLabel` falls
 * back to the raw name rather than showing a blank line.
 */
export const GEN_STEPS = [
  { key: 'plan', label: 'Writing the scenes' },
  { key: 'speak', label: 'Recording the voice' },
  { key: 'align', label: 'Timing the captions' },
  { key: 'visuals', label: 'Finding the pictures' },
  { key: 'compose', label: 'Cutting the edit' },
  { key: 'render', label: 'Rendering' },
] as const;

export const stepIndex = (step?: string): number => GEN_STEPS.findIndex((s) => s.key === step);

export function stepLabel(step?: string): string {
  const i = stepIndex(step);
  if (i >= 0) return GEN_STEPS[i].label;
  // A job claimed but not yet reporting, or a step from a newer server.
  return step || 'Starting';
}

export const GEN_ASPECTS = ['9:16', '1:1', '16:9'] as const;
export type GenAspect = (typeof GEN_ASPECTS)[number];

/**
 * The bound the server validates against, repeated so the field can stop the
 * user AT the limit rather than let them write past it and be refused. If it
 * drifts the server still wins — it revalidates — and the symptom is a 400
 * shown verbatim rather than silent truncation.
 */
export const MAX_TOPIC = 400;

export function frameSizeFor(aspect: GenAspect): { width: number; height: number } {
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  if (aspect === '16:9') return { width: 1920, height: 1080 };
  return { width: 1080, height: 1920 };
}

export interface GenerationResult {
  url: string;
  durationSec?: number;
  /** Present when word timings could not be produced; captions are per scene. */
  alignmentSkipped?: string;
}

export interface GenerationJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  step?: string;
  result?: GenerationResult;
  error?: string;
}

/**
 * Why a call failed, when the answer changes what the screen should offer.
 *
 * `not-configured` is the one that actually happens on a fresh deployment and
 * it is NOT a transient failure — the box has no language model configured and
 * will not have one a moment later, so offering "try again" would be a lie.
 */
export type GenFailure = 'unreachable' | 'not-configured' | 'out-of-credits' | 'failed';

export class GenError extends Error {
  constructor(
    readonly kind: GenFailure,
    message: string,
  ) {
    super(message);
  }
}

/** True when retrying could plausibly succeed. */
export const isRetryable = (err: unknown): boolean =>
  !(err instanceof GenError) || err.kind === 'unreachable' || err.kind === 'failed';

function unreachable(): never {
  throw new GenError(
    'unreachable',
    'Could not reach the render service. Check that it is running and that this device can see it.',
  );
}

/** Ask for a video. Answers with a job id; nothing has been generated yet. */
export async function startGeneration(
  base: string,
  req: { topic: string; aspect: GenAspect },
): Promise<string> {
  const send = async (): Promise<Response> => {
    try {
      return await fetch(`${base}/v1/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeaders(base)) },
        body: JSON.stringify({ topic: req.topic, aspect: req.aspect }),
      });
    } catch {
      unreachable();
    }
  };

  let res = await send();
  if (res.status === 401 && (await discardIfGuest())) res = await send();

  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (res.status === 402)
    throw new GenError('out-of-credits', data.error ?? 'Not enough credits for a generation.');
  if (res.status === 503)
    throw new GenError(
      'not-configured',
      data.error ?? 'This service has no language model configured, so it cannot generate videos.',
    );
  if (res.status === 429)
    throw new GenError('failed', 'Too many requests just now. Try again in a moment.');
  if (!res.ok || !data.id)
    throw new GenError('failed', data.error ?? `Could not start (HTTP ${res.status}).`);
  return data.id;
}

/**
 * Where a job has got to.
 *
 * A 404 means the service has no such job FOR THIS ACCOUNT — the same answer
 * for one that expired and one belonging to somebody else, which is the right
 * thing to tell a stranger. Either way there is nothing left to wait for.
 */
export async function fetchGeneration(base: string, id: string): Promise<GenerationJob> {
  let res: Response;
  try {
    res = await fetch(`${base}/v1/generate/${encodeURIComponent(id)}`, {
      headers: await authHeaders(base),
    });
  } catch {
    unreachable();
  }
  if (res.status === 404)
    throw new GenError('failed', 'That generation is no longer on the service.');
  if (!res.ok) throw new GenError('failed', `Could not read the job (HTTP ${res.status}).`);

  const job = (await res.json()) as GenerationJob;
  // Made absolute HERE, once, so nothing downstream has to remember that a
  // local-disk service answers with a path and a bucket-backed one with a URL.
  if (job.result?.url) job.result = { ...job.result, url: absoluteUrl(base, job.result.url) };
  return job;
}

/**
 * How long to wait before asking again: 1s, then backing off to 4s.
 *
 * A generation is minutes, not seconds. The first few checks are quick because
 * a misconfigured server fails almost immediately; after that a tight loop
 * across a five-minute job is exactly the traffic the read route's rate limit
 * exists to stop.
 */
export const pollDelay = (attempt: number): number => Math.min(1000 * Math.pow(1.6, attempt), 4000);

export const isSettled = (job: GenerationJob): boolean =>
  job.status === 'done' || job.status === 'error';
