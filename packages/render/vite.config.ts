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
      external: [
        '@layera-labs/orbit-model',
        'konva',
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-konva',
        'valtio',
        'valtio/vanilla',
      ],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/__tests__'] })],
});
