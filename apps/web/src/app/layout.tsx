import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/features/shell/AppShell';
import { THEME_KEY } from '@/store/themeKey';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Orbit: image, video, studio',
  description:
    'Orbit web studio: a canvas image editor, a timeline video editor, and generation, on one bench.',
};

export const viewport: Viewport = {
  // Light first, matching the default palette; the second entry is picked up by
  // browsers that honour the media attribute once the user is in dark.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e6e1de' },
    { media: '(prefers-color-scheme: dark)', color: '#100f0e' },
  ],
};

/**
 * Set the theme BEFORE first paint.
 *
 * A stored choice applied in an effect would paint the default palette first and
 * then repaint — the white flash every themed app has to solve. This runs
 * synchronously in `<head>`, ahead of the body, so the correct attribute is
 * already on `<html>` when styles resolve.
 *
 * Note what it does NOT do: it never hides or reveals anything. If it is blocked
 * or throws, the page still renders completely in the default light palette,
 * because that palette is the bare `:root` and needs no attribute at all.
 */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem(${JSON.stringify(THEME_KEY)}) === 'dark' ? 'dark' : 'light';
  if (t === 'dark') document.documentElement.dataset.theme = 'dark';
} catch (e) {}
`.trim();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /* The script below sets `data-theme` before React hydrates, so on a dark
       session the server's `<html>` and the client's differ by that one
       attribute. This is the sanctioned escape hatch for exactly that, and it
       suppresses ONLY this element's own attributes — children still hydrate
       under the normal rules. */
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
