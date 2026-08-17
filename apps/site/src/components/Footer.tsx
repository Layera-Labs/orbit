import styles from './Footer.module.css';

/**
 * The footer, and the signature wordmark.
 *
 * The big word is a composition, not text dropped in to satisfy a convention.
 * It is flush to the very bottom edge with no gap beneath it, clipped
 * deliberately at the baseline so it reads as bleeding off the page rather
 * than floating above an empty strip; it sits ON the surface, above the grain,
 * not buried under it; it is tracked out; and there is real room above it so
 * no cap or ascender is shaved by the container. Everything else — the links,
 * the colophon — sits above it on one grid, aligned to the same margins as the
 * page content, rather than being flung to opposite rims.
 */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <div className={styles.col}>
          <h2 className={styles.colHead}>SDK</h2>
          <a href="#packages">Packages</a>
          <a href="https://www.npmjs.com/org/layera-labs">npm</a>
          <a href="https://github.com/Layera-Labs/orbit">Source</a>
        </div>
        <div className={styles.col}>
          <h2 className={styles.colHead}>Cloud</h2>
          <a href="#cloud">Pricing</a>
          <a href="#self-host">Self-hosting</a>
        </div>
        <p className={styles.colophon}>
          Orbit is built by Layera Labs. The SDK is open source; the hosted
          render API is the same service, run by us.
        </p>
      </div>

      {/*
        aria-hidden: it is a decorative repeat of the brand name, already read
        out by the nav. A screen reader should not hear "Orbit" a second time
        as the last thing on the page.
      */}
      <div className={styles.signature} aria-hidden="true">
        <span>Orbit</span>
      </div>
    </footer>
  );
}
