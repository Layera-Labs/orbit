import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      // Three entries: the full package, the browser-safe subset, and the bare
      // types. Web apps import `./browser`; Node keeps importing the default.
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        browser: resolve(__dirname, 'src/browser.ts'),
        types: resolve(__dirname, 'src/types.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^node:/, '@resvg/resvg-js'],
      output: {
        // One output file per source file. With default chunking rollup can
        // hoist a shared helper into a chunk that ALSO carries a node-only
        // module, quietly putting `node:child_process` back into browser.js's
        // import graph. Preserving modules makes that graph provable — which is
        // exactly what `__tests__/browser-safety.test.ts` walks.
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
});
