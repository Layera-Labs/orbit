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
    // Regexes, not the bare names: `agent` imports `@orbit/video/node`, and an
    // exact-match external matches the specifier STRING, so the subpath slips
    // past it and gets bundled — dragging the whole node entry, and with it
    // `@resvg/resvg-js`, into a build that resolves for the browser. Same fix,
    // and same reason, as `packages/formats` and `packages/pipeline`.
    rollupOptions: {
      external: [/^node:/, /^@orbit\//, /^@google\/genai(\/|$)/],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
});
