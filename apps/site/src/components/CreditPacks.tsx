/**
 * Credit packs and generation costs.
 *
 * ## The packs are honest about not being buyable
 *
 * Checkout is not built and the price per credit is not set, so there is no
 * "Buy" button here. A control that looks live and answers nothing is worse
 * than an absent one, and this is exactly the place a reader would find out the
 * hard way. The state says what is true.
 *
 * The pack figures mirror `DEFAULT_CREDIT_PACKS` in `services/render`. They are
 * duplicated rather than imported because that constant lives inside a private
 * service the site does not depend on; if a third place ever needs them they
 * should move into `@layera-labs/orbit-billing` instead of being copied again.
 *
 * The generation costs ARE imported, from the table the metering runs on.
 */
import { DEFAULT_COSTS } from '@layera-labs/orbit-billing';
import { pricing } from '../content';
import styles from './CreditPacks.module.css';

/** Mirrors DEFAULT_CREDIT_PACKS in services/render/src/server.ts. */
const PACKS = [
  { id: 'credits_100', credits: 100 },
  { id: 'credits_500', credits: 550 },
  { id: 'credits_1200', credits: 1400 },
];

/** Base pack, used to show how much extra the larger ones carry. */
const BASE = PACKS[0];
const perUnit = (p: { id: string; credits: number }) =>
  p.credits / Number(p.id.split('_')[1]);

/** Human labels for the metered operations, in the order a reader meets them. */
const OPS: { key: keyof typeof DEFAULT_COSTS; label: string; note: string }[] = [
  { key: 'generate_image', label: 'Generate an image', note: 'Replicate' },
  { key: 'edit_image', label: 'Edit an image', note: 'Replicate' },
  { key: 'generate_video', label: 'Generate video', note: 'Runway, with audio' },
  { key: 'generate_video_muted', label: 'Generate video, muted', note: 'Runway' },
  { key: 'tts', label: 'Text to speech', note: 'ElevenLabs' },
  { key: 'caption', label: 'Transcribe to captions', note: 'per clip' },
];

export function CreditPacks() {
  return (
    <div className={styles.wrap}>
      <section>
        <h3 className={styles.head}>{pricing.packsHeading}</h3>
        <p className={styles.body}>{pricing.packsBody}</p>
        <ul className={styles.packs}>
          {PACKS.map((p) => {
            const bonus = Math.round((perUnit(p) / perUnit(BASE) - 1) * 100);
            return (
              <li key={p.id} className={styles.pack}>
                <span className={styles.credits}>{p.credits.toLocaleString()}</span>
                <span className={styles.creditsLabel}>credits</span>
                {/* Only shown where it is true, rather than a "+0%" on the base pack. */}
                {bonus > 0 ? (
                  <span className={styles.bonus}>{bonus}% more per credit</span>
                ) : (
                  <span className={styles.bonusNone}>base rate</span>
                )}
                <span className={styles.unavailable}>{pricing.packsUnavailable}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className={styles.head}>{pricing.aiHeading}</h3>
        <p className={styles.body}>{pricing.aiBody}</p>
        <ul className={styles.ops}>
          {OPS.map((op) => (
            <li key={op.key} className={styles.op}>
              <span className={styles.opCost}>{DEFAULT_COSTS[op.key]}</span>
              <span className={styles.opLabel}>{op.label}</span>
              <span className={styles.opNote}>{op.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
