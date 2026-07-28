/**
 * The localStorage key for the theme, in its own module with NO `'use client'`.
 *
 * `layout.tsx` is a server component and inlines this key into the pre-paint
 * script. Importing it from `themeStore.ts` looked identical but was not: that
 * module is `'use client'`, so what a server component receives is a client
 * REFERENCE PROXY, not the string. `JSON.stringify` turned it into `{}` and the
 * script ran `localStorage.getItem({})` — which reads nothing, so a stored dark
 * theme silently never came back after a reload. Nothing failed loudly; the
 * preference just did not stick.
 *
 * A plain module is importable from both sides with the value intact.
 */
export const THEME_KEY = 'orbit-theme';
