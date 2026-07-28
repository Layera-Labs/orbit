import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const workspacePackageAliases = {
  '@orbit/editor': resolve(__dirname, '../../packages/editor/src/index.ts'),
  '@orbit/model': resolve(__dirname, '../../packages/model/src/index.ts'),
  '@orbit/providers': resolve(__dirname, '../../packages/providers/src/index.ts'),
  '@orbit/render': resolve(__dirname, '../../packages/render/src/index.ts'),
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
  },
  resolve: {
    alias: {
      ...workspacePackageAliases,
      '@': resolve(__dirname, './src'),
    },
    // Ensure a single React instance across aliased package sources.
    dedupe: ['react', 'react-dom', 'react-konva', 'konva', 'valtio', 'framer-motion'],
  },
  optimizeDeps: {
    include: ['jspdf', 'framer-motion'],
    exclude: Object.keys(workspacePackageAliases),
  },
});
