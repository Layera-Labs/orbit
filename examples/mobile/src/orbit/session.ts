/**
 * The bearer token, and the one place that knows how to get one.
 *
 * Every route on the render service needs a JWT — upload, render and generate
 * alike. That does not mean the user has to sign in: a device with no account
 * asks `POST /v1/auth/guest` for a token the SERVICE issued and signed, naming
 * a subject the client could not have chosen. This example never builds a
 * sign-in screen; it only ever holds a guest token, which is enough to upload,
 * render and generate against a device's own free credits.
 *
 * The predecessor to this was an `X-Orbit-Account` header the client filled in
 * itself. Typing somebody else's value spent their credits.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'orbit.example.auth';

interface Stored {
  token: string;
  guest: boolean;
}

let token: string | null = null;
let guest = false;
/** True once the keychain has been read, so a miss is a real miss. */
let loaded = false;

async function restore(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Stored>;
      if (p.token) {
        token = p.token;
        guest = p.guest !== false;
      }
    }
  } catch {
    // An unreadable entry means we mint a fresh guest below, which is
    // recoverable. Throwing here would break app start.
  }
}

async function store(next: Stored | null): Promise<void> {
  token = next?.token ?? null;
  guest = next?.guest ?? false;
  loaded = true;
  try {
    if (next) await SecureStore.setItemAsync(KEY, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Staying authenticated for this launch beats failing the request.
  }
}

/*
 * One in-flight bootstrap, shared.
 *
 * Three screens can ask for a token at once on launch. Without this each would
 * mint its own guest account, scattering one device's free credits across
 * several identities that can never be merged.
 */
let pending: Promise<string | null> | null = null;

async function ensureToken(base: string): Promise<string | null> {
  await restore();
  if (token) return token;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(`${base}/v1/auth/guest`, { method: 'POST' });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (!data.token) return null;
      await store({ token: data.token, guest: true });
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
 * A guest token goes stale for reasons the user cannot act on — the dev server
 * restarted with an ephemeral `ORBIT_JWT_SECRET`, the token aged out — and
 * there is no account to sign back into. Callers retry ONCE on a 401 when this
 * answers true; retrying more than once just mints accounts.
 */
export async function discardIfGuest(): Promise<boolean> {
  await restore();
  if (!token || !guest) return false;
  await store(null);
  return true;
}
