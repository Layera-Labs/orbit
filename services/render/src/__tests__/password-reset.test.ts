// @vitest-environment node
//
// Password reset, end to end over real HTTP.
//
// Tested at the route level rather than as units because every bug this has
// actually had lived between the pieces, not inside them: the env never reached
// the container, the empty string defeated a `??`, the client sent people to a
// paste-a-code screen for a mail that carried a link. The units were all fine.
//
// Two servers are booted with different environments, because "what does this
// deployment mail out" is the whole question — one with a public address (mails
// a link to its own /reset page) and one without (mails the raw token).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.mock('@layera-labs/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@layera-labs/video/node')>();
  return { ...actual, renderProject: async () => {} };
});

const PUBLIC = 'https://orbit-api.example.com';

/** Every message the stubbed Resend API was handed, newest last. */
let sent: { to: string; subject: string; text: string; html?: string }[] = [];
/** Flipped on to make the next send fail, for the enumeration test. */
let sendFails = false;

let linkServer: Server;
let codeServer: Server;
let linkBase: string;
let codeBase: string;

const realFetch = globalThis.fetch;

beforeAll(async () => {
  /*
   * Set BEFORE the import: the rate limits are module-level constants read once
   * at load. The default of 5 creates-per-minute is right for a real deployment
   * and would fail this file halfway through on a 429.
   */
  process.env.ORBIT_AUTH_CREATE_RATE_LIMIT = '1000';
  process.env.ORBIT_AUTH_RATE_LIMIT = '1000';
  process.env.ORBIT_JWT_SECRET = 'test-secret-for-password-reset';
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Orbit <no-reply@example.com>';

  // Intercept only Resend; anything else this server does still goes out.
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (href.includes('api.resend.com')) {
      if (sendFails) return new Response('{"message":"nope"}', { status: 422 });
      sent.push(JSON.parse(String(init?.body)));
      return new Response('{"id":"1"}', { status: 200 });
    }
    return realFetch(url as never, init);
  }) as typeof fetch;

  const { createServer } = await import('../server.js');

  process.env.ORBIT_PUBLIC_URL = PUBLIC;
  linkServer = createServer().listen(0);
  await new Promise((r) => linkServer.once('listening', r));
  linkBase = `http://127.0.0.1:${(linkServer.address() as AddressInfo).port}`;

  delete process.env.ORBIT_PUBLIC_URL;
  codeServer = createServer().listen(0);
  await new Promise((r) => codeServer.once('listening', r));
  codeBase = `http://127.0.0.1:${(codeServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  linkServer.close();
  codeServer.close();
});

const post = (base: string, path: string, body: unknown) =>
  realFetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

let n = 0;
const freshEmail = () => `reset-${Date.now()}-${n++}@example.com`;

describe('the reset page', () => {
  it('serves a form and never carries a token in its markup', async () => {
    // Asked for WITH a token, because that is how it is always reached — and the
    // point is that the response is byte-identical either way.
    const withToken = await realFetch(`${linkBase}/reset?token=abc.def.ghi`);
    const bare = await realFetch(`${linkBase}/reset`);
    expect(withToken.status).toBe(200);

    const html = await withToken.text();
    expect(html).toBe(await bare.text());
    expect(html).not.toContain('abc.def.ghi');
    expect(html).toContain('<form');
    expect(html).toContain('/v1/auth/reset');
  });

  it('is served with the headers that keep the token off the wire', async () => {
    const res = await realFetch(`${linkBase}/reset?token=x`);
    // The token is in the URL, so a referrer would hand it to any third party.
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const csp = res.headers.get('content-security-policy') ?? '';
    // Nothing may post the token anywhere but back here.
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe('POST /v1/auth/forgot', () => {
  it('mails a link to the reset page when the service knows its address', async () => {
    const email = freshEmail();
    await post(linkBase, '/v1/auth/register', { email, password: 'originalpw1' });
    sent = [];

    const res = await post(linkBase, '/v1/auth/forgot', { email });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivery: 'link' });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].text).toContain(`${PUBLIC}/reset?token=`);
    // Both parts of the message say the same thing; the text part is the one
    // some people actually read.
    expect(sent[0].html).toContain(`${PUBLIC}/reset?token=`);
  });

  it('mails the raw token when it has no address to link to', async () => {
    const email = freshEmail();
    await post(codeBase, '/v1/auth/register', { email, password: 'originalpw1' });
    sent = [];

    const res = await post(codeBase, '/v1/auth/forgot', { email });
    expect(await res.json()).toEqual({ ok: true, delivery: 'code' });
    expect(sent[0].text).not.toContain('http');
    // A JWT, not a short code — which is exactly why the link path exists.
    expect(sent[0].text).toMatch(/[\w-]+\.[\w-]+\.[\w-]+/);
  });

  it('answers identically for an address with no account, and sends nothing', async () => {
    sent = [];
    const res = await post(linkBase, '/v1/auth/forgot', { email: freshEmail() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivery: 'link' });
    expect(sent).toHaveLength(0);
  });

  it('still answers 200 when the send itself fails', async () => {
    /*
     * The load-bearing one. A send is only ATTEMPTED when the account exists,
     * so surfacing the failure would turn this route into an oracle: 500 means
     * registered, 200 means not. The operator's channel is the log.
     */
    const email = freshEmail();
    await post(linkBase, '/v1/auth/register', { email, password: 'originalpw1' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendFails = true;
    try {
      const res = await post(linkBase, '/v1/auth/forgot', { email });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, delivery: 'link' });
      expect(err).toHaveBeenCalled();
      expect(String(err.mock.calls[0][0])).toContain('reset-email-failed');
    } finally {
      sendFails = false;
      err.mockRestore();
    }
  });
});

describe('the whole round trip', () => {
  it('mails a token that sets a new password, once, and retires the old one', async () => {
    const email = freshEmail();
    await post(linkBase, '/v1/auth/register', { email, password: 'originalpw1' });
    sent = [];
    await post(linkBase, '/v1/auth/forgot', { email });

    // Taken out of the mail the way a person would: follow the link.
    const link = /https:\/\/\S+/.exec(sent[0].text)?.[0] ?? '';
    const token = new URL(link).searchParams.get('token') ?? '';
    expect(token).not.toBe('');

    const reset = await post(linkBase, '/v1/auth/reset', { token, password: 'brandnewpw2' });
    expect(reset.status).toBe(200);
    expect((await reset.json()).user.email).toBe(email);

    const withNew = await post(linkBase, '/v1/auth/login', { email, password: 'brandnewpw2' });
    expect(withNew.status).toBe(200);

    const withOld = await post(linkBase, '/v1/auth/login', { email, password: 'originalpw1' });
    expect(withOld.status).toBe(401);

    // Single use — the page tells the user this, so it had better be true.
    const again = await post(linkBase, '/v1/auth/reset', { token, password: 'thirdpassword3' });
    expect(again.status).toBe(400);
    expect((await again.json()).kind).toBe('invalid-token');
  });
});
