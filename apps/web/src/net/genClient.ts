/**
 * Generation client. A port of `apps/mobile/src/net/genClient.ts`, keeping the
 * error taxonomy identical so both clients behave the same way when the service
 * is unconfigured, out of credits, or simply absent.
 *
 * Web differences: the base URL is our own `/api/orbit` proxy (which injects the
 * account id), and every call carries an explicit timeout.
 */

import { authHeaders, discardIfGuest } from './session';

const BASE = '/api/orbit';

/*
 * The token lives in `net/session`, which also mints a guest one when this
 * browser has none. Every route below requires it — a signed-out visitor is a
 * guest with a real token, not a caller with no identity — so `authHeaders` is
 * async: the first call of a session may have to fetch the token first.
 */

/**
 * Ceilings. Video's exceeds the service's OWN limits on purpose — Runway polls
 * up to 180s for the still and 180s again for the animation, so a shorter client
 * timeout would replace the server's specific error with a generic one.
 */
const TIMEOUT = {
  image: 90_000,
  video: 210_000,
  tts: 60_000,
  credits: 15_000,
  // Scribe runs on the whole file at once. A long voiceover is the slow case,
  // and a short ceiling here would turn "still working" into a generic failure.
  transcribe: 180_000,
};

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
  retried = false,
): Promise<T> {
  const timeout = AbortSignal.timeout(ms);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
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
  if (res.status === 401) {
    /*
     * A guest token can go stale for reasons the user cannot act on — a dev
     * server restarted with an ephemeral secret, a token a year old — and
     * "Sign in to generate" is the wrong answer to that, since there is no
     * account to sign into. Take a fresh guest token and try once. A MEMBER's
     * expired token is a genuine sign-in, and `discardIfGuest` leaves it alone.
     */
    if (!retried && discardIfGuest()) return post<T>(path, body, ms, signal, true);
    throw new GenError('Sign in to generate.', 'unauthenticated');
  }
  if (res.status === 402)
    throw new GenError('Not enough credits.', 'out-of-credits', data.balance);
  // 503 = the service has no provider key; 404 = auth routes are not mounted.
  if (res.status === 503 || res.status === 404)
    throw new GenError(
      'Generation is not configured on this server.',
      'not-configured',
    );
  /*
   * 502 is the service telling us its PROVIDER refused — out of credits, or a
   * key without the right permission. The service is reachable and it said
   * something specific, so saying "could not reach the render service" was
   * both wrong and unactionable. Only fall back to that when there is no
   * message to pass on.
   */
  if (res.status === 502)
    throw new GenError(data.error ?? 'Could not reach the render service.', 'failed');
  throw new GenError(data.error ?? `Generation failed (HTTP ${res.status})`, 'failed');
}

export interface GenResult {
  url: string;
  audioUrl?: string;
  balance?: number;
}

/**
 * Where a generated file actually lives.
 *
 * The service answers with the provider's own absolute url when it proxies one
 * (Runway's CDN), and with a RELATIVE `/files/...` path when it wrote the file
 * itself — which is what TTS always does. A relative path resolves against the
 * PAGE's origin, so speech generation fetched `localhost:3100/files/...`,
 * got a 404 from Next, and failed every single time with the file sitting
 * ready on the service. `exportProject` has always done this; generation did
 * not.
 *
 * Not the proxy base: `/files` is served by the service and is not proxied.
 */
const FILES = process.env.NEXT_PUBLIC_ORBIT_RENDER_URL ?? 'http://localhost:8787';
const absolute = (url: string) => (/^(https?:|blob:|data:)/.test(url) ? url : `${FILES}${url}`);

const located = <T extends GenResult>(r: T): T => ({
  ...r,
  url: absolute(r.url),
  audioUrl: r.audioUrl ? absolute(r.audioUrl) : undefined,
});

export const generateImage = (
  body: { prompt: string; width?: number; height?: number },
  signal?: AbortSignal,
) => post<GenResult>('v1/generate-image', body, TIMEOUT.image, signal).then(located);

export const generateVideo = (
  body: { prompt: string; width?: number; height?: number; durationSec?: number; audio?: boolean },
  signal?: AbortSignal,
) => post<GenResult>('v1/generate-video', body, TIMEOUT.video, signal).then(located);

export const speak = (body: { text: string; voice?: string }, signal?: AbortSignal) =>
  post<GenResult>('v1/tts', body, TIMEOUT.tts, signal).then(located);

/*
 * Re-exported, not re-declared.
 *
 * This was a third hand-copy of a shape the package already owns, kept in step
 * by nobody. Web can simply import it: the dependency is already there, and a
 * type-only import erases entirely, so the bundle is unchanged. Mobile still
 * needs its own copy — it installs outside the workspace and cannot resolve the
 * package at all — which is exactly why this one should not have existed.
 */
export type { CaptionLine } from '@layera-labs/orbit-video/browser';
import type { CaptionLine } from '@layera-labs/orbit-video/browser';

/**
 * Speech to timed caption lines.
 *
 * `src` is an `upload:<token>` — the audio is already on the service, so the
 * request body stays a few dozen bytes and this can go through the proxy like
 * every other metered call. The service does the line grouping (`groupWords`),
 * because splitting a transcript into readable lines is a decision the export
 * and both clients must agree on.
 */
export const transcribe = (
  body: { src: string; language?: string },
  signal?: AbortSignal,
) =>
  post<{ lines: CaptionLine[]; balance?: number }>(
    'v1/transcribe',
    body,
    TIMEOUT.transcribe,
    signal,
  );

/**
 * What the account line should say.
 *
 * Three OUTCOMES, not two, and conflating them is what made generation a dead
 * end: a 404 means the auth routes are not mounted (no accounting here — hide
 * the credit display), while a 401 means this server does meter and you are
 * signed out. Both used to collapse to `null`, so the panel showed nothing at
 * all and the only way to discover you needed an account was to write a prompt,
 * press Generate and read the failure.
 */
export type CreditState =
  | { state: 'off' }
  | { state: 'signed-out' }
  | { state: 'ok'; balance: number };

export async function credits(retried = false): Promise<CreditState> {
  try {
    const res = await fetch(`${BASE}/v1/credits`, {
      headers: await authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT.credits),
    });
    if (res.status === 401) {
      // `retried` bounds this: if the FRESH guest token is rejected too, the
      // server is not going to accept the next one either, and recursing would
      // mint an account per round trip forever.
      if (!retried && discardIfGuest()) return credits(true);
      return { state: 'signed-out' };
    }
    if (!res.ok) return { state: 'off' };
    const data = (await res.json()) as { balance?: number };
    return data.balance == null ? { state: 'off' } : { state: 'ok', balance: data.balance };
  } catch {
    // Unreachable is not the same as unmetered, but there is nothing useful to
    // say about credits when the service is down — the first request will.
    return { state: 'off' };
  }
}

/** Credit prices, mirroring `packages/billing/src/metering.ts`. */
export const COST = {
  image: 10,
  video: 100,
  videoMuted: 60,
  tts: 5,
} as const;
