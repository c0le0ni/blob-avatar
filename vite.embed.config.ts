import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// The embed: <blob-avatar> as one self-contained script. Snippets load it from
// /v2/embed.js, which stays on this major version; /embed.js is the same file and
// always serves the latest one.
const MAJOR = 'v2';

const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string };
if (`v${version.split('.')[0]}` !== MAJOR) {
  throw new Error(`package.json says ${version}, but the embed ships as /${MAJOR}/embed.js. Keep a ${MAJOR} build at that path, then add the new major.`);
}

/** the same file again under its major version */
function versioned(): Plugin {
  return {
    name: 'blob-avatar:versioned',
    writeBundle({ dir }) {
      const out = dir ?? resolve(import.meta.dirname, 'dist');
      mkdirSync(resolve(out, MAJOR), { recursive: true });
      copyFileSync(resolve(out, 'embed.js'), resolve(out, MAJOR, 'embed.js'));
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [versioned()],
  build: {
    target: 'es2020',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'packages/blob-avatar/src/element.ts'),
      formats: ['iife'],
      name: 'BlobAvatar',
      fileName: () => 'embed.js',
    },
  },
});
