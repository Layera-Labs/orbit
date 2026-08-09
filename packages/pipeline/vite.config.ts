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
    rollupOptions: {
      external: [/^node:/, /^@layera-labs\//],
    },
    sourcemap: true,
  },
  // The spike runner is a script, not part of the library surface.
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__', 'src/spike'] })],
});
