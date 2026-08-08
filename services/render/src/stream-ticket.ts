import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A one-job, short-lived credential for an SSE stream.
 *
 * ## Why this exists at all
 *
 * `EventSource` cannot set request headers. There is no option for it in the
 * API and never has been, so the `Authorization: Bearer` every other route on
 * this service requires is simply unavailable to the one client that wants to
 * stream — `ExportJobPoller` constructs an `EventSource` from a URL and nothing
 * else.
 *
 * The obvious workaround is to put the session JWT in the query string. That
 * token is the credential for EVERYTHING: credits, projects, renders, the
 * account itself. In a URL it lands in browser history, in the `Referer` of any
 * subsequent navigation, in every intermediary's access log, and in whatever a
 * user pastes when they report a bug. This service already keeps query strings
 * out of its OWN logs, but that is one place out of many and not the ones it
 * controls.
 *
 * So the URL carries a ticket instead, and a ticket can do exactly one thing:
 * watch one job, for a few minutes. Leaking it costs the progress of a render
 * whose id the holder already had.
 *
 * ## Stateless on purpose
 *
 * An HMAC over `(jobId, account, expiry)` rather than a row in a table. Nothing
 * to store, nothing to evict, nothing to replicate — and it works on every
 * instance in a cluster without the shared queue being configured, which
 * matters because the box that mints the ticket is often not the box that runs
 * the render.
 *
 * The trade is that a ticket cannot be revoked before it expires. That is why
 * the TTL is minutes rather than hours, and why the ticket names the job: there
 * is no window in which it grants anything the holder did not already have.
 */

/** Long enough to start a stream and reconnect a few times, short enough not to matter. */
export const TICKET_TTL_MS = 10 * 60_000;

/**
 * A key of its own, derived from the session secret rather than being it.
 *
 * Signing two different kinds of thing with one key is how a signature from one
 * context gets accepted in another. Deriving costs one hash and means a ticket
 * can never be mistaken for a session token, or the reverse, whatever either
 * format grows into later.
 */
function ticketKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("orbit:sse-ticket:v1").digest();
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", ticketKey(secret)).update(payload).digest("base64url");
}

/**
 * Mint a ticket for one job.
 *
 * `account` is bound in so a ticket cannot be moved to another session, and
 * checked again at verify time against the caller's own — the job-ownership
 * rule stays exactly where it is rather than being replaced by this.
 */
export function mintStreamTicket(
  secret: string,
  jobId: string,
  account: string,
  now = Date.now(),
): string {
  const expires = now + TICKET_TTL_MS;
  const payload = `${jobId}.${account}.${expires}`;
  return `${expires}.${sign(secret, payload)}`;
}

/**
 * Check a ticket against the job and account it claims to be for.
 *
 * Returns a reason rather than a boolean so the route can answer 401 with
 * something a client can act on — "expired" means mint another, "invalid"
 * means the URL was mangled or forged and retrying will not help.
 */
export function verifyStreamTicket(
  secret: string,
  ticket: string,
  jobId: string,
  account: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: "expired" | "invalid" } {
  const dot = ticket.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "invalid" };
  const expires = Number(ticket.slice(0, dot));
  if (!Number.isFinite(expires)) return { ok: false, reason: "invalid" };

  /*
   * The signature is checked BEFORE the clock, deliberately. Answering
   * "expired" to a forged ticket would confirm that the rest of it was
   * well-formed, which is a small oracle and free to avoid.
   */
  const expected = sign(secret, `${jobId}.${account}.${expires}`);
  const got = ticket.slice(dot + 1);
  if (!sameString(expected, got)) return { ok: false, reason: "invalid" };
  if (expires <= now) return { ok: false, reason: "expired" };
  return { ok: true };
}

/** Constant-time, and length-safe — `timingSafeEqual` throws on a mismatch. */
function sameString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
