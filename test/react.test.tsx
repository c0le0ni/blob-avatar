import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BlobAvatar, type BlobState } from 'blob-avatar';
import { DEFAULT_CYCLE, DEFAULT_DUR, DEFAULT_STATE, SHAPES, EXPRESSIONS } from 'blob-avatar/engine';
import { toHash } from 'blob-avatar/engine/codec';
import { stateOf } from 'blob-avatar/react';

describe('the React component', () => {
  it('renders the blob as SVG markup on the server', () => {
    const html = renderToString(<BlobAvatar />);
    expect(html).toMatch(/^<span role="img" aria-label="Blob avatar" style="[^"]*width:160px;height:160px/);
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(html).toMatch(/<path d="M[-\d]/);
    expect(html).toContain(`fill="${DEFAULT_STATE.color}"`);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('draws every shape and expression, moving or held still, without a NaN', () => {
    for (const shape of SHAPES) {
      for (const expression of EXPRESSIONS) {
        for (const paused of [false, true]) {
          const html = renderToString(<BlobAvatar shape={shape} expression={expression} color="#3b93f0" paused={paused} />);
          expect(html).toMatch(/<path d="M[-\d]/);
          expect(html).not.toContain('NaN');
        }
      }
    }
  });

  it('takes a size, a label, a class, a style and any span attribute', () => {
    const html = renderToString(<BlobAvatar size="4rem" aria-label="Michel" className="me" style={{ margin: 4 }} tabIndex={0} data-x="1" />);
    expect(html).toContain('width:4rem;height:4rem');
    expect(html).toContain('margin:4px');
    expect(html).toContain('aria-label="Michel"');
    expect(html).toContain('class="me"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-x="1"');
    expect(renderToString(<BlobAvatar size={48} />)).toContain('width:48px;height:48px');
    expect(renderToString(<BlobAvatar aria-labelledby="who" />)).not.toContain('aria-label=');
  });

  it('shows it can be clicked only when it reacts', () => {
    expect(renderToString(<BlobAvatar reaction />)).toContain('cursor:pointer');
    expect(renderToString(<BlobAvatar reaction="exclaim.1.2" />)).toContain('cursor:pointer');
    expect(renderToString(<BlobAvatar />)).not.toContain('cursor');
  });

  it('gives each avatar its own ids, so two on a page never share a gradient', () => {
    const html = renderToString(
      <>
        <BlobAvatar animation="comet" />
        <BlobAvatar animation="comet" />
      </>,
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never lets a bad value into the markup', () => {
    const bad = { color: '"/><script>alert(1)</script>', shape: 'x" onload="y' } as never;
    const html = renderToString(<BlobAvatar {...(bad as object)} state={{ ...DEFAULT_STATE, color: '"><img>' } as BlobState} />);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onload');
    expect(html).toContain(`fill="${DEFAULT_STATE.color}"`);
  });
});

describe('props to state', () => {
  it('starts from the default blob', () => {
    expect(stateOf({})).toEqual(DEFAULT_STATE);
  });

  it('reads the props the way the element reads its attributes', () => {
    const s = stateOf({ shape: 'heart', color: 'E8483F', expression: 'smug', animation: 'idle.2.4,wink', seed: 'zz' });
    expect(s.shape).toBe('heart');
    expect(s.color).toBe('#e8483f');
    expect(s.expression).toBe('smug');
    expect(s.cycle).toEqual([{ anim: 'idle', dur: 2.4 }, { anim: 'wink', dur: DEFAULT_DUR.wink }]);
    expect(s.seed).toBe(parseInt('zz', 36));
  });

  it('takes the cycle as a list of clips, checked like the string', () => {
    expect(stateOf({ animation: [{ anim: 'orbit', dur: 2 }, { anim: 'nope' as never, dur: 1 }, { anim: 'wink', dur: 99 }] }).cycle).toEqual([
      { anim: 'orbit', dur: 2 },
      { anim: 'wink', dur: 10 },
    ]);
    expect(stateOf({ animation: [] }).cycle).toEqual(DEFAULT_CYCLE);
  });

  it('takes the seed as a number or as the link writes it', () => {
    expect(stateOf({ seed: 1234 }).seed).toBe(1234);
    expect(stateOf({ seed: 7.9 }).seed).toBe(7);
    for (const bad of [-1, Number.NaN, Infinity, 36 ** 6, 'TOO-LONG!']) expect(stateOf({ seed: bad }).seed).toBe(DEFAULT_STATE.seed);
  });

  it('ignores what is not on the lists, and keeps what was there', () => {
    const s = stateOf({ shape: 'blob' as never, color: 'red', expression: 'meh' as never, animation: 'dance', state: 'shape=star&color=8b5cf6&expr=happy' });
    expect([s.shape, s.color, s.expression]).toEqual(['star', '#8b5cf6', 'happy']);
    expect(s.cycle).toEqual(DEFAULT_CYCLE);
  });

  it('lets the props override a state, given as a link hash or as an object', () => {
    const base: BlobState = { ...DEFAULT_STATE, shape: 'ghost', color: '#2fbfa0', expression: 'sleepy', cycle: [{ anim: 'sleep', dur: 3 }], seed: 42 };
    expect(stateOf({ state: base })).toEqual(base);
    expect(stateOf({ state: `#${toHash(base)}` })).toEqual(base);
    expect(stateOf({ state: base, shape: 'star', seed: 5 })).toEqual({ ...base, shape: 'star', seed: 5 });
    expect(stateOf({ state: { ...base, color: 'nope', shape: 'x' as never } })).toEqual({ ...base, color: DEFAULT_STATE.color, shape: DEFAULT_STATE.shape });
  });
});
