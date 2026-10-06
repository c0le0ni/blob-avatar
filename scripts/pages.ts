// Writes index.html (English) and pt/index.html (Portuguese) from one template.
// Run with `npm run pages` (the build runs it too). The output is committed so the
// dev server works right after a clone.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_STATE } from '../src/engine';
import { page } from '../src/app/markup';
import { STRINGS } from '../src/i18n/strings';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = [
  ['index.html', page(DEFAULT_STATE, STRINGS.en, STRINGS.pt)],
  ['pt/index.html', page(DEFAULT_STATE, STRINGS.pt, STRINGS.en)],
] as const;

for (const [file, html] of out) {
  const path = resolve(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
  console.log(`${file}  ${(html.length / 1024).toFixed(1)} KB`);
}
