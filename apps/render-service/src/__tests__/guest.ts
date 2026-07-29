/**
 * A bearer token for tests.
 *
 * Every metered or storage-touching route requires one now, so a test that
 * posts to `/v1/render` without it is testing the 401 and nothing else. The
 * guest route is the same one a signed-out client uses, so this exercises the
 * real path rather than minting a token behind the server's back.
 */
export async function guestToken(base: string): Promise<string> {
  const res = await fetch(`${base}/v1/auth/guest`, { method: 'POST' });
  if (!res.ok) throw new Error(`guest token failed (HTTP ${res.status})`);
  return ((await res.json()) as { token: string }).token;
}

/** `Authorization` header for a token from `guestToken`. */
export const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});
