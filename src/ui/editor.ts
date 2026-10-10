// The editor's state: the avatar and the person's cycles, in one store with undo
// and redo, so an undo puts both back together (a deleted cycle comes back with
// the avatar that showed it). The avatar is kept in the address bar, so the page
// is always a link to it, and the cycles on this device.

import { useSyncExternalStore } from 'react';
import { cloneState, DEFAULT_STATE, type BlobState, type Clip } from 'blob-avatar/engine';
import { fromHash, toHash } from 'blob-avatar/engine/codec';
import { bookFor, copyCycle, dropCycle, parseSaved, pickCycle, renameCycle, sameClips, uid, withClips, type Book, type SavedCycle } from './cycles';
import { createHistory, push, redo, undo, type History } from './history';

export interface Doc {
  blob: BlobState;
  book: Book;
}

/** change the avatar; edits with the same key in a stream make one undo step (see history.ts) */
export type Edit = (f: (s: BlobState) => void, key?: string) => void;

export function createEditor(initial: Doc, newId: () => string = uid, now = () => Date.now()) {
  let h: History<Doc> = createHistory(initial);
  const listeners = new Set<() => void>();

  const commit = (next: History<Doc>) => {
    if (next === h) return;
    h = next;
    listeners.forEach((f) => f());
  };
  const put = (doc: Doc, key?: string) => commit(push(h, doc, key ?? null, now()));

  /** a cycle on screen, and the book that knows which one it is */
  const show = (book: Book, clips: Clip[], key?: string) => {
    const { blob, book: was } = h.present;
    if (book.active === was.active && book.saved === was.saved && sameClips(clips, blob.cycle)) return;
    const next = cloneState(blob);
    next.cycle = clips.map((c) => ({ ...c }));
    put({ blob: next, book }, key);
  };

  const edit: Edit = (f, key) => {
    const blob = cloneState(h.present.blob);
    f(blob);
    if (toHash(blob) !== toHash(h.present.blob)) put({ ...h.present, blob }, key);
  };

  return {
    subscribe(f: () => void) {
      listeners.add(f);
      return () => void listeners.delete(f);
    },
    /** the whole history, a new value on every change (what React subscribes to) */
    history: () => h,
    get doc() {
      return h.present;
    },
    edit,
    /**
     * change the cycle on screen; a template turns into a new cycle of the person's,
     * which comes back (so the page can say so), and null otherwise
     */
    changeCycle(f: (clips: Clip[]) => Clip[], key?: string): SavedCycle | null {
      const clips = h.present.blob.cycle;
      const next = f(clips);
      if (next === clips) return null;
      const was = h.present.book;
      const book = withClips(was, next, newId);
      show(book, next, key);
      return book.active === was.active ? null : (book.saved.find((c) => c.id === book.active) ?? null);
    },
    selectCycle(id: string) {
      const hit = pickCycle(h.present.book, id, newId);
      if (hit) show(hit.book, hit.clips);
    },
    /** delete one of the person's cycles (the one on screen by default) */
    removeCycle(id?: string) {
      const { book, clips } = dropCycle(h.present.book, id);
      if (book === h.present.book) return;
      if (clips) show(book, clips);
      else put({ ...h.present, book });
    },
    renameCycle(id: string, name: string) {
      const book = renameCycle(h.present.book, id, name);
      if (book !== h.present.book) put({ ...h.present, book });
    },
    /** a copy of a cycle as a new one of the person's, put on screen; returns it */
    copyCycle(id: string, name?: string): SavedCycle | null {
      const hit = copyCycle(h.present.book, id, name, newId);
      if (!hit) return null;
      show(hit.book, hit.clips);
      return hit.book.saved.find((c) => c.id === hit.book.active) ?? null;
    },
    /** a whole avatar from outside (the address bar): its cycle finds its place among the person's */
    load(blob: BlobState) {
      put({ blob, book: bookFor(h.present.book.saved, blob.cycle, newId) });
    },
    undo: () => commit(undo(h)),
    redo: () => commit(redo(h)),
    /** an undo of the step just taken, which does nothing once anything else has happened (a toast's button) */
    undoLast() {
      const at = h;
      return () => {
        if (h === at) commit(undo(h));
      };
    },
  };
}

export type Editor = ReturnType<typeof createEditor>;

/** what the timeline needs of the cycles */
export function cyclesOf(editor: Editor, book: Book) {
  return {
    saved: book.saved,
    active: book.active,
    change: editor.changeCycle,
    select: editor.selectCycle,
    rename: editor.renameCycle,
    copy: editor.copyCycle,
    /** an undo of the step just taken, for a toast's button */
    undoLast: editor.undoLast,
    /** delete a cycle of the person's (the one on screen by default); returns its undo */
    remove: (id?: string) => {
      editor.removeCycle(id);
      return editor.undoLast();
    },
  };
}

export type Cycles = ReturnType<typeof cyclesOf>;

// ---------------------------------------------------------------- the page's editor

const SAVED = 'coleoni-blob.cycles';

function keep(book: Book) {
  try {
    localStorage.setItem(SAVED, JSON.stringify(book.saved));
  } catch {}
}

function boot(): Editor {
  let saved: Book['saved'] = [];
  try {
    saved = parseSaved(JSON.parse(localStorage.getItem(SAVED) || '[]'));
  } catch {}
  const opened = location.hash.length > 1 ? fromHash(location.hash) : cloneState(DEFAULT_STATE);
  const editor = createEditor({ blob: opened, book: bookFor(saved, opened.cycle) });
  // a link with a cycle of its own adds it to the person's
  keep(editor.doc.book);

  let { blob, book } = editor.doc;
  let timer = 0;
  editor.subscribe(() => {
    const doc = editor.doc;
    if (doc.book.saved !== book.saved) keep(doc.book);
    book = doc.book;
    if (doc.blob === blob) return;
    blob = doc.blob;
    clearTimeout(timer);
    // checked against the address bar, not against the avatar the page opened with:
    // an undo back to that one still has to write it
    timer = window.setTimeout(() => {
      const hash = toHash(editor.doc.blob);
      if (location.hash.slice(1) !== hash) history.replaceState(null, '', `#${hash}`);
    }, 150);
  });

  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1);
    if (hash && hash !== toHash(editor.doc.blob)) editor.load(fromHash(hash));
  });
  return editor;
}

let shared: Editor | null = null;

/** the page's one editor, opened from the link */
export function useEditor() {
  const editor = (shared ??= boot());
  const h = useSyncExternalStore(editor.subscribe, editor.history);
  return { editor, doc: h.present, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
