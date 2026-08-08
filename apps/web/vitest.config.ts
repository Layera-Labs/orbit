import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import root from '../../vitest.config';

/**
 * The repo config plus this app's `@/` alias.
 *
 * `@/*` → `src/*` is declared in `tsconfig.json` and Next resolves it from
 * there, but Vitest does not read `paths` — so a test importing anything that
 * reaches `@/db/idb` failed to resolve while `tsc` was perfectly happy. Merging
 * rather than redeclaring keeps the jsx runtime and the jsdom environment in
 * ONE place; a second copy of those settings is how a test starts passing here
 * and failing in CI.
 */
export default mergeConfig(
  root,
  defineConfig({
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }),
);
