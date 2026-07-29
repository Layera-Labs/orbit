import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Resolve a package's DIRECTORY, not its entry file.
 *
 * A webpack alias is a prefix rule: aliasing `konva` to `…/konva/lib/index.js`
 * would make `konva/lib/Core` resolve underneath that file. Point at the
 * directory so every subpath keeps working.
 */
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

/**
 * Deduped in the CLIENT bundle only.
 *
 * `packages/editor` and `packages/render` carry konva/react-konva in
 * devDependencies so their own builds work, which under pnpm creates real
 * directories that can win resolution and give us two Konva instances.
 * `apps/studio/vite.config.ts` solves the same problem with Vite's `dedupe`.
 *
 * `react` and `react-dom` are deliberately NOT in this list. Next resolves them
 * through export conditions the app must not override — the server needs the
 * `react-server` build (the one with `React.cache`), and on the client an alias
 * that bypasses the exports map hands Next's runtime a different React instance
 * than the app's, which kills hydration and leaves an empty document. pnpm
 * already gives this app exactly one react@18.3.1; verify with `pnpm why react`.
 */
const CLIENT_SINGLETONS = ['konva', 'react-konva', 'valtio'];

/**
 * The render service's origin, which the browser talks to DIRECTLY for upload,
 * render and the finished file — those three are not proxied, so a policy that
 * only allowed 'self' would break export.
 */
const RENDER_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_ORBIT_RENDER_URL ?? 'http://localhost:8787').origin;
  } catch {
    return 'http://localhost:8787';
  }
})();

/**
 * Security headers. There were none at all before this.
 *
 * On `script-src` this is deliberately honest about what it is. Next's App
 * Router emits its own inline hydration scripts on every page and their content
 * varies per route, so they cannot be hashed; the strict form needs a per-request
 * nonce from middleware, which makes every page dynamic. That trade is not worth
 * taking here YET, because the thing a nonce defends against — attacker HTML
 * reaching the DOM — has no route into this app: all three `dangerouslySetInnerHTML`
 * sites render static module constants, and everything a user types goes through
 * React as text. If that ever stops being true, the nonce is the fix, and this
 * comment is the reason it was not done first.
 *
 * What IS bought here is real and not weakened by `unsafe-inline`: no external
 * script or connection origin, no plugins, no `<base>` rewrite, no framing, and
 * forms that cannot post off-site.
 */
/*
 * `next dev` evaluates its client chunks and HMR payloads with eval, so a CSP
 * without `unsafe-eval` blocks every one of them. The failure is quiet and very
 * easy to misread: the server-rendered HTML still arrives and the page LOOKS
 * fine, but React never hydrates, so no effect runs, no data loads, and the
 * editor sits on its empty loading frame forever. It cost a real debugging
 * detour here. A production build does not use eval and does not get this.
 */
const DEV = process.env.NODE_ENV !== 'production';

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ''}`,
  // CSS Modules are external files, but React style props are inline attributes.
  "style-src 'self' 'unsafe-inline'",
  // blob: is the editor's own media (IndexedDB objects, canvas exports); data:
  // is the rasterized marks.
  `img-src 'self' blob: data: ${RENDER_ORIGIN}`,
  `media-src 'self' blob: data: ${RENDER_ORIGIN}`,
  "font-src 'self' data:",
  `connect-src 'self' blob: data: ${RENDER_ORIGIN}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Clickjacking. The embeddable product is the SDK, not this app, so nothing
  // legitimate frames it. `X-Frame-Options` repeats this for older browsers.
  "frame-ancestors 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  // Stops a response being re-interpreted as a type it did not declare.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Project names and ids live in the path; a full URL should not travel to
  // another origin in a Referer header.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here uses any of them, so nothing should be able to ask.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
];

/** @type {import('next').NextConfig} */
export default {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },

  /**
   * `next dev` and `next build` must not share an output directory.
   *
   * They do by default, so running `pnpm build` at the repo root while a dev
   * server is up rewrites the manifests the dev server is serving from. The
   * symptom is baffling: stylesheet URLs start 404-ing, React fails to hydrate
   * against the half-written HTML, and the page renders as a blank document. The
   * dev script sets NEXT_DIST_DIR so the two can never collide.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // NOT laziness: StrictMode's dev double-mount races Konva/ResizeObserver
  // imperative setup (zoom-to-fit). apps/studio/src/main.tsx omits it for the
  // same reason.
  reactStrictMode: false,
  transpilePackages: [
    '@orbit/editor',
    '@orbit/render',
    '@orbit/model',
    '@orbit/providers',
    '@orbit/video',
  ],
  webpack(config, { isServer }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...(isServer
        ? {}
        : Object.fromEntries(CLIENT_SINGLETONS.map((m) => [m, pkgDir(m)]))),
      // Konva ships a Node build that binds the native `canvas` addon, and
      // webpack walks it while building the server graph even though the editor
      // is `dynamic(ssr:false)` and never renders there. Nothing on the server
      // draws to a Konva stage, so stub it.
      canvas: false,
    };
    return config;
  },
};
