import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const workspacePackageAliases = {
  '@orbit/agentic': resolve(__dirname, '../../packages/agentic/src/index.ts'),
  '@orbit/assets': resolve(__dirname, '../../packages/assets/src/index.ts'),
  '@orbit/core': resolve(__dirname, '../../packages/core/src/index.ts'),
  '@orbit/effects': resolve(__dirname, '../../packages/effects/src/index.ts'),
  '@orbit/react': resolve(__dirname, '../../packages/react/src/index.ts'),
  '@orbit/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
  '@orbit/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  resolve: {
    alias: {
      ...workspacePackageAliases,
      '@': resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: Object.keys(workspacePackageAliases),
  },
});
