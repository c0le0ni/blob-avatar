// Rewrites the props section of packages/blob-avatar/README.md from the component's
// types (props-table.ts). Run with `npm run readme`.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSection } from './props-table';

const README = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/blob-avatar/README.md');
writeFileSync(README, withSection(readFileSync(README, 'utf8')));
