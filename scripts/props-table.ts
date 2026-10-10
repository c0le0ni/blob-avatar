// The props section of packages/blob-avatar/README.md, written from the component's
// own types: each prop of BlobAvatarProps (react.tsx) with its type, its @default
// and its doc comment, then the types it names. `npm run readme` puts it in the
// README (scripts/readme.ts), and a test keeps the two in step.

import ts from 'typescript';
import { ANIMS, DEFAULT_DUR, EXPRESSIONS, SHAPES } from 'blob-avatar/engine';
import react from '../packages/blob-avatar/src/react.tsx?raw';
import state from '../packages/blob-avatar/src/engine/state.ts?raw';

const START = '<!-- props:start -->';
const END = '<!-- props:end -->';

const cell = (s: string) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|');
/** a code span in a table cell, which may hold backticks itself */
const code = (s: string) => (s.includes('`') ? `\`\` ${cell(s)} \`\`` : `\`${cell(s)}\``);
const sentence = (s: string) => cell(s.charAt(0).toUpperCase() + s.slice(1));

function declared(source: string, name: string) {
  const file = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const it = file.statements.find((n): n is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(n) && n.name.text === name);
  if (!it) throw new Error(`no interface ${name}`);
  return { file, it };
}

function rows(): string[] {
  const { file, it: props } = declared(react, 'BlobAvatarProps');
  return props.members.filter(ts.isPropertySignature).map((m) => {
    const doc = ts.getJSDocCommentsAndTags(m).find(ts.isJSDoc);
    const tag = ts.getJSDocTags(m).find((t) => t.tagName.text === 'default');
    const def = ts.getTextOfJSDocComment(tag?.comment) ?? '';
    return `| \`${m.name.getText(file)}\` | ${code(m.type!.getText(file))} | ${/^("|\d|true$|false$)/.test(def) ? code(def) : cell(def)} | ${sentence(ts.getTextOfJSDocComment(doc?.comment) ?? '')} |`;
  });
}

const list = (xs: readonly string[]) => xs.map((x) => `\`${x}\``).join(' ');

/** an interface written on one line: { anim: Anim; dur: number; } */
function shape(source: string, name: string) {
  const { file, it } = declared(source, name);
  return `{ ${it.members.map((m) => m.getText(file)).join(' ')} }`;
}

/** the section between the markers, markers included */
export function propsSection(): string {
  return [
    START,
    '',
    '| Prop | Type | Default | |',
    '| --- | --- | --- | --- |',
    ...rows(),
    '| any other | | | `className`, `style`, `aria-label` (by default "Blob avatar"), `tabIndex`, event handlers and the rest go to the outer `<span>` |',
    '',
    '| Type | |',
    '| --- | --- |',
    `| \`Shape\` | ${list(SHAPES)} |`,
    `| \`Expression\` | ${list(EXPRESSIONS)} |`,
    `| \`Anim\` | ${ANIMS.map((a) => `\`${a}\` ${DEFAULT_DUR[a]} s`).join(', ')} |`,
    `| \`Clip\` | ${code(shape(state, 'Clip'))}, \`dur\` in seconds |`,
    '',
    END,
  ].join('\n');
}

export function withSection(readme: string): string {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error(`the README needs ${START} and ${END}`);
  return readme.slice(0, a) + propsSection() + readme.slice(b + END.length);
}
