import type { Metadata, Viewport } from 'next';
import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';
import '../styles/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://orbit.layeralabs.com'),
  title: {
    default: 'Orbit — an embeddable editor SDK for image and video',
    template: '%s · Orbit',
  },
  description:
    'Orbit is an embeddable, white-label design-canvas editor SDK for image and video. Every effect is defined once and drawn twice — canvas in the browser, ffmpeg on the server — and the two are tested to agree.',
  openGraph: {
    type: 'website',
    siteName: 'Orbit',
    url: 'https://orbit.layeralabs.com',
  },
};

/**
 * `themeColor` belongs on the viewport export, not on `metadata` — Next 14
 * warns and DROPS it there, so the tag never reaches the document. It matches
 * `--s-ground` so mobile browser chrome continues the page's surface instead
 * of drawing a white bar above a warm stone one.
 */
export const viewport: Viewport = {
  themeColor: '#f6f2ed',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="page">
          <Nav />
          {children}
          <Footer />
        </div>
      </body>
    </html>
  );
}
