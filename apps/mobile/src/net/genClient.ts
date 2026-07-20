/**
 * Generation client — talks to the render service's credit-metered generation
 * endpoints. The provider key lives on the server (the developer's deployment);
 * the app only identifies its account (a stable per-device id) so the server can
 * meter credits. Mirrors `renderClient.ts`'s plain-fetch + `{ error }` contract.
 */
import * as SecureStore from 'expo-secure-store';

const ACCOUNT_ID_KEY = 'orbit.account.id';
let cachedAccount: string | null = null;

/** A stable, anonymous per-device account id (created once, kept in the keychain). */
export async function getAccount(): Promise<string> {
  if (cachedAccount) return cachedAccount;
  let id = await SecureStore.getItemAsync(ACCOUNT_ID_KEY);
  if (!id) {
    id = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(ACCOUNT_ID_KEY, id);
  }
  cachedAccount = id;
  return id;
}

export type GenErrorKind = 'out-of-credits' | 'not-configured' | 'no-server' | 'failed';

export class GenError extends Error {
  constructor(
    public kind: GenErrorKind,
    message: string,
    public balance?: number,
  ) {
    super(message);
    this.name = 'GenError';
  }
}

const clean = (base: string) => base.replace(/\/+$/, '');

/** Generate an image from a prompt. Returns the asset URL + the new credit balance. */
export async function generateImage(
  base: string,
  prompt: string,
  size?: { width: number; height: number },
): Promise<{ url: string; balance: number }> {
  const account = await getAccount();
  let res: Response;
  try {
    res = await fetch(`${clean(base)}/v1/generate-image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Orbit-Account': account },
      body: JSON.stringify({ prompt, width: size?.width, height: size?.height }),
    });
  } catch {
    throw new GenError('no-server', 'Could not reach the render server. Check the server URL in settings.');
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; balance?: number; error?: string };
  if (res.status === 402) throw new GenError('out-of-credits', data.error ?? 'Out of credits.', data.balance);
  if (res.status === 503) throw new GenError('not-configured', data.error ?? 'Image generation is not configured on the render server.');
  if (!res.ok || !data.url) throw new GenError('failed', data.error ?? `Generation failed (HTTP ${res.status}).`);
  return { url: data.url, balance: data.balance ?? 0 };
}

/** Generate a video from a prompt. Returns the MP4 URL (+ optional sound-effect URL) + balance. */
export async function generateVideo(
  base: string,
  prompt: string,
  size?: { width: number; height: number },
  opts?: { durationSec?: number; audio?: boolean },
): Promise<{ url: string; audioUrl?: string; balance: number }> {
  const account = await getAccount();
  let res: Response;
  try {
    res = await fetch(`${clean(base)}/v1/generate-video`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Orbit-Account': account },
      body: JSON.stringify({ prompt, width: size?.width, height: size?.height, durationSec: opts?.durationSec, audio: opts?.audio }),
    });
  } catch {
    throw new GenError('no-server', 'Could not reach the render server. Check the server URL in settings.');
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; audioUrl?: string; balance?: number; error?: string };
  if (res.status === 402) throw new GenError('out-of-credits', data.error ?? 'Out of credits.', data.balance);
  if (res.status === 503) throw new GenError('not-configured', data.error ?? 'Video generation is not configured on the render server.');
  if (!res.ok || !data.url) throw new GenError('failed', data.error ?? `Generation failed (HTTP ${res.status}).`);
  return { url: data.url, audioUrl: data.audioUrl, balance: data.balance ?? 0 };
}

/** Current credit balance for this device's account (null if unreachable). */
export async function getCredits(base: string): Promise<number | null> {
  const account = await getAccount();
  try {
    const res = await fetch(`${clean(base)}/v1/credits`, { headers: { 'X-Orbit-Account': account } });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { balance?: number };
    return typeof data.balance === 'number' ? data.balance : null;
  } catch {
    return null;
  }
}
