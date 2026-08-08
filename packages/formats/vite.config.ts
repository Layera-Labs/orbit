import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    // A regex, not the two names: `compose` imports `@orbit/video/browser`, and
    // an exact-match external leaves the subpath bundled.
    rollupOptions: { external: [/^node:/, /^@orbit\//] },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
});
