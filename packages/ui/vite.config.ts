import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    /*
     * TWO entries, because `exports` already promised two. With only
     * `src/index.ts` the build emitted no `dist/themes/index.js`, so
     * `@orbit/ui/themes` resolved to `dist/themes/index.d.ts` — types with no
     * runtime behind them, which typechecks and then fails at import. Exactly
     * the break `packages/react` records for its own `./headless` subpath.
     *
     * Named entries make rollup write `dist/<name>.js`, which is what the
     * `exports` map points at; `fileName` only applies to the single-entry
     * form and is dropped.
     */
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'themes/index': resolve(__dirname, 'src/themes/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@orbit/shared', '@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'] })],
});
