// Small pieces of page behavior: the language menu, the editor tabs and the toast.

/** the EN/PT menu in the navbar; the choice is saved and beats the automatic redirect */
export function langMenu(reduced: boolean) {
  document.querySelectorAll<HTMLAnchorElement>('[data-lang]').forEach((a) =>
    a.addEventListener('click', () => {
      try {
        localStorage.setItem('coleoni-lang', a.dataset.lang!);
      } catch {}
      // keep the avatar when switching language
      a.href = a.getAttribute('href')!.split('#')[0] + location.hash;
    }),
  );
  const root = document.querySelector('[data-lang-menu]');
  if (!root) return;
  const btn = root.querySelector('button')!;
  const menu = root.querySelector<HTMLElement>('[role="menu"]')!;
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  const current = Math.max(0, items.findIndex((i) => i.getAttribute('aria-checked') === 'true'));
  let timer = 0;
  const open = (focus: boolean) => {
    clearTimeout(timer);
    menu.classList.remove('is-closing');
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (focus) items[current].focus();
  };
  const close = (focusBtn: boolean) => {
    if (menu.hidden || btn.getAttribute('aria-expanded') === 'false') return;
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
    if (reduced) {
      menu.hidden = true;
      return;
    }
    menu.classList.add('is-closing');
    timer = window.setTimeout(() => {
      menu.hidden = true;
      menu.classList.remove('is-closing');
    }, 120);
  };
  btn.addEventListener('click', () => (btn.getAttribute('aria-expanded') === 'true' ? close(false) : open(false)));
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    open(true);
  });
  menu.addEventListener('keydown', (e) => {
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') close(false);
  });
  items.forEach((a) =>
    a.addEventListener('click', (e) => {
      if (a.getAttribute('aria-checked') !== 'true') return;
      e.preventDefault();
      close(true);
    }),
  );
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target as Node)) close(false);
  });
}

/** the editor tabs: arrows move between them, the panel follows */
export const tabs = (() => {
  let list: HTMLElement[] = [];
  let onChange = () => {};
  const select = (id: string, focus = false) => {
    for (const t of list) {
      const on = t.id === `tab-${id}`;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')!)!.hidden = !on;
      if (on && focus) t.focus();
      if (on) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    onChange();
  };
  const init = (change: () => void) => {
    onChange = change;
    list = [...document.querySelectorAll<HTMLElement>('[role=tab]')];
    list.forEach((t, i) => {
      t.addEventListener('click', () => select(t.id.slice(4)));
      t.addEventListener('keydown', (e) => {
        const n = list.length;
        const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
        if (j < 0) return;
        e.preventDefault();
        select(list[j].id.slice(4), true);
      });
    });
  };
  return { init, select };
})();

let toastTimer = 0;
export function toast(msg: string) {
  const el = document.querySelector<HTMLElement>('[data-toast]');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('on'), 1800);
}
