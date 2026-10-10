import { describe, expect, it } from 'vitest';
import { DEFAULT_DUR, DEFAULT_STATE, MAX_CLIPS, cloneState, type Clip } from '../src/engine';
import { hexToHsv, hsvToHex, normalizeHex } from '../src/ui/color';
import { addClip, clampDur, duplicateClip, insertClip, moveClip, removeClip, resizeClip, sameClips, starts } from '../src/ui/cycles';
import { FULL_VIEW, animThumb, embedCode } from '../src/ui/site';

describe('color picker', () => {
  it('reads typed colors in every usual spelling and refuses the rest', () => {
    expect(normalizeHex('#AEFA0E')).toBe('#aefa0e');
    expect(normalizeHex('aefa0e')).toBe('#aefa0e');
    expect(normalizeHex(' f80 ')).toBe('#ff8800');
    for (const bad of ['', '#12', '#12345', 'red', '#ggg', '#1234567', 'url(x)']) expect(normalizeHex(bad)).toBeNull();
  });

  it('round-trips every color through hue, saturation and value', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const hex = `#${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`;
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
  });
});

describe('cycle editing', () => {
  const clips: Clip[] = [
    { anim: 'idle', dur: 2.4 },
    { anim: 'wink', dur: 1.6 },
    { anim: 'orbit', dur: 3.4 },
  ];

  it('moves a clip to any place and leaves bad moves alone', () => {
    expect(moveClip(clips, 0, 2).map((c) => c.anim)).toEqual(['wink', 'orbit', 'idle']);
    expect(moveClip(clips, 2, 0).map((c) => c.anim)).toEqual(['orbit', 'idle', 'wink']);
    expect(moveClip(clips, 1, 1)).toBe(clips);
    expect(moveClip(clips, 0, 9)).toBe(clips);
    expect(clips.map((c) => c.anim)).toEqual(['idle', 'wink', 'orbit']);
  });

  it('keeps lengths between 0.4 and 10 seconds, in tenths', () => {
    expect(resizeClip(clips, 1, 0.01)[1].dur).toBe(0.4);
    expect(resizeClip(clips, 1, 99)[1].dur).toBe(10);
    expect(resizeClip(clips, 1, 2.345)[1].dur).toBe(2.3);
    expect(resizeClip(clips, 1, 1.6)).toBe(clips);
    expect(clampDur(Number.NaN)).toBeNaN();
  });

  it('never empties a cycle and never grows past the limit', () => {
    let one: Clip[] = [{ anim: 'idle', dur: 2 }];
    expect(removeClip(one, 0)).toBe(one);
    expect(removeClip(clips, 1).map((c) => c.anim)).toEqual(['idle', 'orbit']);
    for (let i = 0; i < MAX_CLIPS + 5; i++) one = addClip(one, 'wink');
    expect(one.length).toBe(MAX_CLIPS);
  });

  it('inserts an animation at its usual length at any place, and never past the limit', () => {
    expect(insertClip(clips, 1, 'comet').map((c) => c.anim)).toEqual(['idle', 'comet', 'wink', 'orbit']);
    expect(insertClip(clips, 1, 'comet')[1].dur).toBe(DEFAULT_DUR.comet);
    expect(insertClip(clips, 0, 'sleep')[0].anim).toBe('sleep');
    expect(insertClip(clips, 3, 'sleep')[3].anim).toBe('sleep');
    // a place out of range lands at the nearest end
    expect(insertClip(clips, 99, 'sleep')[3].anim).toBe('sleep');
    expect(insertClip(clips, -4, 'sleep')[0].anim).toBe('sleep');
    expect(addClip(clips, 'egg').at(-1)?.anim).toBe('egg');
    const full = Array.from({ length: MAX_CLIPS }, (): Clip => ({ anim: 'idle', dur: 1 }));
    expect(insertClip(full, 2, 'wink')).toBe(full);
    expect(clips.length).toBe(3);
  });

  it('duplicates a clip right after itself, with its length', () => {
    const resized = resizeClip(clips, 1, 3.1);
    const twice = duplicateClip(resized, 1);
    expect(twice.map((c) => c.anim)).toEqual(['idle', 'wink', 'wink', 'orbit']);
    expect(twice[2]).toEqual({ anim: 'wink', dur: 3.1 });
    expect(twice[2]).not.toBe(twice[1]);
    expect(duplicateClip(clips, 7)).toBe(clips);
    const full = Array.from({ length: MAX_CLIPS }, (): Clip => ({ anim: 'idle', dur: 1 }));
    expect(duplicateClip(full, 0)).toBe(full);
  });

  it('knows where each clip starts', () => {
    expect(starts(clips)).toEqual({ at: [0, 2.4, 4], length: 7.4 });
    expect(sameClips(clips, clips.map((c) => ({ ...c })))).toBe(true);
    expect(sameClips(clips, moveClip(clips, 0, 1))).toBe(false);
  });
});

describe('thumbnails', () => {
  it('zoom in on a small figure and frame the whole blob otherwise', () => {
    const s = cloneState(DEFAULT_STATE);
    expect(animThumb(s, 'idle').view).toBe(FULL_VIEW);
    expect(animThumb(s, 'orbit').view).toBe(FULL_VIEW);
    const side = Number(animThumb(s, 'sleep').view.split(' ')[2]);
    expect(side).toBeLessThan(Number(FULL_VIEW.split(' ')[2]) / 2);
    expect(animThumb(s, 'sleep').svg).not.toMatch(/NaN|Infinity/);
  });
});

describe('embed code', () => {
  it('loads /v2/embed.js, and asks for gaze only when following the cursor is on', () => {
    const s = cloneState(DEFAULT_STATE);
    const off = embedCode(s);
    expect(off).toContain('<script src="https://blob.coleoni.com/v2/embed.js" defer></script>');
    expect(off).not.toMatch(/\bgaze\b/);
    expect(embedCode(s, { gaze: false })).toBe(off);
    const on = embedCode(s, { gaze: true });
    expect(on.endsWith(' size="160" gaze></blob-avatar>')).toBe(true);
    expect(on.replace(' gaze', '')).toBe(off);
  });
});
