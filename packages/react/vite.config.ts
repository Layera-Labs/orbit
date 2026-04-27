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
      external: ['react', 'react-dom', '@orbit/core', '@orbit/ui', '@orbit/agentic', '@orbit/assets'],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'] })],
});
