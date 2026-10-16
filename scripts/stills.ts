// Still pictures of blobs, one SVG each, for pages that show live blobs and need a
// picture in their place (coleoni.com's screen recordings, see its BlobLineup):
//   npx vite-node scripts/stills.ts <out dir> <name>=<hash> [<name>=<hash> ...]
// The hash is the editor's (shape=..&color=..&expr=..&seed=..); each blob is drawn
// at rest, as the SVG export draws it, with no background.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { frame } from 'blob-avatar/engine';
import { fromHash } from 'blob-avatar/engine/codec';
import { toSvgString } from 'blob-avatar/render/svg';

const [out, ...pairs] = process.argv.slice(2);
if (!out || !pairs.length) throw new Error('usage: stills.ts <out dir> <name>=<hash> ...');
mkdirSync(out, { recursive: true });
for (const pair of pairs) {
  const at = pair.indexOf('=');
  const name = pair.slice(0, at);
  const svg = toSvgString(frame(fromHash(pair.slice(at + 1)), 0, { still: true }), { size: 160, bg: null, round: false });
  writeFileSync(join(out, `${name}.svg`), svg);
  console.log(`${name}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
}
