'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/store/authStore';
import { Icon, Plate, type IconName } from '@layera-labs/orbit-brand';
import { ThemeSwitch } from '@/brand/ThemeSwitch';
import styles from './AppShell.module.css';

interface RailItem {
  href: string;
  icon: IconName;
  label: string;
  match: string[];
}

const ITEMS: RailItem[] = [
  { href: '/', icon: 'bench', label: 'Home', match: ['/'] },
  { href: '/studio', icon: 'reading', label: 'AI Studio', match: ['/studio'] },
  { href: '/library', icon: 'library', label: 'Library', match: ['/library'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';

  /*
   * Restore the session on every route, INCLUDING the editor.
   *
   * This runs above the `/design/` early return on purpose: that branch still
   * renders this component, so the hook still fires, and AI Studio lives inside
   * the editor. Hydrating only in the outer shell would leave a signed-in user
   * looking at a sign-in form the moment they opened a project.
   */
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(hydrate, [hydrate]);

  /*
   * A promise that nobody handled used to go nowhere at all.
   *
   * An error boundary cannot see these — they are not thrown during render —
   * so an async failure in a store action, a decode, or a fetch that lost its
   * `.catch()` simply disappeared: no console entry in production, no signal
   * of any kind. This does not try to show the user anything, because most of
   * these are recoverable and a modal per rejection would be worse than the
   * silence. It makes them visible to whoever is debugging, which is the
   * difference between a reproducible bug and "it sometimes doesn't work".
   */
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error('[orbit] unhandled promise rejection:', e.reason);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  /**
   * The editor owns the whole viewport.
   *
   * It has its own rail, and stacking the app rail beside it would give the
   * window two competing left columns. A `usePathname` check rather than a route
   * group so there is still exactly one layout in the app.
   */
  if (pathname.startsWith('/design/')) return <>{children}</>;

  const isActive = (item: RailItem) =>
    item.href === '/' ? pathname === '/' : item.match.some((m) => pathname.startsWith(m));

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="Sections">
        <Link href="/" className={styles.mark} aria-label="Orbit home">
          <Plate size={34} detail="mark" />
        </Link>
        <div className={styles.items}>
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.item}
              data-active={isActive(item)}
              aria-current={isActive(item) ? 'page' : undefined}
            >
              <Icon name={item.icon} size={21} title={item.label} />
              <span className={styles.label} aria-hidden="true">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
        {/* Sits with Account at the foot of the rail: both are about the
            session rather than the work. The editor has its own copy in
            `DesignBar`, because it opts out of this shell entirely. */}
        <div className={styles.switch}>
          <ThemeSwitch />
        </div>
        <Link href="/profile" className={styles.item} data-active={pathname.startsWith('/profile')}>
          <Icon name="profile" size={21} title="Account" />
          <span className={styles.label} aria-hidden="true">
            Account
          </span>
        </Link>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
