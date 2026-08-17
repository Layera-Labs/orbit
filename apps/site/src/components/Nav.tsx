import { Plate } from '@layera-labs/orbit-brand';
import styles from './Nav.module.css';

/**
 * The nav.
 *
 * Not a flush row of links across the top: it is a contained bar inset from
 * every edge, sitting on the page's own surface, with the mark at one end and
 * the two destinations at the other. It does not stick — a marketing page is
 * read downward, and a bar that follows the reader is a permanent 60px tax on
 * a hero composed to own the fold.
 *
 * The active state, when there is one, will be a weight and colour shift on
 * the link itself. Never a dot tacked underneath it.
 */
export function Nav() {
  return (
    <nav className={styles.nav} aria-label="Main">
      <a href="/" className={styles.mark} aria-label="Orbit — home">
        <Plate size={22} detail="mark" />
        <span className={styles.word}>Orbit</span>
      </a>
      <div className={styles.links}>
        <a href="#packages">Packages</a>
        <a href="#cloud">Cloud</a>
        <a href="https://github.com/Layera-Labs/orbit" className={styles.repo}>
          GitHub
        </a>
      </div>
    </nav>
  );
}
