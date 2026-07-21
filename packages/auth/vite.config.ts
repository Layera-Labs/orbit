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
    sourcemap: true,
    // Keep `jose` and Node built-ins external — they're resolved at runtime, not
    // bundled into the library output.
    rollupOptions: {
      external: [/^node:/, 'jose'],
    },
  },
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
});
