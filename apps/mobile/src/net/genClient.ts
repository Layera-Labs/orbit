/**
 * Generation client — talks to the render service's credit-metered generation
 * endpoints. The provider key lives on the server (the developer's deployment);
 * the app identifies itself with a bearer token so the server can meter
 * credits. Mirrors `renderClient.ts`'s plain-fetch + `{ error }` contract.
 *
 * The token comes from `net/session`, which mints a GUEST one when the device
 * has not signed in. It replaces a stable per-device id the app generated and
 * sent in `X-Orbit-Account` — the server took that at its word, so the header
 * was an account name anyone could type.
 */
import { authHeaders, discardIfGuest } from "./session";

export type GenErrorKind =
  | "out-of-credits"
  | "not-configured"
  | "no-server"
  | "failed"
  | "cancelled"
  | "unauthenticated";

export class GenError extends Error {
  constructor(
    public kind: GenErrorKind,
    message: string,
    public balance?: number,
  ) {
    super(message);
    this.name = "GenError";
  }
}

const clean = (base: string) => base.replace(/\/+$/, "");

/** Was this thrown value an abort (user cancelled / disconnected)? */
function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** Generate an image from a prompt. Returns the asset URL + the new credit balance. */
async function generateImageOnce(
  base: string,
  prompt: string,
  size?: { width: number; height: number },
  signal?: AbortSignal,
): Promise<{ url: string; balance: number }> {
  let res: Response;
  try {
    res = await fetch(`${clean(base)}/v1/generate-image`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await authHeaders(base)),
      },
      body: JSON.stringify({
        prompt,
        width: size?.width,
        height: size?.height,
      }),
      signal,
    });
  } catch (e) {
    if (isAbort(e)) throw new GenError("cancelled", "Cancelled.");
    throw new GenError(
      "no-server",
      "Could not reach the render server. Check the server URL in settings.",
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    balance?: number;
    error?: string;
  };
  if (res.status === 401)
    throw new GenError("unauthenticated", "Please sign in to use AI.");
  if (res.status === 402)
    throw new GenError(
      "out-of-credits",
      data.error ?? "Out of credits.",
      data.balance,
    );
  if (res.status === 503)
    throw new GenError(
      "not-configured",
      data.error ?? "Image generation is not configured on the render server.",
    );
  if (!res.ok || !data.url)
    throw new GenError(
      "failed",
      data.error ?? `Generation failed (HTTP ${res.status}).`,
    );
  return { url: data.url, balance: data.balance ?? 0 };
}

/** Generate a video from a prompt. Returns the MP4 URL (+ optional sound-effect URL) + balance. */
async function generateVideoOnce(
  base: string,
  prompt: string,
  size?: { width: number; height: number },
  opts?: { durationSec?: number; audio?: boolean; image?: string },
  signal?: AbortSignal,
): Promise<{ url: string; audioUrl?: string; balance: number }> {
  let res: Response;
  try {
    res = await fetch(`${clean(base)}/v1/generate-video`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await authHeaders(base)),
      },
      body: JSON.stringify({
        prompt,
        width: size?.width,
        height: size?.height,
        durationSec: opts?.durationSec,
        audio: opts?.audio,
        image: opts?.image,
      }),
      signal,
    });
  } catch (e) {
    if (isAbort(e)) throw new GenError("cancelled", "Cancelled.");
    throw new GenError(
      "no-server",
      "Could not reach the render server. Check the server URL in settings.",
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    audioUrl?: string;
    balance?: number;
    error?: string;
  };
  if (res.status === 401)
    throw new GenError("unauthenticated", "Please sign in to use AI.");
  if (res.status === 402)
    throw new GenError(
      "out-of-credits",
      data.error ?? "Out of credits.",
      data.balance,
    );
  if (res.status === 503)
    throw new GenError(
      "not-configured",
      data.error ?? "Video generation is not configured on the render server.",
    );
  if (!res.ok || !data.url)
    throw new GenError(
      "failed",
      data.error ?? `Generation failed (HTTP ${res.status}).`,
    );
  return { url: data.url, audioUrl: data.audioUrl, balance: data.balance ?? 0 };
}

