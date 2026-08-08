import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The automatic runtime, matching Next's own compiler. Components here do not
  // import React — under the classic runtime every one of them throws
  // `React is not defined` the moment a test renders it.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.config.*',
        '**/types/**',
        'apps/**',
        'docs/**',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/index.ts',
      ],
    },
  },
});
