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
        '@layera-labs/model',
        '@layera-labs/render',
        '@layera-labs/providers',
        'konva',
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-konva',
        'valtio',
        'valtio/vanilla',
        'framer-motion',
        // Declared, but not listed, so jspdf and html2canvas were bundled into
        // dist as well as installed: 3.9MB of package, most of it a second copy
        // of a dependency the consumer already has.
        /^jspdf($|\/)/,
      ],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'] })],
});
