'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/brand/Icon';
import { Plate } from '@/brand/Plate';
import styles from './AppShell.module.css';

interface RailItem {
  href: string;
  icon: IconName;
  label: string;
  match: string[];
}

const ITEMS: RailItem[] = [
  { href: '/', icon: 'bench', label: 'Home', match: ['/'] },
  { href: '/studio', icon: 'reading', label: 'Generate', match: ['/studio'] },
  { href: '/library', icon: 'library', label: 'Library', match: ['/library'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';

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
