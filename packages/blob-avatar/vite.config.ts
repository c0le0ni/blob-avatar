import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The published package: ES modules, React left to the app that installs it. The
// component's entry is marked 'use client', for frameworks with server components;
// the element's entry registers <blob-avatar>.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: { index: resolve(import.meta.dirname, 'src/index.ts'), element: resolve(import.meta.dirname, 'src/element.ts') },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: { banner: (chunk: { name: string }) => (chunk.name === 'index' ? "'use client';" : '') },
    },
  },
});
