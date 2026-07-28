/**
 * Proxy for the render service's CREDIT-METERED endpoints.
 *
 * Not a CORS workaround — the service already sends `Access-Control-Allow-Origin: *`.
 * The reason is the account id. With `ORBIT_AUTH_PROVIDER` unset the service
 * hands 100 free credits to every new `X-Orbit-Account` value, so a browser that
 * sets that header itself can mint credits forever with one line in devtools.
 * Here the id lives in an httpOnly cookie the page cannot read or rotate. That
 * is not security — only real server-side auth is — but it moves the bar from
 * trivial to deliberate, and it keeps ORBIT_SERVER_URL off the client.
 *
 * `/v1/upload` and `/v1/render` are deliberately NOT proxied: render holds one
 * connection for up to ten minutes and upload streams up to 500 MB, neither of
 * which survives a serverless function. The browser calls those two directly.
 */
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

// Long generations need a Node runtime and a long ceiling. Vercel Hobby caps
// functions at 60s, which is not enough for `/v1/generate-video` — Runway
// generates a still and then animates it, polling up to 180s for each. Use Pro
// or a self-hosted `next start`.
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const SERVER = process.env.ORBIT_SERVER_URL ?? 'http://localhost:8787';
const COOKIE = 'orbit_account';

/** Endpoints this proxy is willing to forward. */
const ALLOWED = [
  /^v1\/generate-image$/,
  /^v1\/generate-video$/,
  /^v1\/tts$/,
  /^v1\/credits$/,
  /^v1\/auth\/[a-z]+$/,
];

async function forward(req: NextRequest, path: string[]) {
  const route = path.join('/');
  if (!ALLOWED.some((re) => re.test(route)))
    return NextResponse.json({ error: 'not proxied' }, { status: 404 });

  const account = req.cookies.get(COOKIE)?.value ?? `web_${randomUUID()}`;
  const headers = new Headers({ 'x-orbit-account': account });
  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  const body = req.method === 'GET' ? undefined : await req.text();
  if (body) headers.set('content-type', 'application/json');

  let upstream: Response;
  try {
    upstream = await fetch(`${SERVER}/${route}`, {
      method: req.method,
      headers,
      body,
      // The caller aborting (a cancelled job, a closed tab) must reach the
      // service so it stops the provider call rather than finishing and billing.
      signal: req.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return NextResponse.json(
      { error: `cannot reach the render service at ${SERVER}`, kind: 'no-server' },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  const res = new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
  // Pin the account on first contact so the balance survives a reload.
  if (!req.cookies.get(COOKIE))
    res.cookies.set(COOKIE, account, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  return res;
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path);
}
