/**
 * The bearer token, and the one place that knows how to get one.
 *
 * Every call to the render service is authenticated now — generation, credits,
 * upload and export alike. "No Login Required" on onboarding is still true, and
 * this is what makes it true: a device that has not signed in holds a GUEST
 * token the service issued, signed, naming a subject the app could not have
 * chosen. That replaces an `X-Orbit-Account` header the client picked itself,
 * where typing somebody else's value spent their credits.
 *
 * The token is in the keychain (`expo-secure-store`), same as before, and under
 * the SAME key for guest and member — they are the same thing to every caller.
 * Signing in swaps which subject the token names; it does not switch
 * authentication on.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'orbit.auth';

export interface SessionUser {
  endUserId: string;
  email?: string;
  guest?: boolean;
}

let token: string | null = null;
let user: SessionUser | null = null;
/** True once the keychain has been read, so a miss is a real miss. */
let loaded = false;

/** Read what a previous launch stored. Cheap after the first call. */
export async function restoreSession(): Promise<SessionUser | null> {
  if (loaded) return user;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) {
      const p = JSON.parse(raw) as { token?: string; user?: SessionUser };
      if (p?.token) {
        token = p.token;
        user = p.user ?? null;
      }
    }
  } catch {
    // An unreadable keychain entry means we mint a fresh guest below, which is
    // recoverable. Throwing here would break app start.
  }
  loaded = true;
  return user;
}

/** Adopt a token — after sign-in, registration, reset, or a guest bootstrap. */
export async function setSession(
  next: string | null,
  nextUser: SessionUser | null,
): Promise<void> {
  token = next;
  user = nextUser;
  loaded = true;
  try {
    if (next) await SecureStore.setItemAsync(KEY, JSON.stringify({ token: next, user: nextUser }));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Staying authenticated for this launch beats refusing the sign-in.
  }
}

export function currentUser(): SessionUser | null {
  return user;
}

export function isGuest(): boolean {
  return user?.guest === true;
}

/*
 * One in-flight bootstrap, shared.
 *
 * The editor fires several of these at once on launch — the credit read, an
 * export's first upload — and without this each would mint its own guest
 * account, scattering one device's free credits across several identities.
 */
let pending: Promise<string | null> | null = null;

/** The token to send, minting a guest one if this device has none yet. */
export async function ensureToken(base: string): Promise<string | null> {
  await restoreSession();
  if (token) return token;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(`${base.replace(/\/+$/, '')}/v1/auth/guest`, { method: 'POST' });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string; user?: SessionUser };
      if (!data.token) return null;
      await setSession(data.token, data.user ?? null);
      return data.token;
    } catch {
      // Offline, or no service reachable. The caller's own error path reports
      // that; here it only means "no token to send".
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** `Authorization` for a request, bootstrapping a guest token if needed. */
export async function authHeaders(base: string): Promise<Record<string, string>> {
  const t = await ensureToken(base);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Drop a token the server rejected, so the next call gets a fresh one.
 *
 * A guest token can go stale for reasons the user cannot act on — the dev
 * server restarted with an ephemeral secret, the token aged past a year — and
 * a sign-in prompt is the wrong answer, because there is no account to sign
 * into. A MEMBER's expiry IS a real sign-in, so this leaves it alone rather
 * than silently detaching them from their own credits.
 */
export async function discardIfGuest(): Promise<boolean> {
  if (!isGuest()) return false;
  await setSession(null, null);
  return true;
}
