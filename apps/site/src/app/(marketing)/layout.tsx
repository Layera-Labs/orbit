import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';

/**
 * The marketing shell.
 *
 * It lives in a route group so that `/app/*` does NOT get it. The two shells
 * are different surfaces — one is read top to bottom and ends in a footer, the
 * other is operated and does not — and a dashboard wearing a marketing header
 * is the most common portal mistake there is. Putting the nav in the root
 * layout is exactly how that happens, so it is not there.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
