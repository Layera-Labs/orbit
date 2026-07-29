/**
 * Proxy for the render service's CREDIT-METERED endpoints.
 *
 * Not a CORS workaround — the service already sends `Access-Control-Allow-Origin: *`.
 * What it buys now is one thing: `ORBIT_SERVER_URL` stays off the client.
 *
 * It used to buy more. Identity was an `X-Orbit-Account` header, and since the
 * service handed free credits to every new value, a browser that set the header
 * itself could mint credits forever from devtools; this proxy kept the id in an
 * httpOnly cookie so the page could not choose it. That was a bar, not a fix.
 * The service now requires a signed token on every route and ignores the header
 * entirely, so the cookie has nothing left to protect and is gone — a signed-out
 * browser holds a guest JWT instead, which it cannot forge.
 *
 * `/v1/upload` and `/v1/render` are deliberately NOT proxied: render holds one
 * connection for up to ten minutes and upload streams up to 500 MB, neither of
 * which survives a serverless function. The browser calls those two directly,
 * with the same bearer token it sends here.
 */
import { NextResponse, type NextRequest } from 'next/server';

// Long generations need a Node runtime and a long ceiling. Vercel Hobby caps
// functions at 60s, which is not enough for `/v1/generate-video` — Runway
// generates a still and then animates it, polling up to 180s for each. Use Pro
// or a self-hosted `next start`.
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const SERVER = process.env.ORBIT_SERVER_URL ?? 'http://localhost:8787';

/** Endpoints this proxy is willing to forward. */
const ALLOWED = [
  /^v1\/generate-image$/,
  /^v1\/generate-video$/,
  /^v1\/tts$/,
  // Metered like the rest, and the audio is already on the service as an
  // upload token — the body is a token, not a file, so it stays small.
  /^v1\/transcribe$/,
  /^v1\/credits$/,
  /^v1\/auth\/[a-z]+$/,
];

async function forward(req: NextRequest, path: string[]) {
  const route = path.join('/');
  if (!ALLOWED.some((re) => re.test(route)))
    return NextResponse.json({ error: 'not proxied' }, { status: 404 });

  const headers = new Headers();
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
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path);
}
