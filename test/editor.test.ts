import { describe, expect, it } from 'vitest';
import { DEFAULT_CYCLE, DEFAULT_STATE, cloneState, type BlobState } from '../src/engine';
import { toHash } from '../src/engine/codec';
import { ALL, NAME_MAX, NEW, TEMPLATES, addClip, bookFor, duplicateClip, insertClip, parseSaved, removeClip, starts, templateOf, type SavedCycle } from '../src/ui/cycles';
import { createEditor, cyclesOf } from '../src/ui/editor';
import { COALESCE_MS, LIMIT, createHistory, gestureKey, push, redo, undo } from '../src/ui/history';

describe('history', () => {
  it('undoes and redoes, and a new step after an undo drops what was undone', () => {
    let h = createHistory(0);
    h = push(h, 1, null, 0);
    h = push(h, 2, null, 10);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    h = undo(undo(h));
    expect(h.present).toBe(0);
    expect(undo(h)).toBe(h);
    h = push(h, 5, null, 20);
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
    expect([...h.past, h.present]).toEqual([0, 5]);
  });

  it('folds pushes with the same key close together into one step', () => {
    let h = createHistory('a');
    h = push(h, 'b', 'color', 0);
    h = push(h, 'c', 'color', COALESCE_MS - 1);
    h = push(h, 'd', 'color', 2 * COALESCE_MS - 2);
    expect(h.past).toEqual(['a']);
    // a pause, another key, or no key makes a new step
    h = push(h, 'e', 'color', 4 * COALESCE_MS);
    h = push(h, 'f', 'shape', 4 * COALESCE_MS + 1);
    h = push(h, 'g', null, 4 * COALESCE_MS + 2);
    h = push(h, 'h', null, 4 * COALESCE_MS + 3);
    expect(h.past).toEqual(['a', 'd', 'e', 'f', 'g']);
    // an undo breaks the stream: the next push never folds into the step it went back to
    h = push(h, 'i', 'color', 4 * COALESCE_MS + 4);
    h = undo(h);
    h = push(h, 'j', 'color', 4 * COALESCE_MS + 5);
    expect([...h.past, h.present]).toEqual(['a', 'd', 'e', 'f', 'g', 'h', 'j']);
  });

  it('keeps a gesture in one step however long it lasts, and the next gesture apart', () => {
    let h = createHistory(0);
    const drag = gestureKey('resize');
    for (let i = 1; i <= 5; i++) h = push(h, i, drag, i * 10 * COALESCE_MS);
    expect(h.past).toEqual([0]);
    h = push(h, 6, gestureKey('resize'), 50 * COALESCE_MS + 1);
    expect(h.past).toEqual([0, 5]);
  });

  it(`keeps the last ${LIMIT} steps`, () => {
    let h = createHistory(0);
    for (let i = 1; i <= LIMIT + 30; i++) h = push(h, i, null, i);
    expect(h.past.length).toBe(LIMIT);
    expect(h.past[0]).toBe(30);
    for (let i = 0; i < LIMIT + 5; i++) h = undo(h);
    expect(h.present).toBe(30);
  });
});

