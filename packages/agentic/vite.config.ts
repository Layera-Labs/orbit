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
      external: ['@layera-labs/orbit-shared'],
    },
    sourcemap: true,
  },
  plugins: [
    // Tests are source, not surface: without the exclude the dts plugin emits a
    // .d.ts for every file under src/__tests__ and the tarball ships them.
    dts({ include: ['src'], exclude: ['src/__tests__'] }),
  ],
});
