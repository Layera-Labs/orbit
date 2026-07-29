// @vitest-environment node
//
// Every request is under a JWT.
//
// This is tested over real HTTP because the claim is about the ROUTES, not
// about `accountOf`: a unit test of the helper would have passed happily while
// `/v1/upload` sat in front of it unguarded, which is exactly the bug. What is
// asserted here is the boundary — nothing gets in without a token this server
// signed, and a token does not let you read someone else's work.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

vi.mock('@orbit/video', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video')>();
  return { ...actual, renderProject: async () => {} };
});

let server: Server;
let base: string;
let auth: Record<string, string>;

beforeAll(async () => {
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  auth = bearer(await guestToken(base));
});

afterAll(() => {
  server.close();
});

const project = {
  id: 'p',
  schemaVersion: 2,
  width: 64,
  height: 64,
  fps: 30,
  background: { type: 'color', color: '#000' },
  clips: [],
  overlays: [],
  audio: [],
};

const render = (headers: Record<string, string> = {}, body: Record<string, unknown> = {}) =>
  fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ project, ...body }),
  });

const uploadForm = () => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([1, 2, 3])]), 'a.bin');
  return form;
};

describe('the unauthenticated surface', () => {
  it('refuses a render with no token', async () => {
    const res = await render();
    expect(res.status).toBe(401);
    expect(((await res.json()) as { kind?: string }).kind).toBe('unauthenticated');
  });

  it('refuses an upload with no token', async () => {
    const res = await fetch(`${base}/v1/upload`, { method: 'POST', body: uploadForm() });
    expect(res.status).toBe(401);
  });

  it('refuses to read credits with no token', async () => {
    expect((await fetch(`${base}/v1/credits`)).status).toBe(401);
  });

  /*
   * The header this replaces. It used to BE the identity, so anyone could spend
   * anyone's credits by typing their account id. It must now be inert — not
   * "less trusted", not "a fallback": ignored completely.
   */
  it('ignores X-Orbit-Account entirely', async () => {
    const res = await render({ 'X-Orbit-Account': 'somebody-elses-account' });
    expect(res.status).toBe(401);
  });

  it('refuses a token this server did not sign', async () => {
    // Structurally a JWT, signed with a key that is not ours.
    const forged =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJndWVzdF9hdHRhY2tlciIsImd1ZXN0Ijp0cnVlfQ.' +
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect((await render(bearer(forged))).status).toBe(401);
  });

  it('refuses a malformed Authorization header', async () => {
    expect((await render({ authorization: 'Basic abc' })).status).toBe(401);
    expect((await render({ authorization: 'Bearer' })).status).toBe(401);
  });

  /* /health is the one open route, deliberately: a load balancer cannot hold a
     token, and it exposes no account data. */
  it('leaves /health open', async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});

describe('a guest token', () => {
  it('is accepted everywhere a session is', async () => {
    expect((await render(auth)).status).toBe(200);
    const credits = await fetch(`${base}/v1/credits`, { headers: auth });
    expect(credits.status).toBe(200);
    expect(typeof ((await credits.json()) as { balance: number }).balance).toBe('number');
  });

  it('names a subject the client did not choose', async () => {
    const res = await fetch(`${base}/v1/auth/guest`, { method: 'POST' });
    const { user } = (await res.json()) as { user: { endUserId: string; guest?: boolean } };
    expect(user.guest).toBe(true);
    expect(user.endUserId).toMatch(/^guest_/);
  });

  it('gets its own account, not a shared one', async () => {
    const a = (await (await fetch(`${base}/v1/auth/guest`, { method: 'POST' })).json()) as {
      user: { endUserId: string };
    };
    const b = (await (await fetch(`${base}/v1/auth/guest`, { method: 'POST' })).json()) as {
      user: { endUserId: string };
    };
    expect(a.user.endUserId).not.toBe(b.user.endUserId);
  });
});

describe('render jobs belong to whoever started them', () => {
  it('hides another account\'s job behind a 404', async () => {
    const started = await render(auth, { async: true });
    const { id } = (await started.json()) as { id: string };

    // Mine.
    expect((await fetch(`${base}/v1/render/${id}`, { headers: auth })).status).toBe(200);

    // Somebody else's, holding a perfectly valid token of their own. 404 and
    // not 403 — a 403 would confirm the id is real, which is the only thing an
    // enumerator is after.
    const other = bearer(await guestToken(base));
    expect((await fetch(`${base}/v1/render/${id}`, { headers: other })).status).toBe(404);
  });

  it('refuses to report a job with no token at all', async () => {
    const started = await render(auth, { async: true });
    const { id } = (await started.json()) as { id: string };
    expect((await fetch(`${base}/v1/render/${id}`)).status).toBe(401);
  });
});
