import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const workspacePackageAliases = {
  '@layera-labs/orbit-agentic': resolve(__dirname, '../../packages/agentic/src/index.ts'),
  '@layera-labs/orbit-assets': resolve(__dirname, '../../packages/assets/src/index.ts'),
  '@layera-labs/orbit-core': resolve(__dirname, '../../packages/core/src/index.ts'),
  '@layera-labs/orbit-effects': resolve(__dirname, '../../packages/effects/src/index.ts'),
  '@layera-labs/orbit-react': resolve(__dirname, '../../packages/react/src/index.ts'),
  '@layera-labs/orbit-shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
  '@layera-labs/orbit-ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
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
