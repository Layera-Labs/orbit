import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/features/shell/AppShell';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Orbit: image, video, studio',
  description:
    'Orbit web studio: a canvas image editor, a timeline video editor, and generation, on one bench.',
};

export const viewport: Viewport = {
  themeColor: '#100f0e',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
