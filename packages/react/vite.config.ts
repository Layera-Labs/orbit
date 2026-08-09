import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    /*
     * THREE entries, because the package's `exports` map already promised
     * three. With a single `src/index.ts` entry nothing ever emitted
     * `dist/headless/index.js`, so `@layera-labs/react/headless` resolved to types
     * with no runtime behind them — a pre-existing break, fixed here because
     * `./agentic` needed exactly the same mechanism and shipping a second
     * subpath the build does not produce would have repeated it.
     *
     * Named entries make rollup write `dist/<name>.js`, which is what the
     * `exports` map points at; `fileName` is dropped because it only applies
     * to the single-entry form.
     */
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'agentic/index': resolve(__dirname, 'src/agentic/index.ts'),
        'headless/index': resolve(__dirname, 'src/headless/index.ts'),
      },
      formats: ['es'],
    },
    /*
     * Everything this package DECLARES is external. It used to list only four
     * names, so `@layera-labs/shared`, `@layera-labs/effects`, `jspdf` and `zustand` were
     * bundled into `dist` while ALSO being declared dependencies — a consumer
     * downloaded each twice, and the copies were not the same module. That is
     * merely wasteful for jspdf (2.6MB of it, most of the tarball) and an
     * actual bug for `@layera-labs/shared`, which `@layera-labs/core` imports as a real
     * external: two copies means two sets of module state behind one name.
     *
     * Regexes rather than bare names, for the reason `packages/video-ai`
     * records: an exact-match external matches the specifier STRING, so a
     * subpath import slips past it and drags the whole package in.
     */
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^@layera-labs\//, /^jspdf($|\/)/, /^zustand($|\/)/],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
});