describe('editor', () => {
  const ids = () => {
    let n = 0;
    return () => `c${++n}`;
  };
  const open = (saved: SavedCycle[] = [], blob: BlobState = cloneState(DEFAULT_STATE)) => createEditor({ blob, book: bookFor(saved, blob.cycle) }, ids());

  it('takes back the look and leaves no step for an edit that changes nothing', () => {
    const e = open();
    const first = e.doc;
    e.edit((s) => (s.shape = 'ghost'));
    e.edit((s) => (s.shape = 'ghost'));
    expect(e.history().past.length).toBe(1);
    e.undo();
    expect(e.doc).toBe(first);
    e.redo();
    expect(e.doc.blob.shape).toBe('ghost');
  });

  it('undoes the cycle the built-in one turned into, together with the avatar', () => {
    const e = open();
    expect(e.doc.book.active).toBe(ALL);
    e.changeCycle((cs) => addClip(cs, 'wink'));
    expect(e.doc.book.active).toBe('c1');
    expect(e.doc.book.saved.map((c) => c.clips.length)).toEqual([DEFAULT_CYCLE.length + 1]);
    expect(e.doc.blob.cycle.length).toBe(DEFAULT_CYCLE.length + 1);
    e.undo();
    expect(e.doc.book).toEqual({ saved: [], active: ALL });
    expect(toHash(e.doc.blob)).toBe(toHash(DEFAULT_STATE));
  });

  it('brings a deleted cycle back with its undo, until something else happens', () => {
    const mine: SavedCycle = { id: 'm', n: 1, clips: [{ anim: 'idle', dur: 2 }, { anim: 'orbit', dur: 3.4 }] };
    const e = open([mine]);
    e.selectCycle('m');
    const cycles = cyclesOf(e, e.doc.book);
    const back = cycles.remove();
    expect(e.doc.book).toEqual({ saved: [], active: ALL });
    expect(e.doc.blob.cycle.map((c) => c.anim)).toEqual(DEFAULT_CYCLE.map((c) => c.anim));
    back();
    expect(e.doc.book).toEqual({ saved: [mine], active: 'm' });
    expect(e.doc.blob.cycle).toEqual(mine.clips);
    // a stale undo button does nothing
    const again = cyclesOf(e, e.doc.book).remove();
    e.edit((s) => (s.color = '#e8483f'));
    again();
    expect(e.doc.book.saved).toEqual([]);
    expect(e.doc.blob.color).toBe('#e8483f');
  });

  it('starts a new cycle and keeps a stretch of edits with one key in one step', () => {
    const e = open();
    e.selectCycle(NEW);
    expect(e.doc.book.saved.length).toBe(1);
    e.changeCycle((cs) => addClip(cs, 'wink'));
    e.changeCycle((cs) => addClip(cs, 'orbit'));
    e.changeCycle((cs) => removeClip(cs, 1));
    expect(e.history().past.length).toBe(4);
    const drag = gestureKey('resize');
    for (const dur of [1, 1.5, 2]) e.changeCycle((cs) => cs.map((c, i) => (i === 0 ? { ...c, dur } : c)), drag);
    expect(e.history().past.length).toBe(5);
    e.undo();
    expect(e.doc.blob.cycle[0].dur).not.toBe(2);
    expect(e.doc.book.saved[0].clips[0].dur).toBe(e.doc.blob.cycle[0].dur);
  });

  it('says when editing a template made a new cycle, and only then', () => {
    const e = open();
    const fresh = e.changeCycle((cs) => insertClip(cs, 1, 'wink'));
    expect(fresh).toMatchObject({ id: 'c1', n: 1 });
    expect(e.doc.book.active).toBe('c1');
    expect(e.changeCycle((cs) => duplicateClip(cs, 0))).toBeNull();
    expect(e.changeCycle((cs) => cs)).toBeNull();
    expect(e.doc.blob.cycle.slice(0, 3).map((c) => c.anim)).toEqual(['idle', 'idle', 'wink']);
    // a template picked again forks into the next number
    e.selectCycle('tpl:hello');
    expect(e.doc.book.active).toBe('tpl:hello');
    expect(e.changeCycle((cs) => removeClip(cs, 0))).toMatchObject({ n: 2 });
  });

  it('renames, copies and deletes cycles, each one an undo step', () => {
    const mine: SavedCycle = { id: 'm', n: 1, clips: [{ anim: 'sleep', dur: 4 }] };
    const e = open([mine]);
    e.renameCycle('m', '  Night   owl ');
    expect(e.doc.book.saved[0].name).toBe('Night owl');
    e.renameCycle('m', ' ');
    expect(e.doc.book.saved[0]).toEqual(mine);
    e.undo();
    expect(e.doc.book.saved[0].name).toBe('Night owl');
    // a copy sits right after what it copies, and goes on screen
    const copy = e.copyCycle('m', 'Night owl copy');
    expect(copy).toMatchObject({ n: 2, name: 'Night owl copy' });
    expect(e.doc.book.saved.map((c) => c.id)).toEqual(['m', copy!.id]);
    expect(e.doc.book.active).toBe(copy!.id);
    expect(e.doc.blob.cycle).toEqual(mine.clips);
    // deleting one that is not on screen leaves the screen alone
    const shown = e.doc.blob;
    e.removeCycle('m');
    expect(e.doc.book.saved.map((c) => c.id)).toEqual([copy!.id]);
    expect(e.doc.blob).toBe(shown);
    e.undo();
    expect(e.doc.book.saved.length).toBe(2);
    // a template can be copied too, and is never deleted
    expect(e.copyCycle('tpl:show')?.clips.length).toBe(templateOf('tpl:show')!.clips.length);
    const before = e.history();
    e.removeCycle('tpl:show');
    e.removeCycle(ALL);
    expect(e.history()).toBe(before);
  });

  it('opens a link on a template before the cycles of the person that match it', () => {
    const hello = templateOf('tpl:hello')!;
    const twin: SavedCycle = { id: 'twin', n: 1, clips: hello.clips.map((c) => ({ ...c })) };
    expect(bookFor([twin], hello.clips).active).toBe('tpl:hello');
    expect(bookFor([twin], DEFAULT_CYCLE).active).toBe(ALL);
    for (const t of TEMPLATES) expect(bookFor([], t.clips)).toEqual({ saved: [], active: t.id });
    // only "every animation" is too long for a light GIF
    for (const t of TEMPLATES) expect(starts(t.clips).length > 10).toBe(t.id === ALL);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('reads cycles saved before they had names, and keeps names well formed', () => {
    const raw = [
      { id: 'a', n: 1, clips: [{ anim: 'idle', dur: 2 }] },
      { id: 'b', n: 2, name: '  My   intro ', clips: [{ anim: 'wink', dur: 1.66 }] },
      { id: 'c', n: 3, name: 42, clips: [{ anim: 'wink', dur: 1 }] },
      { id: 'd', n: 4, name: 'x'.repeat(90), clips: [{ anim: 'wink', dur: 1 }] },
      { id: 'e', n: 5, name: 'Bad', clips: [{ anim: 'nope', dur: 1 }] },
    ];
    const saved = parseSaved(raw);
    expect(saved.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(saved[0]).toEqual({ id: 'a', n: 1, clips: [{ anim: 'idle', dur: 2 }] });
    expect(saved[1]).toEqual({ id: 'b', n: 2, name: 'My intro', clips: [{ anim: 'wink', dur: 1.7 }] });
    expect('name' in saved[2]).toBe(false);
    expect(saved[3].name?.length).toBe(NAME_MAX);
    // and a named one comes back the same from storage
    expect(parseSaved(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('finds the place of an avatar loaded from outside among the cycles', () => {
    const mine: SavedCycle = { id: 'm', n: 1, clips: [{ anim: 'sleep', dur: 4 }] };
    const e = open([mine]);
    e.load({ ...cloneState(DEFAULT_STATE), cycle: [{ anim: 'sleep', dur: 4 }] });
    expect(e.doc.book.active).toBe('m');
    e.load({ ...cloneState(DEFAULT_STATE), cycle: [{ anim: 'comet', dur: 2 }] });
    expect(e.doc.book.saved.length).toBe(2);
    e.undo();
    expect(e.doc.book.saved).toEqual([mine]);
  });
});
