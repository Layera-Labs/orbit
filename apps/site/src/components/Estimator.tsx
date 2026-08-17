'use client';

/**
 * What a render costs, priced in front of the reader.
 *
 * The number below is not a table someone typed into a marketing page. It is
 * `renderCost` from `@layera-labs/orbit-billing` — the same function
 * `services/render` calls to place the credit hold before it starts ffmpeg —
 * imported and run here, in the reader's browser, on whatever they set the
 * controls to. If the service's price changes, this changes, because there is
 * only one implementation.
 *
 * ## Why this is not a live call to the API
 *
 * `POST /v1/render/quote` exists and does exactly this, and the first design
 * called it from here. It is behind a bearer token, correctly — every route on
 * that service is — so a public page could only reach it by minting a guest
 * token on page load, which turns a landing page into an unauthenticated
 * account-creation endpoint pointed at our own rate limiter. Running the
 * published function instead is the same arithmetic with no such surface, it
 * answers instantly, and it still works when the API is down. The distinction
 * a reader cares about — is this the real price? — is preserved either way.
 *
 * The resolution presets are output DIMENSIONS rather than tier names, because
 * that is what a caller actually has, and picking the tier from them is itself
 * a thing worth showing: it comes from the SHORT edge, so a 1080×1920 phone
 * video is priced as 1080p and not as the 2k its long edge would suggest.
 */
import { useId, useState } from 'react';
import { DEFAULT_RENDER_PRICING, renderCost, type QualityTier } from '@layera-labs/orbit-billing';
import styles from './Estimator.module.css';

/** Real shapes people export, not one of each tier for symmetry. */
const SIZES: { label: string; hint: string; w: number; h: number }[] = [
  { label: '1080 × 1920', hint: 'vertical', w: 1080, h: 1920 },
  { label: '1920 × 1080', hint: 'landscape', w: 1920, h: 1080 },
  { label: '1280 × 720', hint: 'landscape', w: 1280, h: 720 },
  { label: '3840 × 2160', hint: '4K', w: 3840, h: 2160 },
];

const DURATIONS = [6, 15, 30, 60, 120, 300];

export function Estimator() {
  const [sizeIdx, setSizeIdx] = useState(0);
  const [seconds, setSeconds] = useState(30);
  const [hdr, setHdr] = useState(false);
  const durationId = useId();

  const size = SIZES[sizeIdx];
  const quote = renderCost({ durationSec: seconds, width: size.w, height: size.h, hdr });

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <fieldset className={styles.field}>
          <legend className={styles.legend}>Output</legend>
          <div className={styles.choices}>
            {SIZES.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setSizeIdx(i)}
                aria-pressed={i === sizeIdx}
                className={`${styles.choice} ${i === sizeIdx ? styles.on : ''}`}
              >
                <span className={styles.choiceMain}>{s.label}</span>
                <span className={styles.choiceHint}>{s.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles.field}>
          <label className={styles.legend} htmlFor={durationId}>
            Duration
          </label>
          <input
            id={durationId}
            type="range"
            min={0}
            max={DURATIONS.length - 1}
            step={1}
            value={DURATIONS.indexOf(seconds)}
            onChange={(e) => setSeconds(DURATIONS[Number(e.target.value)])}
            className={styles.range}
            aria-valuetext={`${seconds} seconds`}
          />
          <div className={styles.ticks} aria-hidden="true">
            {DURATIONS.map((d) => (
              <span key={d} className={d === seconds ? styles.tickOn : undefined}>
                {d < 60 ? `${d}s` : `${d / 60}m`}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.legend}>HDR10</span>
          <button
            type="button"
            onClick={() => setHdr((v) => !v)}
            aria-pressed={hdr}
            className={`${styles.choice} ${styles.wide} ${hdr ? styles.on : ''}`}
          >
            <span className={styles.choiceMain}>{hdr ? 'On' : 'Off'}</span>
            <span className={styles.choiceHint}>
              ×{DEFAULT_RENDER_PRICING.hdrMultiplier}
            </span>
          </button>
        </div>
      </div>

      <output className={styles.result}>
        <span className={styles.credits}>
          <b>{quote.credits}</b>
          <span>{quote.credits === 1 ? 'credit' : 'credits'}</span>
        </span>
        <span className={styles.working}>
          {quote.billedSec} s billed × {quote.perSecond} /s at{' '}
          <span className={styles.tier}>{quote.tier}</span>
          {hdr ? ` × ${DEFAULT_RENDER_PRICING.hdrMultiplier} for HDR` : ''}
        </span>
        <span className={styles.explain}>
          {tierNote(quote.tier, size.w, size.h)}
        </span>
      </output>

    </div>
  );
}

/**
 * Where the tier came from, in one line.
 *
 * Terse on purpose: the pricing page gives the short-edge rule a band of its
 * own, and repeating the full argument here would say the same thing twice on
 * one screen. This states the derivation; that band makes the case.
 */
function tierNote(tier: QualityTier, w: number, h: number): string {
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  return short === long
    ? `Priced by the ${short}px edge.`
    : `Short edge ${short}px, not ${long}px, so ${tier}.`;
}
