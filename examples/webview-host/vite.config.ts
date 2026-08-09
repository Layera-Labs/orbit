import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

// Alias workspace packages to their source so the host bundles the live v2 code.
const workspacePackageAliases = {
  '@layera-labs/editor': resolve(__dirname, '../../packages/editor/src/index.ts'),
  '@layera-labs/model': resolve(__dirname, '../../packages/model/src/index.ts'),
  '@layera-labs/providers': resolve(__dirname, '../../packages/providers/src/index.ts'),
  '@layera-labs/render': resolve(__dirname, '../../packages/render/src/index.ts'),
  '@layera-labs/react-native': resolve(__dirname, '../../packages/react-native/src/index.ts'),
};

export default defineConfig({
  // viteSingleFile inlines all JS/CSS into one HTML so the RN WebView can load
  // it offline from a bundled asset.
  plugins: [react(), viteSingleFile()],
  server: {
    port: 5176,
  },
  resolve: {
    alias: {
      ...workspacePackageAliases,
      '@': resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react-konva', 'konva', 'valtio', 'framer-motion'],
  },
  optimizeDeps: {
    include: ['jspdf', 'framer-motion'],
    exclude: Object.keys(workspacePackageAliases),
  },
});
