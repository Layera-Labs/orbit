import Link from 'next/link';
import { Plate } from '@layera-labs/orbit-brand';
import { Balance } from '@/components/app/Balance';
import styles from './app.module.css';

/**
 * The app shell — PLATE 04.
 *
 * Everything behind sign-in shares this frame, and it is deliberately NOT the
 * marketing shell: no footer, no wide measure, denser type. A dashboard wearing
 * a marketing header is the most common portal mistake, and it makes an
 * operated surface read as something to be scrolled through.
 *
 * The balance is pinned in the sidebar rather than living on one screen,
 * because it is the number a developer checks most often and it is the one
 * thing whose running out silently breaks their integration.
 */
const NAV = [
  { href: '/app', label: 'Overview' },
  { href: '/app/keys', label: 'API keys' },
  { href: '/app/credits', label: 'Credits' },
  { href: '/app/usage', label: 'Usage' },
  { href: '/app/settings', label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.mark} aria-label="Orbit — home">
          <Plate size={20} detail="mark" />
          <span className={styles.word}>Orbit</span>
        </Link>

        <nav className={styles.nav} aria-label="Portal">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navItem}>
              {item.label}
            </Link>
          ))}
        </nav>

        <Balance />
      </aside>

      <div className={styles.content}>{children}</div>
    </div>
  );
}
