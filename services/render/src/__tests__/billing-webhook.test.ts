// @vitest-environment node
//
// The purchase webhook, which used to be open.
//
// `if (secret && …)` meant that leaving `REVENUECAT_WEBHOOK_AUTH` unset did not
// weaken the check — it removed it. The route then minted credits for anyone
// who posted to it, against product ids that are not secret: they are App Store
// identifiers shipped inside the mobile binary. And because the idempotency
// check read the account's ENTIRE ledger history, each of those calls also
// forced an unbounded scan on an account id the caller chose.
//
// These are tested over real HTTP rather than against the handler, because the
// claim is about the ROUTE. A unit test of the auth helper would have passed
// happily while the route in front of it was public, which is the shape of the
// original bug.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.mock('@layera-labs/orbit-video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@layera-labs/orbit-video/node')>();
  return { ...actual, renderProject: async () => {} };
});

const SECRET = 'test-webhook-secret';

/**
 * A server per test, because the thing under test is read from the environment
 * at request time and each case needs a different environment.
 */
async function boot(secret: string | undefined): Promise<{ base: string; server: Server }> {
  if (secret === undefined) delete process.env.REVENUECAT_WEBHOOK_AUTH;
  else process.env.REVENUECAT_WEBHOOK_AUTH = secret;
  const { createServer } = await import('../server.js');
  const server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

const purchase = (txId: string) => ({
  event: {
    type: 'INITIAL_PURCHASE',
    app_user_id: 'user-under-test',
    product_id: 'credits_100',
    transaction_id: txId,
  },
});

function post(base: string, body: unknown, auth?: string) {
  return fetch(`${base}/v1/billing/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
}

let open: Server | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
  delete process.env.REVENUECAT_WEBHOOK_AUTH;
});

describe('POST /v1/billing/webhook', () => {
  it('REFUSES when no secret is configured, rather than accepting everything', async () => {
    const { base, server } = await boot(undefined);
    open = server;
    const res = await post(base, purchase('tx-1'));
    expect(res.status).toBe(503);
    // And it must not have granted anything on the way to refusing.
    expect((await res.json()).balance).toBeUndefined();
  });

  it('rejects a wrong secret', async () => {
    const { base, server } = await boot(SECRET);
    open = server;
    expect((await post(base, purchase('tx-2'), 'not-the-secret')).status).toBe(401);
  });

  it('rejects a missing header even when a secret IS configured', async () => {
    const { base, server } = await boot(SECRET);
    open = server;
    expect((await post(base, purchase('tx-3'))).status).toBe(401);
  });

  it('rejects a secret that is merely a prefix of the real one', async () => {
    // Guards the length check in `secretsMatch` — `timingSafeEqual` throws on a
    // length mismatch, so a naive implementation can turn a short guess into a
    // 500 (and a 500 that a wrong-length guess produces is itself an oracle).
    const { base, server } = await boot(SECRET);
    open = server;
    expect((await post(base, purchase('tx-4'), SECRET.slice(0, 4))).status).toBe(401);
  });

  it('grants once for a transaction, and is idempotent on retry', async () => {
    const { base, server } = await boot(SECRET);
    open = server;
    const first = await post(base, purchase('tx-5'), SECRET);
    expect(first.status).toBe(200);
    const after = (await first.json()).balance as number;

    // RevenueCat retries. The second call must not double-credit.
    const second = await post(base, purchase('tx-5'), SECRET);
    expect(second.status).toBe(200);
    expect((await second.json()).balance).toBe(after);
  });

  it('credits again for a DIFFERENT transaction', async () => {
    const { base, server } = await boot(SECRET);
    open = server;
    const one = (await (await post(base, purchase('tx-6'), SECRET)).json()).balance as number;
    const two = (await (await post(base, purchase('tx-7'), SECRET)).json()).balance as number;
    expect(two).toBeGreaterThan(one);
  });

  it('acks a non-granting event without crediting', async () => {
    const { base, server } = await boot(SECRET);
    open = server;
    const res = await post(base, { event: { type: 'CANCELLATION', app_user_id: 'u' } }, SECRET);
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe(true);
  });
});
