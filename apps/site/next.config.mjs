/**
 * The public site. Its own config, deliberately — see `apps/site/package.json`.
 *
 * The editor's policy (`apps/web/next.config.mjs`) is stricter than this in
 * places and looser in one, and neither app should inherit the other's reasons.
 */

/** The render service this site talks to for live quotes and, later, the portal. */
const API_ORIGIN = (
  process.env.NEXT_PUBLIC_ORBIT_API_URL || 'http://localhost:8787'
).replace(/\/+$/, '');

const dev = process.env.NODE_ENV !== 'production';

/*
 * Written out rather than assembled from a helper so that reading this file
 * tells you the whole policy.
 *
 * `script-src` carries no external origins and that is a standing decision, not
 * an oversight: the moment an analytics or chat tag is added here, this policy
 * stops being a boundary and becomes a formality. Adding one should require
 * editing this line and thinking about it.
 *
 * `'unsafe-eval'` is DEV ONLY. Without it `next dev`'s eval-based chunks are
 * blocked, the server-rendered HTML still arrives so the page looks fine, and
 * React simply never hydrates — no effect runs, nothing is interactive, and
 * nothing in the console points at the cause. That failure has already cost
 * this repo a debugging session once; see CLAUDE.md.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // The display face is bundled from @layera-labs/orbit-brand, so it is 'self'.
  // No Google Fonts, no Fontshare CDN, nothing to leak a visit to.
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  `connect-src 'self' ${API_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nothing here is meant to be embedded. A marketing page in someone else's
  // frame is either a clickjack or a scrape.
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Keeps `next build` from rewriting manifests a running `next dev` is
  // serving — the same split apps/web uses, and for the same reason.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@layera-labs/orbit-brand'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};
