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
      // `clsx` and `tailwind-merge` are declared dependencies and were being
      // bundled anyway, so every consumer shipped two copies of each.
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^next($|\/)/, /^clsx($|\/)/, /^tailwind-merge($|\/)/],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
});
