/**
 * Which render service to talk to.
 *
 * Resolution order, and the order matters:
 *   1. `extra.serverUrl` from `app.json` — what a real build ships with.
 *   2. Expo's dev `hostUri` — the machine running Metro. This is why a dev
 *      build on a physical phone reaches your Mac with no configuration:
 *      `hostUri` is `192.168.x.x:8081`, and swapping the port gives the
 *      service's.
 *   3. `localhost:8787` — the simulator, where localhost is the Mac.
 *
 * Leaving `extra.serverUrl` empty in `app.json` is deliberate. Hardcode a
 * production URL there and step 2 never runs, so every debug export burns a
 * render slot on a shared box.
 */
import Constants from 'expo-constants';

const PORT = 8787;

function fromHostUri(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Older Expo runtimes expose it here instead.
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } } | undefined)?.extra
      ?.expoGo?.debuggerHost;
  if (!hostUri) return null;
  const host = String(hostUri).split(':')[0];
  if (!host) return null;
  return `http://${host}:${PORT}`;
}

/** The service's base URL, with no trailing slash. */
export function serverUrl(): string {
  const configured = (Constants.expoConfig?.extra as { serverUrl?: string } | undefined)?.serverUrl;
  const base = (configured && configured.trim()) || fromHostUri() || `http://localhost:${PORT}`;
  return base.replace(/\/+$/, '');
}

/**
 * Resolve a url the service handed back.
 *
 * It is absolute when output storage is a bucket (a presigned GET) and relative
 * (`/files/…`) when it is the container's disk. The client cannot know which,
 * because the same build talks to both.
 */
export const absoluteUrl = (base: string, url: string): string =>
  /^https?:\/\//.test(url) ? url : `${base}${url}`;
