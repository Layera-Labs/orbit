/**
 * The bearer token, and the one place that knows how to get one.
 *
 * Every call to the render service is authenticated now — generation, credits,
 * upload and render alike. Being signed out is not the absence of a token, it
 * is a GUEST token the service issued: signed, naming a subject the browser
 * could not have chosen. That is the whole difference from what this replaces,
 * where a signed-out browser identified itself by a header value and anybody
 * could type somebody else's.
 *
 * Storage is localStorage, which any script on the origin can read. That is the
 * standard trade for a bearer token the client has to attach itself, and it is
 * the same exposure the signed-in token already had; an XSS on this origin owns
 * the session either way. It is deliberately the SAME key for guest and member,
 * because they are the same thing to every caller — signing in swaps which
 * subject the token names, not whether there is one.
 */
const KEY = 'orbit.auth';
const BASE = '/api/orbit';

export interface SessionUser {
  endUserId: string;
  email?: string;
  guest?: boolean;
}

interface Persisted {
  token: string;
  user: SessionUser;
}

let token: string | null = null;
let user: SessionUser | null = null;

/** Read the token cached by a previous visit. Safe to call repeatedly. */
function restore(): void {
  if (token || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as Persisted;
    if (p?.token) {
      token = p.token;
      user = p.user ?? null;
    }
  } catch {
    // Corrupt or unreadable (private mode, a cleared quota). Falling through
    // means we ask for a fresh guest token, which is a recoverable state; a
    // throw here would take down whatever was rendering.
  }
}

/** Adopt a token — after sign-in, registration, reset, or a guest bootstrap. */
export function setSession(next: string | null, nextUser: SessionUser | null): void {
  token = next;
  user = nextUser;
  if (typeof window === 'undefined') return;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify({ token: next, user: nextUser }));
    else localStorage.removeItem(KEY);
  } catch {
    // Staying authenticated for this tab beats refusing the sign-in outright.
  }
}

export function currentUser(): SessionUser | null {
  restore();
  return user;
}

export function isGuest(): boolean {
  return currentUser()?.guest === true;
}

/*
 * One in-flight bootstrap, shared.
 *
 * The editor fires several of these at once on load — the credits read, a
 * filmstrip's upload, whatever panel is open — and without this each would mint
 * its own guest account, scattering one person's free credits across four
 * identities and burning the rate limit for the next visitor on the same IP.
 */
let pending: Promise<string | null> | null = null;

/** The token to send, minting a guest one if this browser has none yet. */
export async function ensureToken(): Promise<string | null> {
  restore();
  if (token) return token;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(`${BASE}/v1/auth/guest`, { method: 'POST' });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string; user?: SessionUser };
      if (!data.token) return null;
      setSession(data.token, data.user ?? null);
      return data.token;
    } catch {
      // Offline, or no service. The caller's own error path is the right place
      // to report that — here it just means "no token to send".
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** `Authorization` for a request, bootstrapping a guest token if needed. */
export async function authHeaders(): Promise<Record<string, string>> {
  const t = await ensureToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

/**
 * Drop a token the server has rejected, so the next call gets a fresh one.
 *
 * A guest token can go stale for reasons the user cannot act on — the dev
 * server restarted with an ephemeral secret, the token aged out after a year —
 * and the honest recovery is a new guest, not a sign-in prompt for an account
 * that never existed. A MEMBER's token is different: it expiring means sign in
 * again, and silently swapping them onto a guest account would quietly detach
 * them from their own credits.
 */
export function discardIfGuest(): boolean {
  if (!isGuest()) return false;
  setSession(null, null);
  return true;
}
