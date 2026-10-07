// The Blob Avatar app: React mounts the editor into the page that scripts/pages.ts
// wrote; the page's language picks the strings.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { stringsFor } from './i18n/strings';
import { App } from './ui/app';
import './styles.css';

const S = stringsFor(document.documentElement.lang);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App S={S} />
  </StrictMode>,
);
