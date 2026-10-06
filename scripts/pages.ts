// Writes index.html (English) and pt/index.html (Portuguese) from one template.
// Run with `npm run pages` (the build runs it too). The output is committed so the
// dev server works right after a clone.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_STATE } from '../src/engine';
import { page } from '../src/app/markup';
import { STRINGS } from '../src/i18n/strings';
import { markSvg, stripSvg, wordmarkSvg } from '../src/brand';

/** one page for both languages: nginx serves it for any missing path */
function notFound() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Not found · Blob Avatar</title>
    <meta name="robots" content="noindex" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      @font-face { font-family: 'Geist'; src: url('/fonts/geist-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0a0a0a; color: #f5f5f5; font: 400 1rem/1.5 'Geist', system-ui, sans-serif; text-align: center; padding: 24px; box-sizing: border-box; }
      main { display: grid; gap: 18px; justify-items: center; }
      h1 { margin: 8px 0 0; font-size: 2rem; letter-spacing: -0.03em; font-weight: 600; }
      p { margin: 0; color: #a0a0a0; }
      nav { display: flex; gap: 10px; margin-top: 8px; }
      a { color: #0a0a0a; background: #aefa0e; text-decoration: none; font-weight: 600; padding: 10px 16px; border-radius: 8px; }
      a + a { color: #f5f5f5; background: #151515; border: 1px solid rgba(255, 255, 255, 0.16); }
    </style>
  </head>
  <body>
    <main>
      ${wordmarkSvg({ height: 48 })}
      <h1>This page does not exist.</h1>
      <p lang="pt-BR">Esta página não existe.</p>
      <nav><a href="/">Make your blob</a><a href="/pt/" lang="pt-BR">Criar meu blob</a></nav>
    </main>
  </body>
</html>
`;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = [
  ['index.html', page(DEFAULT_STATE, STRINGS.en, STRINGS.pt)],
  ['pt/index.html', page(DEFAULT_STATE, STRINGS.pt, STRINGS.en)],
  // the logo as files, for coleoni.com, the README and social images
  ['public/brand/blob.svg', wordmarkSvg({ height: 64 })],
  ['public/brand/blob-dark.svg', wordmarkSvg({ height: 64, letters: '#161616' })],
  ['public/brand/mark.svg', markSvg()],
  ['public/brand/strip.svg', stripSvg()],
  ['public/404.html', notFound()],
] as const;

for (const [file, html] of out) {
  const path = resolve(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
  console.log(`${file}  ${(html.length / 1024).toFixed(1)} KB`);
}
