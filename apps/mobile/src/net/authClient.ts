/**
 * Auth client for the self-hosted provider — talks to the render service's
 * `/v1/auth/register` and `/v1/auth/login`, returning a bearer token the app
 * then sends on generation/credit calls (see `genClient.setAuthToken`). Managed
 * providers (Clerk/Supabase/Firebase) would instead obtain the token from their
 * own SDK; the server verifies whichever is configured.
 */
export type AuthUser = { endUserId: string; email?: string };
export type AuthSuccess = { token: string; user: AuthUser; balance: number };

export type AuthErrorKind = 'email-taken' | 'invalid-credentials' | 'weak-password' | 'bad-email' | 'no-server' | 'not-configured' | 'failed';

export class AuthError extends Error {
  constructor(
    public kind: AuthErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const clean = (base: string) => base.replace(/\/+$/, '');

async function post(base: string, path: string, body: unknown): Promise<AuthSuccess> {
  let res: Response;
  try {
    res = await fetch(`${clean(base)}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('no-server', 'Could not reach the server. Check the render-server URL in Profile.');
  }
  const data = (await res.json().catch(() => ({}))) as { token?: string; user?: AuthUser; balance?: number; error?: string; kind?: AuthErrorKind };
  if (res.status === 404) throw new AuthError('not-configured', 'This server does not have self-hosted accounts enabled.');
  if (!res.ok || !data.token || !data.user) {
    const kind: AuthErrorKind = data.kind ?? (res.status === 401 ? 'invalid-credentials' : res.status === 409 ? 'email-taken' : 'failed');
    throw new AuthError(kind, data.error ?? `Request failed (HTTP ${res.status}).`);
  }
  return { token: data.token, user: data.user, balance: data.balance ?? 0 };
}

export function registerUser(base: string, email: string, password: string): Promise<AuthSuccess> {
  return post(base, '/v1/auth/register', { email, password });
}

export function loginUser(base: string, email: string, password: string): Promise<AuthSuccess> {
  return post(base, '/v1/auth/login', { email, password });
}
