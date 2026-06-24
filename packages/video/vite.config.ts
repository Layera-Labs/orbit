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
    // Node engine — keep Node builtins external; bundle our own modules into
    // one Node-runnable index.js.
    rollupOptions: {
      external: [/^node:/],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
});
