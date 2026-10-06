import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The embed: <blob-avatar> as one self-contained script, served at /embed.js.
export default defineConfig({
  publicDir: false,
  build: {
    target: 'es2020',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/embed/blob-avatar.ts'),
      formats: ['iife'],
      name: 'BlobAvatar',
      fileName: () => 'embed.js',
    },
  },
});
