/**
 * Email sign-in, sign-up and sign-out for the portal.
 *
 * Separate from the `/api/orbit/*` proxy because these three do something that
 * proxy deliberately never does: they SET AND CLEAR THE SESSION COOKIE. The
 * proxy only ever reads it. Keeping the write in one small file means there is
 * exactly one place that decides how long a session lasts and what flags it
 * carries.
 *
 * The token never reaches the browser. The render service returns it in a JSON
 * body; this route lifts it into an httpOnly cookie and returns only what the
 * screen needs. That is the whole reason these are server routes rather than a
 * fetch from the client — a portal session authorises minting API keys that
 * bill real credits, so it must not be readable by page JavaScript.
 *
 * GitHub sign-in does not come through here: that flow is a browser redirect,
 * and the render service sets the same cookie itself on its callback.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVER = (process.env.ORBIT_SERVER_URL ?? 'http://localhost:8787').replace(/\/+$/, '');

/** 30 days, matching the service's own token lifetime. */
const MAX_AGE = 30 * 24 * 60 * 60;

const cookieOptions = {
  httpOnly: true,
  // Off in development, where the portal is plain http on localhost and a
  // secure cookie would simply never be stored — a sign-in that appears to
  // succeed and then behaves as though it never happened.
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  const action = params.action;

  if (action === 'signout') {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return res;
  }

  if (action !== 'login' && action !== 'register') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'expected JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json(
      { error: 'Enter your email and password.', kind: 'missing' },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${SERVER}/v1/auth/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'The service is not reachable. Nothing was changed.', kind: 'upstream_down' },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  let parsed: { token?: string; error?: string; kind?: string } = {};
  try {
    parsed = text ? (JSON.parse(text) as typeof parsed) : {};
  } catch {
    return NextResponse.json(
      { error: 'The service returned something unexpected.', kind: 'upstream_down' },
      { status: 502 },
    );
  }

  if (!upstream.ok || !parsed.token) {
    // The upstream message is passed through as-is. It is written for a person
    // ("That email is already registered."), and rewriting it here would mean
    // two places deciding what a failure means.
    return NextResponse.json(
      { error: parsed.error ?? 'Could not sign you in.', kind: parsed.kind },
      { status: upstream.status || 500 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, parsed.token, { ...cookieOptions, maxAge: MAX_AGE });
  return res;
}
