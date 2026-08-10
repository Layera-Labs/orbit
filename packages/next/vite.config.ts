import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

function stripClientDirective() {
  return {
    name: 'strip-client-directive',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (id.endsWith('src/OrbitEditor.tsx')) {
        return {
          code: code.replace(/^['"]use client['"];\s*/, ''),
          map: {
            version: 3,
            mappings: '',
            names: [],
            sources: [id],
            sourcesContent: [code],
          },
        };
      }
    },
  };
}

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^next(\/.*)?$/, '@layera-labs/orbit-react'],
      output: {
        banner: "'use client';",
      },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('"use client"')) {
          return;
        }

        warn(warning);
      },
    },
    sourcemap: true,
  },
  plugins: [stripClientDirective(), dts({ include: ['src'] })],
});
