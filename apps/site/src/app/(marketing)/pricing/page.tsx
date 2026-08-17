import type { Metadata } from 'next';
import { CreditPacks } from '@/components/CreditPacks';
import { Estimator } from '@/components/Estimator';
import { RateTable } from '@/components/RateTable';
import { pricing } from '@/content';
import styles from './pricing.module.css';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Cloud renders are priced per second of output by resolution tier. Credits are held before encoding and settled against the real output, so a failed render refunds in full.',
};

/**
 * Pricing — PLATE 02.
 *
 * Deliberately NOT three tier cards with a highlighted middle. Orbit does not
 * sell plans; it sells credits against a per-second rate, and pretending
 * otherwise would mean inventing tiers that do not exist in the billing model.
 * So the page is what the model actually is: a rate table, a calculator that
 * runs the real cost function, the one rule that surprises people, and the
 * packs.
 *
 * The calculator is the centrepiece rather than an add-on, because "what will
 * this cost me" is the only question this page exists to answer.
 */
export default function Pricing() {
  return (
    <main>
      <section className={styles.top}>
        <div className={styles.measure}>
          <h1 className={styles.headline}>{pricing.heading}</h1>
          <p className={styles.lead}>{pricing.body}</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.measure}>
          <div className={styles.rates}>
            <RateTable />
            <ul className={styles.rules}>
              {pricing.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* The calculator. Runs `renderCost`, the same function that places the hold. */}
      <section className={styles.section} id="estimate">
        <div className={styles.measure}>
          <Estimator />
        </div>
      </section>

      {/* The rule worth knowing before you budget, given its own band. */}
      <section className={styles.section}>
        <div className={styles.measure}>
          <div className={styles.rule}>
            <h2>{pricing.shortEdge.heading}</h2>
            <p>{pricing.shortEdge.body}</p>
          </div>
        </div>
      </section>

      <section className={styles.section} id="packs">
        <div className={styles.measure}>
          <CreditPacks />
        </div>
      </section>
    </main>
  );
}
