/**
 * The rate card, read out of the pricing model rather than typed in.
 *
 * `DEFAULT_RENDER_PRICING` is the same object `services/render` loads to price a
 * hold, so this table cannot say one thing while the service charges another.
 * Change the rate in `@layera-labs/orbit-billing` and the page follows.
 *
 * Server component: it has no state and no handlers, so there is no reason to
 * ship it to the browser.
 */
import {
  DEFAULT_RENDER_PRICING,
  QUALITY_TIERS,
  type QualityTier,
} from '@layera-labs/orbit-billing';
import styles from './RateTable.module.css';

/** The shape each tier is usually reached at, to make the number concrete. */
const EXAMPLE: Record<QualityTier, string> = {
  '480p': '854 × 480',
  '720p': '1280 × 720',
  '1080p': '1080 × 1920',
  '2k': '2560 × 1440',
  '4k': '3840 × 2160',
};

export function RateTable({ highlight }: { highlight?: QualityTier }) {
  const { perSecond, minimum, hdrMultiplier } = DEFAULT_RENDER_PRICING;

  return (
    <div>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col" className={styles.example}>
                Typical output
              </th>
              <th scope="col">Credits / second</th>
            </tr>
          </thead>
          <tbody>
            {QUALITY_TIERS.map((tier) => (
              <tr key={tier} className={tier === highlight ? styles.on : undefined}>
                <th scope="row" className={styles.tier}>
                  {tier}
                </th>
                <td className={styles.example}>{EXAMPLE[tier]}</td>
                <td className={styles.rate}>{perSecond[tier]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/*
        Outside the scroll container, deliberately. As a <caption> it inherited
        the table's min-width and its last words were clipped off the right edge
        on a phone — a note nobody could read. Here it wraps to the page.
      */}
      <p className={styles.note}>
        Credits per second of output. Minimum {minimum} credit per render; HDR10 is ×
        {hdrMultiplier}.
      </p>
    </div>
  );
}
