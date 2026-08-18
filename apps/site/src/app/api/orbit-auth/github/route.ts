/**
 * Hand the browser to the render service's GitHub sign-in.
 *
 * A one-line redirect exists so the API origin stays server-side and the link
 * in the page is same-origin. It also gives one place to attach `returnTo`,
 * which the service confines to a path before it trusts it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { API_ORIGIN, githubSignInUrl } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('returnTo') ?? '/app';
  // Checked here as well as in the service. Belt and braces on an open
  // redirect is cheap, and this is the side that builds the URL.
  const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app';
  if (!API_ORIGIN) {
    return NextResponse.json({ error: 'sign-in is not configured' }, { status: 503 });
  }
  return NextResponse.redirect(githubSignInUrl(returnTo));
}
