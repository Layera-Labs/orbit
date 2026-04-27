import { defineConfig } from 'vitest/config';

export default defineConfig({
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
