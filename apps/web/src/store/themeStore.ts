'use client';

import { useSyncExternalStore } from 'react';

import { THEME_KEY } from './themeKey';

export type Theme = 'light' | 'dark';

export { THEME_KEY };

/**
 * The theme lives on `<html data-theme>`, not in React state.
 *
 * The attribute is written by a pre-paint script in `layout.tsx` before the
 * first byte is painted, so there is no flash — and CSS reads it directly, which
 * means the palette is never waiting on hydration. React only ever mirrors it.
 *
 * `useSyncExternalStore` with a distinct server snapshot is what keeps that
 * honest: on the server there IS no attribute, so it reports the default, and
 * React re-reads from the DOM immediately after hydrating. Seeding `useState`
 * from `document` instead would be a hydration mismatch every time a returning
 * user's stored choice differed from the default.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  // Another tab switching theme should move this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY && (e.newValue === 'light' || e.newValue === 'dark'))
      applyTheme(e.newValue);
  };
  window.addEventListener('storage', onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener('storage', onStorage);
  };
}

const getSnapshot = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/** Light is the default, so that is what the server renders. */
const getServerSnapshot = (): Theme => 'light';

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // The dark palette is an override on `[data-theme='dark']`; light is the bare
  // `:root`, so light REMOVES the attribute rather than setting it. That keeps
  // one code path — no attribute means the default, everywhere.
  if (theme === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode, or storage disabled. The theme still applies for this
    // session; only remembering it fails, which is not worth surfacing.
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
