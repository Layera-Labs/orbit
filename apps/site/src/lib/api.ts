/**
 * Where the render service is, and what it supports.
 *
 * Server-only by construction rather than by the `server-only` package: it
 * reads a non-NEXT_PUBLIC env var, which Next replaces with undefined in a
 * client bundle, so importing this from a client component fails loudly at the
 * first call rather than leaking anything. Nothing in the browser needs the
 * origin — every call goes through this app's own routes.
 */
export const API_ORIGIN = (process.env.ORBIT_SERVER_URL ?? 'http://localhost:8787').replace(
  /\/+$/,
  '',
);

export const githubSignInUrl = (returnTo: string) =>
  `${API_ORIGIN}/v1/auth/github?returnTo=${encodeURIComponent(returnTo)}`;

/**
 * Is GitHub sign-in available?
 *
 * ASKED, not configured twice. The service mounts its OAuth routes only when
 * all four of its variables are set, so the service already knows the answer —
 * and a `NEXT_PUBLIC_GITHUB_ENABLED` here would be a second switch that has to
 * be kept in agreement with the first. This repo has been bitten three times
 * by exactly that shape of duplication (the email variables, the LLM ones, and
 * the free-credit grant), every time with the same symptom: a correctly
 * configured box behaving as though it were not.
 *
 * The probe is cheap: `redirect: 'manual'`, so nothing follows through to
 * GitHub, and a 3xx means mounted while a 404 means it is not.
 */
export async function githubEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_ORIGIN}/v1/auth/github`, {
      method: 'GET',
      redirect: 'manual',
      // Re-checked every few minutes rather than per request: this changes only
      // when someone redeploys, and a sign-in page should not wait on a network
      // round trip it could have cached.
      next: { revalidate: 300 },
    });
    return res.status >= 300 && res.status < 400;
  } catch {
    // The service being unreachable is not evidence that GitHub is unavailable,
    // but it is evidence that sending someone there now would fail. Hide it.
    return false;
  }
}
