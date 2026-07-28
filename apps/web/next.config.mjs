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

/** @type {import('next').NextConfig} */
export default {
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
