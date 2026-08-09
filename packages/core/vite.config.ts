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
    /*
     * `@layera-labs/effects`, `modern-gif` and `yjs` were declared dependencies that
     * were not listed here, so they were bundled AND installed. `yjs` is the
     * one that mattered: it carries module-level identity, so a consumer's
     * `Y.Doc` and the one baked into this bundle would have been two unrelated
     * classes with the same name. Regexes, not bare names, so subpaths cannot
     * slip past — see `packages/video-ai/vite.config.ts`.
     */
    rollupOptions: {
      external: [/^@layera-labs\//, /^fabric($|\/)/, /^modern-gif($|\/)/, /^yjs($|\/)/],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'] })],
});
