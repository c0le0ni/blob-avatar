// Theme before the first paint: dark (the default) or light, from the saved choice
// or, when the choice is "system", from the device. app/theme.ts keeps it current.
(() => {
  let pref = 'system';
  try {
    pref = localStorage.getItem('coleoni-blob.theme') || 'system';
  } catch {}
  const light = pref === 'light' || (pref === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  if (light) document.documentElement.dataset.theme = 'light';
})();
