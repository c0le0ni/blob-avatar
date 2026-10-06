import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The app: two pages (English at /, Portuguese at /pt/) sharing one bundle.
export default defineConfig({
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        en: resolve(__dirname, 'index.html'),
        pt: resolve(__dirname, 'pt/index.html'),
      },
    },
  },
  worker: { format: 'es' },
  test: { include: ['test/**/*.test.ts'] },
} as never);