/** Generate a spoken voiceover from text (TTS). Returns the MP3 URL + balance. */
async function generateTtsOnce(
  base: string,
  text: string,
  voice?: string,
  speed?: number,
  signal?: AbortSignal,
): Promise<{ url: string; balance: number }> {
  let res: Response;
  try {
    res = await fetch(`${clean(base)}/v1/tts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await authHeaders(base)),
      },
      body: JSON.stringify({ text, voice, speed }),
      signal,
    });
  } catch (e) {
    if (isAbort(e)) throw new GenError("cancelled", "Cancelled.");
    throw new GenError(
      "no-server",
      "Could not reach the render server. Check the server URL in settings.",
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    balance?: number;
    error?: string;
  };
  if (res.status === 401)
    throw new GenError("unauthenticated", "Please sign in to use AI.");
  if (res.status === 402)
    throw new GenError(
      "out-of-credits",
      data.error ?? "Out of credits.",
      data.balance,
    );
  if (res.status === 503)
    throw new GenError(
      "not-configured",
      data.error ??
        "Voiceover generation is not configured on the render server.",
    );
  if (!res.ok || !data.url)
    throw new GenError(
      "failed",
      data.error ?? `Generation failed (HTTP ${res.status}).`,
    );
  return { url: data.url, balance: data.balance ?? 0 };
}

export interface CaptionLine {
  text: string;
  start: number;
  end: number;
}

/**
 * Transcribe an already-uploaded clip into caption lines.
 *
 * Takes the `upload:` token the export path produces, so captioning a clip you
 * have already uploaded costs no second upload of the same file. The grouping
 * into lines happens server-side, so every client gets the same captions from
 * the same audio.
 */
async function transcribeOnce(
  base: string,
  src: string,
  language?: string,
  signal?: AbortSignal,
): Promise<{ lines: CaptionLine[]; balance: number }> {
  let res: Response;
  try {
    res = await fetch(`${clean(base)}/v1/transcribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await authHeaders(base)),
      },
      body: JSON.stringify({ src, language }),
      signal,
    });
  } catch (e) {
    if (isAbort(e)) throw new GenError("cancelled", "Cancelled.");
    throw new GenError(
      "no-server",
      "Could not reach the render server. Check the server URL in settings.",
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    lines?: CaptionLine[];
    balance?: number;
    error?: string;
  };
  if (res.status === 401)
    throw new GenError("unauthenticated", "Please sign in to use AI.");
  if (res.status === 402)
    throw new GenError(
      "out-of-credits",
      data.error ?? "Out of credits.",
      data.balance,
    );
  if (res.status === 503)
    throw new GenError(
      "not-configured",
      data.error ?? "Auto captions are not configured on the render server.",
    );
  if (!res.ok || !data.lines)
    throw new GenError(
      "failed",
      data.error ?? `Transcription failed (HTTP ${res.status}).`,
    );
  return { lines: data.lines, balance: data.balance ?? 0 };
}

/** Current credit balance for this device's account (null if unreachable). */
export async function getCredits(
  base: string,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const res = await fetch(`${clean(base)}/v1/credits`, {
      headers: await authHeaders(base),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { balance?: number };
    return typeof data.balance === "number" ? data.balance : null;
  } catch {
    return null;
  }
}

/**
 * Retry once on 401, but only for a guest.
 *
 * A guest token can go stale for reasons the user cannot act on — the server
 * restarted with an ephemeral dev secret, or the token aged past a year — and
 * "please sign in" is the wrong answer to that, because there is no account to
 * sign into. Take a fresh guest token and try again. A MEMBER's expired token
 * IS a real sign-in, so `discardIfGuest` leaves it alone rather than quietly
 * moving them onto an anonymous account with none of their credits.
 *
 * Once, never in a loop: if the fresh token is refused too, the next one will
 * be as well, and each attempt mints an account.
 */
function withGuestRetry<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof GenError && err.kind === "unauthenticated" && (await discardIfGuest()))
        return fn(...args);
      throw err;
    }
  };
}

export const generateImage = withGuestRetry(generateImageOnce);
export const generateVideo = withGuestRetry(generateVideoOnce);
export const generateTts = withGuestRetry(generateTtsOnce);
export const transcribe = withGuestRetry(transcribeOnce);
