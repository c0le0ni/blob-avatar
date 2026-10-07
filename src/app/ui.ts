// Small pieces of page behavior: the mode rail, popovers and the toast.

/** the rail is a vertical tablist: arrows move between modes, the panel follows */
export function rail(onSelect: (id: string) => void) {
  const tabs = [...document.querySelectorAll<HTMLElement>('.rail [role=tab]')];
  const select = (id: string, focus = false) => {
    for (const t of tabs) {
      const on = t.id === `mode-${id}`;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')!)!.hidden = !on;
      if (on && focus) t.focus();
    }
    onSelect(id);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t.id.slice(5)));
    t.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const next = ['ArrowDown', 'ArrowRight'].includes(e.key) ? (i + 1) % n : ['ArrowUp', 'ArrowLeft'].includes(e.key) ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      select(tabs[next].id.slice(5), true);
    });
  });
  return select;
}

/**
 * A popover opened by a button: it animates in and out, closes on Escape, on a click
 * outside and when focus leaves it, and gives focus back to its button.
 */
export function popover(trigger: HTMLElement, pop: HTMLElement, reduced: boolean) {
  let timer = 0;
  const isOpen = () => !pop.hidden && !pop.classList.contains('closing');
  const open = () => {
    clearTimeout(timer);
    pop.classList.remove('closing');
    pop.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    pop.querySelector<HTMLElement>('button, input')?.focus();
  };
  const close = (refocus = false) => {
    if (!isOpen()) return;
    trigger.setAttribute('aria-expanded', 'false');
    if (refocus) trigger.focus();
    if (reduced) {
      pop.hidden = true;
      return;
    }
    pop.classList.add('closing');
    timer = window.setTimeout(() => {
      pop.hidden = true;
      pop.classList.remove('closing');
    }, 160);
  };
  trigger.addEventListener('click', () => (isOpen() ? close() : open()));
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...pop.querySelectorAll<HTMLElement>('.pop-item')];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (i < 0) return;
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !pop.contains(e.target as Node) && !trigger.contains(e.target as Node)) close();
  });
  pop.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && !pop.contains(to) && to !== trigger) close();
  });
  return { open, close, isOpen };
}

let toastTimer = 0;
export function toast(msg: string) {
  const el = document.querySelector<HTMLElement>('[data-toast]');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('on'), 1800);
}
