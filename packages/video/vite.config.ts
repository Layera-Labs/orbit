import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      /*
       * One entry per subpath in `package.json#exports`, and they have to stay
       * in step. `node` is here because it stopped being reachable from any
       * other entry the moment `index.ts` became browser-only: rollup emitted
       * nothing for it, `vite-plugin-dts` still emitted `node.d.ts` from the
       * source, and so `@layera-labs/video/node` TYPECHECKED while resolving to a
       * file that did not exist. A missing runtime with a present type is the
       * worst shape this failure can take.
       */
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        browser: resolve(__dirname, 'src/browser.ts'),
        node: resolve(__dirname, 'src/node.ts'),
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
