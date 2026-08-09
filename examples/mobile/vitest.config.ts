import { defineConfig } from 'vitest/config';

/**
 * Only `src/orbit/` is tested, and deliberately so.
 *
 * The timeline arithmetic is plain data in and plain data out, so it can be
 * proven at a terminal in milliseconds. The screens are React Native and would
 * need a renderer, a mock for every Expo module and a simulator to say
 * anything — which is a lot of machinery for an example whose screens are meant
 * to be read rather than depended on.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['src/orbit/__tests__/**/*.test.ts'],
  },
});
