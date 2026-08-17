/**
 * Server-side proxy to the render service, for the portal only.
 *
 * ## Why the session never reaches client JavaScript
 *
 * `apps/web` forwards an `Authorization` header the browser sets, because that
 * app's identity is a guest JWT it manages itself. A developer portal is a
 * different threat model: the token here authorises minting API keys, which
 * bill real credits. So the session lives in an httpOnly cookie the page cannot
 * read, and this route is the only thing that turns it into a bearer token. An
 * XSS on the marketing site then cannot exfiltrate a credential — it can only
 * make requests as the user while they are on the page, which is a much smaller
 * blast radius.
 *
 * ## The allowlist is the point
 *
 * A proxy that forwards anything is an open relay to an authenticated API. Only
 * the routes the portal actually needs are listed, and `/v1/upload` and
 * `/v1/render` are deliberately absent — a render holds a connection for
 * minutes and an upload streams hundreds of megabytes, neither of which belongs
 * in a serverless function. The portal never calls them anyway.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVER = (process.env.ORBIT_SERVER_URL ?? 'http://localhost:8787').replace(/\/+$/, '');

/** Exactly what the portal needs, and nothing else. */
const ALLOWED = [
  /^v1\/keys$/,
  /^v1\/keys\/[\w.-]+$/,
  /^v1\/credits$/,
  /^v1\/credits\/history$/,
];

async function forward(req: NextRequest, path: string[]) {
  const route = path.join('/');
  if (!ALLOWED.some((re) => re.test(route))) {
    return NextResponse.json({ error: 'not proxied' }, { status: 404 });
  }

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    /*
     * Answered here rather than forwarded. A request with no session is not a
     * question for the render service, and letting it through would spend that
     * service's rate limit on traffic we already know the answer to.
     */
    return NextResponse.json(
      { error: 'sign in to continue', kind: 'unauthenticated' },
      { status: 401 },
    );
  }

  const headers = new Headers();
  headers.set('authorization', `Bearer ${session}`);
  const type = req.headers.get('content-type');
  if (type) headers.set('content-type', type);

  const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.text();

  /*
   * The query string travels, or pagination silently does not work: `?limit`
   * and `?before` are how the history route is READ, and dropping them here
   * would hand every caller page one forever with no error to notice. Only the
   * search is forwarded — the path is already fixed by the allowlist above.
   */
  const qs = req.nextUrl.search;

  let upstream: Response;
  try {
    upstream = await fetch(`${SERVER}/${route}${qs}`, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch {
    // The service being unreachable is an operational fact, not a client error,
    // and the screen says so rather than showing an empty list.
    return NextResponse.json(
      { error: 'the render service is unreachable', kind: 'upstream_down' },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      // A key list is per-session and must never be held by a shared cache.
      'cache-control': 'no-store',
    },
  });
}

type Ctx = { params: { path: string[] } };

export const GET = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
export const POST = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
export const DELETE = (req: NextRequest, { params }: Ctx) => forward(req, params.path);
