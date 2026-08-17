import Link from 'next/link';
import { DualRender } from '@/components/DualRender';
import { PackageGraph } from '@/components/PackageGraph';
import { RateTable } from '@/components/RateTable';
import { capability, hero, packages, pricing, selfHost, signup } from '@/content';
import styles from './page.module.css';

/**
 * Home — six bands (see PLATE 01 of the portal blueprint).
 *
 * The order is an argument, not a template: prove it works, show what you
 * install, show what it does, show what it costs, offer the way out, then ask.
 * Each band is a DIFFERENT shape on purpose — a full-bleed artifact, a drawing,
 * a three-up, a split, a command, a single line — so the page never reads as
 * one block repeated six times, which is the thing that makes a product page
 * feel generated regardless of how good the copy is.
 *
 * Every word here comes from `src/content.ts` and every figure from the
 * packages that compute it. Editing the page's language or its palette never
 * means opening this file.
 */
export default function Home() {
  return (
    <main>
      {/* 1 — the proof. Nothing shares this fold. */}
      <section className={styles.hero}>
        <div className={styles.measure}>
          <h1 className={styles.headline}>{hero.headline}</h1>
          <p className={styles.lead}>{hero.lede}</p>
          <DualRender />
        </div>
      </section>

      {/* 2 — the drawing leads, the sentence explains what was just seen. */}
      <section className={styles.section} id="packages">
        <div className={styles.measure}>
          <PackageGraph />
          <div className={styles.after}>
            <h2>{packages.heading}</h2>
            <p>{packages.body}</p>
            <p className={styles.aside}>{packages.aside}</p>
          </div>
        </div>
      </section>

      {/* 3 — three groups, each anchored by a real count. */}
      <section className={styles.section} id="capability">
        <div className={styles.measure}>
          <h2 className={styles.bandHead}>{capability.heading}</h2>
          <ul className={styles.groups}>
            {capability.groups.map((g) => (
              <li key={g.title} className={styles.group}>
                <span className={styles.figure}>{g.figure}</span>
                <span className={styles.figureLabel}>{g.figureLabel}</span>
                <h3 className={styles.groupTitle}>{g.title}</h3>
                <p className={styles.groupBody}>{g.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4 — the rate card, not a repeat of /pricing. */}
      <section className={styles.section} id="cloud">
        <div className={styles.measure}>
          <div className={styles.split}>
            <h2 className={styles.splitHead}>{pricing.heading}</h2>
            <div>
              <p className={styles.splitBody}>{pricing.body}</p>
              <p className={styles.more}>
                <Link href="/pricing">Work out what a render costs</Link>
              </p>
            </div>
          </div>
          <RateTable />
        </div>
      </section>

      {/* 5 — opens on the command. */}
      <section className={styles.section} id="self-host">
        <div className={styles.measure}>
          <div className={styles.hostGrid}>
            <pre className={styles.code}>
              <code>{selfHost.command}</code>
            </pre>
            <div>
              <h2>{selfHost.heading}</h2>
              <p>{selfHost.body}</p>
              <p className={styles.aside}>{selfHost.aside}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 6 — one action, the same one as the top bar. No new offer. */}
      <section className={styles.section} id="start">
        <div className={styles.measure}>
          <div className={styles.startRow}>
            <div>
              <h2>{signup.heading}</h2>
              <p className={styles.splitBody}>{signup.body}</p>
            </div>
            <Link href={signup.cta.href} className={styles.cta}>
              {signup.cta.label}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
