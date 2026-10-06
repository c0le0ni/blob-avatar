// Language: English at the root, Portuguese at /pt/. Runs in <head>, before paint.
// Visitors in Brazil (device time zone) or with a pt-BR browser go to Portuguese.
// A choice made in the EN/PT switch is saved and always wins.
(() => {
  const KEY = 'coleoni-lang';
  const BR_ZONES = [
    'America/Sao_Paulo', 'America/Rio_Branco', 'America/Manaus', 'America/Cuiaba',
    'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Belem',
    'America/Fortaleza', 'America/Recife', 'America/Maceio', 'America/Bahia',
    'America/Araguaina', 'America/Santarem', 'America/Noronha', 'America/Eirunepe',
    'Brazil/East', 'Brazil/West', 'Brazil/Acre', 'Brazil/DeNoronha',
  ];

  const path = location.pathname;
  const onPt = path === '/pt' || path.startsWith('/pt/');
  if (onPt) return;
  // ?lang=en forces English without saving anything (shared links, screenshots)
  if (/[?&]lang=en(&|$)/.test(location.search)) return;

  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {}
  if (saved === 'en') return;

  let fromBrazil = saved === 'pt';
  if (!fromBrazil) {
    try {
      fromBrazil = BR_ZONES.includes(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {}
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    fromBrazil = fromBrazil || langs.some((l) => /^pt-br$/i.test(l || ''));
  }
  // the hash carries the avatar, so it travels with the redirect
  if (fromBrazil) location.replace(`/pt${path}${location.search}${location.hash}`);
})();
