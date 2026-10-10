import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The app: two pages (English at /, Portuguese at /pt/) sharing one bundle. It
// imports the blob-avatar package from its source, so the site always runs exactly
// what gets published.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: /^blob-avatar\/(.*)$/, replacement: `${resolve(import.meta.dirname, 'packages/blob-avatar/src')}/$1` }],
  },
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        en: resolve(import.meta.dirname, 'index.html'),
        pt: resolve(import.meta.dirname, 'pt/index.html'),
      },
    },
  },
  worker: { format: 'es' },
  test: { include: ['test/**/*.test.ts'] },
} as never);
