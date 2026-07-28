/**
 * Generation client. A port of `apps/mobile/src/net/genClient.ts`, keeping the
 * error taxonomy identical so both clients behave the same way when the service
 * is unconfigured, out of credits, or simply absent.
 *
 * Web differences: the base URL is our own `/api/orbit` proxy (which injects the
 * account id), and every call carries an explicit timeout.
 */

const BASE = '/api/orbit';

/**
 * Ceilings. Video's exceeds the service's OWN limits on purpose — Runway polls
 * up to 180s for the still and 180s again for the animation, so a shorter client
 * timeout would replace the server's specific error with a generic one.
 */
const TIMEOUT = { image: 90_000, video: 210_000, tts: 60_000, credits: 15_000 };

export type GenErrorKind =
  | 'out-of-credits'
  | 'not-configured'
  | 'no-server'
  | 'failed'
  | 'cancelled'
  | 'unauthenticated';

export class GenError extends Error {
  constructor(
    message: string,
    readonly kind: GenErrorKind,
    readonly balance?: number,
  ) {
    super(message);
  }
}

async function post<T>(
  path: string,
  body: unknown,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(ms);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw new GenError('cancelled', 'cancelled');
    if ((err as Error).name === 'TimeoutError')
      throw new GenError('That took too long and was stopped.', 'failed');
    throw new GenError('Could not reach the render service.', 'no-server');
  }

  if (res.ok) return (await res.json()) as T;

  const data = (await res.json().catch(() => ({}))) as { error?: string; balance?: number };
  if (res.status === 401) throw new GenError('Sign in to generate.', 'unauthenticated');
  if (res.status === 402)
    throw new GenError('Not enough credits.', 'out-of-credits', data.balance);
  // 503 = the service has no provider key; 404 = auth routes are not mounted.
  if (res.status === 503 || res.status === 404)
    throw new GenError(
      'Generation is not configured on this server.',
      'not-configured',
    );
  if (res.status === 502)
    throw new GenError('Could not reach the render service.', 'no-server');
  throw new GenError(data.error ?? `Generation failed (HTTP ${res.status})`, 'failed');
}

export interface GenResult {
  url: string;
  audioUrl?: string;
  balance?: number;
}

export const generateImage = (
  body: { prompt: string; width?: number; height?: number },
  signal?: AbortSignal,
) => post<GenResult>('v1/generate-image', body, TIMEOUT.image, signal);

export const generateVideo = (
  body: { prompt: string; width?: number; height?: number; durationSec?: number; audio?: boolean },
  signal?: AbortSignal,
) => post<GenResult>('v1/generate-video', body, TIMEOUT.video, signal);

export const speak = (body: { text: string; voice?: string }, signal?: AbortSignal) =>
  post<GenResult>('v1/tts', body, TIMEOUT.tts, signal);

/**
 * Current balance, or null when the server has auth disabled.
 *
 * A 404 here means the auth routes are simply not mounted — that is a
 * configuration, not an error, and the UI hides the credit display rather than
 * showing a failure. Mobile treats it the same way.
 */
export async function credits(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/v1/credits`, {
      signal: AbortSignal.timeout(TIMEOUT.credits),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { balance?: number };
    return data.balance ?? null;
  } catch {
    return null;
  }
}

/** Credit prices, mirroring `packages/billing/src/metering.ts`. */
export const COST = {
  image: 10,
  video: 100,
  videoMuted: 60,
  tts: 5,
} as const;
