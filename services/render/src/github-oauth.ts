/**
 * GitHub sign-in for the developer portal.
 *
 * Kept out of `server.ts` because it is a self-contained exchange with an
 * external service, and because the two things that make it safe — the signed
 * state and the stated redirect base — are easier to see in one file than
 * scattered through a 3000-line router.
 *
 * ## The state parameter is signed, not stored
 *
 * CSRF on an OAuth callback means an attacker gets YOUR browser to complete
 * THEIR sign-in, silently binding your session to their account. The usual
 * defence is a random value kept in a server-side session; there is no session
 * store here, so the state is a short-lived JWT signed with the same secret
 * that signs every other token. It carries its own expiry and the redirect it
 * was issued for, so a callback cannot be replayed later or pointed elsewhere.
 *
 * ## The redirect base is STATED, never derived from the request
 *
 * `ORBIT_PUBLIC_URL`, exactly as the password-reset flow does it, and for the
 * same reason: building a URL from the `Host` header lets anyone who can reach
 * the endpoint have the provider send a code to a host of their choosing.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** How long an in-flight sign-in may take before its state stops verifying. */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  /** Where GitHub sends the browser back. Must match the OAuth app exactly. */
  callbackUrl: string;
  /** Where the portal lives, i.e. where the user lands once signed in. */
  appUrl: string;
}

/** Read the config, or null when it is not set up. */
export function githubFromEnv(env: NodeJS.ProcessEnv = process.env): GitHubConfig | null {
  const clientId = env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
  const publicUrl = env.ORBIT_PUBLIC_URL?.trim().replace(/\/+$/, '');
  const appUrl = env.ORBIT_APP_URL?.trim().replace(/\/+$/, '');

  // Truthiness, not `??`. Compose passes the EMPTY STRING for an unset
  // variable, and `??` does not fire on "" — the mistake that left the email
  // sender null on a box whose .env plainly held the key.
  if (!clientId || !clientSecret || !publicUrl || !appUrl) return null;

  return {
    clientId,
    clientSecret,
    callbackUrl: `${publicUrl}/v1/auth/github/callback`,
    appUrl,
  };
}

/*
 * State is an HMAC over a tiny payload, not a JWT.
 *
 * `jose` is a dependency of @layera-labs/orbit-auth, not of this service, and
 * a state value needs none of what a JWT provides — no claims anyone else
 * parses, no key rotation, no audience. It needs to be unforgeable and to
 * expire. An HMAC over `{returnTo, exp}` with the service's own secret is
 * exactly that, using only node:crypto.
 */
interface StatePayload {
  returnTo: string;
  exp: number;
}

const b64u = (b: Buffer) => b.toString('base64url');

function sign(secret: Uint8Array, body: string): string {
  return b64u(createHmac('sha256', Buffer.from(secret)).update(body).digest());
}

/** Sign a state value binding this attempt to one return address. */
export function signState(secret: Uint8Array, returnTo: string, now = Date.now()): string {
  const payload: StatePayload = { returnTo, exp: now + STATE_TTL_MS };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(secret, body)}`;
}

/** Verify one, returning its return address, or null if it is not ours. */
export function verifyState(
  secret: Uint8Array,
  state: string | undefined,
  now = Date.now(),
): { returnTo: string } | null {
  if (!state) return null;
  const [body, mac] = state.split('.');
  if (!body || !mac) return null;

  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(mac);
  // Length first and separately: timingSafeEqual THROWS on a mismatch rather
  // than returning false, so a forged state of the wrong length would be a 500
  // instead of a rejection.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload;
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    return { returnTo: String(payload.returnTo ?? '') };
  } catch {
    return null;
  }
}

export interface GitHubIdentity {
  id: string;
  login: string;
  /** A PRIMARY, VERIFIED address. Anything else must not be trusted to link. */
  email: string;
}

export class GitHubOAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubOAuthError';
  }
}

/** The URL to send the browser to. */
export function authorizeUrl(cfg: GitHubConfig, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.callbackUrl,
    // `read:user` would be enough for the profile, but the primary address is
    // only exposed through user:email — and an unverified address must never be
    // used to link to an existing local account.
    scope: 'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${q}`;
}

/** Exchange the code, then read the identity behind it. */
export async function exchange(
  cfg: GitHubConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubIdentity> {
  const tokenRes = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.callbackUrl,
    }),
  });
  if (!tokenRes.ok) throw new GitHubOAuthError('exchange_failed', 'GitHub rejected the code exchange');

  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!token.access_token) {
    throw new GitHubOAuthError(token.error ?? 'no_token', 'GitHub returned no access token');
  }

  const headers = {
    authorization: `Bearer ${token.access_token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'orbit-render',
  };

  const userRes = await fetchImpl('https://api.github.com/user', { headers });
  if (!userRes.ok) throw new GitHubOAuthError('profile_failed', 'Could not read the GitHub profile');
  const user = (await userRes.json()) as { id?: number; login?: string };
  if (user.id == null || !user.login) {
    throw new GitHubOAuthError('profile_failed', 'GitHub profile was missing an id');
  }

  /*
   * The email is fetched separately and filtered hard.
   *
   * `/user`'s own `email` field is the PUBLIC profile email, which is null for
   * most people and is not verified in any case. Linking on it would let
   * anyone who sets an unverified address at GitHub take over the local
   * account that already owns it.
   */
  const emailRes = await fetchImpl('https://api.github.com/user/emails', { headers });
  let email: string | undefined;
  if (emailRes.ok) {
    const list = (await emailRes.json()) as {
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }[];
    email = list.find((e) => e.primary && e.verified && e.email)?.email
      ?? list.find((e) => e.verified && e.email)?.email;
  }

  /*
   * No verified address at all. Rather than refuse the sign-in, mint the
   * address GitHub itself reserves for this: it is unique, it is stable, and
   * it can never collide with a real inbox — so `email NOT NULL UNIQUE` holds
   * and the account cannot be linked to by anyone claiming that address.
   */
  const fallback = `${user.login}@users.noreply.github.com`;

  return { id: String(user.id), login: user.login, email: email ?? fallback };
}

/** A stable, non-reversible tag for logging which identity signed in. */
export const identityTag = (id: string): string =>
  createHash('sha256').update(`github:${id}`).digest('hex').slice(0, 12);
