/**
 * Accounts, for a render service that meters.
 *
 * A port of `apps/mobile/src/net/authClient.ts` with the same error taxonomy, so
 * the two clients say the same thing about the same server. It goes through our
 * own `/api/orbit` proxy rather than straight at the service: the proxy already
 * allowlists `v1/auth/*` and forwards `Authorization` untouched, and routing one
 * of the two clients around it would mean ORBIT_SERVER_URL leaking into the
 * browser bundle.
 *
 * The editor does NOT need any of this. Only generation and credits do — the
 * service mounts these routes only when ORBIT_AUTH_PROVIDER is set, and a 404
 * here means "this deployment has no accounts", which is a configuration rather
 * than a failure.
 */
const BASE = '/api/orbit';

export type AuthUser = { endUserId: string; email?: string };
export type AuthSuccess = { token: string; user: AuthUser; balance: number };

export type AuthErrorKind =
  | 'email-taken'
  | 'invalid-credentials'
  | 'weak-password'
  | 'bad-email'
  | 'invalid-token'
  | 'email-unconfigured'
  | 'no-server'
  | 'not-configured'
  | 'failed';

export class AuthError extends Error {
  constructor(
    readonly kind: AuthErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

async function post(path: string, body: unknown): Promise<AuthSuccess> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('no-server', 'Could not reach the render service.');
  }

  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    user?: AuthUser;
    balance?: number;
    error?: string;
    kind?: AuthErrorKind;
  };

  if (res.status === 404)
    throw new AuthError(
      'not-configured',
      'This render service does not have accounts enabled.',
    );
  if (!res.ok || !data.token || !data.user) {
    // Prefer the server's own `kind` — it distinguishes a weak password from a
    // taken email, which the status code alone cannot.
    const kind: AuthErrorKind =
      data.kind ??
      (res.status === 401
        ? 'invalid-credentials'
        : res.status === 409
          ? 'email-taken'
          : 'failed');
    throw new AuthError(kind, data.error ?? `Request failed (HTTP ${res.status}).`);
  }
  return { token: data.token, user: data.user, balance: data.balance ?? 0 };
}

export const registerUser = (email: string, password: string) =>
  post('v1/auth/register', { email, password });

export const loginUser = (email: string, password: string) =>
  post('v1/auth/login', { email, password });

/**
 * How this server delivers a reset: `link` means it mailed a reset page,
 * `code` means it mailed the raw token. A property of the SERVER, not of the
 * account, so reporting it leaks nothing about who has one.
 */
export type ResetDelivery = 'link' | 'code';

/** Sends a reset mail. Says only HOW it delivers — by design, so the reply
 *  cannot be used to discover which addresses have accounts. A server that
 *  predates the reset page omits `delivery` and only ever mailed the token. */
export async function requestPasswordReset(email: string): Promise<ResetDelivery> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/auth/forgot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new AuthError('no-server', 'Could not reach the render service.');
  }
  if (res.status === 404)
    throw new AuthError('not-configured', 'This render service does not have accounts enabled.');
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    kind?: AuthErrorKind;
    delivery?: ResetDelivery;
  };
  if (!res.ok)
    throw new AuthError(data.kind ?? 'failed', data.error ?? 'Could not send the reset email.');
  return data.delivery === 'link' ? 'link' : 'code';
}

export const resetPassword = (token: string, password: string) =>
  post('v1/auth/reset', { token, password });
