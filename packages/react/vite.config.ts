import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    /*
     * THREE entries, because the package's `exports` map already promised
     * three. With a single `src/index.ts` entry nothing ever emitted
     * `dist/headless/index.js`, so `@orbit/react/headless` resolved to types
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
    rollupOptions: {
      external: ['react', 'react-dom', '@orbit/core', '@orbit/ui', '@orbit/agentic', '@orbit/assets'],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'] })],
});
