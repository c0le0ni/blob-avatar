// Keyboard shortcuts: R rolls a new look, Ctrl or Cmd+Z undoes, Ctrl or Cmd+Shift+Z
// and Ctrl+Y redo, Space plays and pauses in Animate, and ? shows the list. None
// of them fires while someone types in a field or works in an open popover, and
// Space never takes the press away from a focused control.

import type { Strings } from '../i18n/strings';

export type Action = 'randomize' | 'undo' | 'redo' | 'play' | 'help';

export const ACTIONS: readonly Action[] = ['randomize', 'undo', 'redo', 'play', 'help'];

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'repeat'>;

export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

/** the action a key press asks for, or null */
export function actionFor(e: KeyLike): Action | null {
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return null;
    if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
    return k === 'y' && e.ctrlKey && !e.shiftKey ? 'redo' : null;
  }
  if (e.altKey || e.repeat) return null;
  if (k === 'r' && !e.shiftKey) return 'randomize';
  if (e.key === ' ' && !e.shiftKey) return 'play';
  return e.key === '?' ? 'help' : null;
}

/** the focus is where keys mean something else: a field being typed in, or an open popover */
function busy(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-radix-popper-content-wrapper], [role="dialog"], [role="menu"], [role="listbox"]');
}

/** Space belongs to the focused control, so it only plays from the page itself or the stage */
const bare = (target: EventTarget | null) => target === document.body || target === document.documentElement || (target instanceof Element && !!target.closest('#stage'));

/** listen for the shortcuts; `get` hands over the current handlers (a missing one does nothing) */
export function bindShortcuts(get: () => Partial<Record<Action, () => void>>): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    const action = actionFor(e);
    if (!action || busy(e.target) || (action === 'play' && !bare(e.target))) return;
    const run = get()[action];
    if (!run) return;
    e.preventDefault();
    run();
  };
  addEventListener('keydown', onKey);
  return () => removeEventListener('keydown', onKey);
}

/** the keys of an action, as the keyboard labels them; some actions have two ways */
export function keysFor(action: Action, S: Strings): string[][] {
  const mod = MAC ? '⌘' : 'Ctrl';
  const shift = MAC ? '⇧' : 'Shift';
  switch (action) {
    case 'randomize':
      return [['R']];
    case 'undo':
      return [[mod, 'Z']];
    case 'redo':
      return MAC ? [[mod, shift, 'Z']] : [[mod, shift, 'Z'], ['Ctrl', 'Y']];
    case 'play':
      return [[S.spaceKey]];
    case 'help':
      return [['?']];
  }
}
