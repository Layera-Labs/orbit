/**
 * The portal's typed client for the render service, via the proxy.
 *
 * Everything goes through `/api/orbit/*`, so the session token stays in an
 * httpOnly cookie and never touches this file.
 *
 * ## Errors are values, not exceptions
 *
 * Every screen has to distinguish four outcomes — signed out, the service being
 * down, a real API error, and success — and a thrown Error flattens the first
 * three into one. So requests resolve to a discriminated union and the caller
 * renders the case. That is what stops "not signed in" from being displayed as
 * "something went wrong", which is the single most common way a portal wastes a
 * user's time.
 */

/** Mirrors `ApiKeyRecord` in services/render/src/api-keys.ts. */
export interface ApiKey {
  id: string;
  name: string;
  /** Last 4 characters of the raw key. The rest is not stored anywhere. */
  last4: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

/** The 201 body of `POST /v1/keys` — the only time the secret exists here. */
export interface CreatedApiKey extends ApiKey {
  key: string;
  warning: string;
}

export type Failure =
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'upstream_down' }
  | { ok: false; kind: 'error'; message: string };

export type Result<T> = { ok: true; value: T } | Failure;

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/orbit/${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, kind: 'upstream_down' };
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // A non-JSON body from an API that only speaks JSON means something in
      // front of it answered — a proxy error page, a gateway. Report it as the
      // service being unreachable rather than parsing HTML for a message.
      return { ok: false, kind: 'upstream_down' };
    }
  }

  const asError = body as { error?: string; kind?: string } | null;

  if (res.status === 401) return { ok: false, kind: 'unauthenticated' };
  if (res.status === 502 || res.status === 503) return { ok: false, kind: 'upstream_down' };
  if (!res.ok) {
    return {
      ok: false,
      kind: 'error',
      message: asError?.error ?? `request failed (${res.status})`,
    };
  }
  return { ok: true, value: body as T };
}

export const listKeys = () => call<{ keys: ApiKey[] }>('v1/keys');

export const createKey = (name: string) =>
  call<CreatedApiKey>('v1/keys', { method: 'POST', body: JSON.stringify({ name }) });

export const revokeKey = (id: string) =>
  call<{ ok: true }>(`v1/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const getCredits = () => call<{ balance: number }>('v1/credits');

/**
 * One page of ledger history, newest first.
 *
 * `limit` and `before` go on the query string, which the proxy forwards
 * verbatim — the server clamps the limit, so asking for more than it allows is
 * answered with a bounded page rather than an error.
 */
export function getHistory(opts: { limit?: number; before?: string } = {}) {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.before) qs.set('before', opts.before);
  const q = qs.toString();
  return call<import('./ledger').HistoryPage>(`v1/credits/history${q ? `?${q}` : ''}`);
}
