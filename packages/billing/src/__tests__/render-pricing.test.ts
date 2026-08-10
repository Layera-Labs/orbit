/**
 * Pricing a render by duration and resolution.
 *
 * The two properties worth defending here are not the arithmetic — they are
 * that the SHORT edge picks the tier (so vertical video is not overcharged),
 * and that no path can put a fractional credit into the ledger.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RENDER_PRICING,
  QUALITY_TIERS,
  qualityTierOf,
  renderCost,
  tierRank,
  withinTier,
  type RenderPricing,
} from '../render-pricing';

describe('qualityTierOf', () => {
  it('reads the tier off the short edge, so vertical video is not overcharged', () => {
    // The case that motivates the whole function: a phone-shaped reel. Its long
    // edge is 1920, which a max() would price as 2k.
    expect(qualityTierOf(1080, 1920)).toBe('1080p');
    expect(qualityTierOf(1920, 1080)).toBe('1080p');
    // ...and the same for every other rung, in both orientations.
    expect(qualityTierOf(720, 1280)).toBe('720p');
    expect(qualityTierOf(1280, 720)).toBe('720p');
    expect(qualityTierOf(1440, 2560)).toBe('2k');
    expect(qualityTierOf(2160, 3840)).toBe('4k');
  });

  it('puts each boundary in the lower tier and one pixel past it in the next', () => {
    expect(qualityTierOf(480, 480)).toBe('480p');
    expect(qualityTierOf(481, 481)).toBe('720p');
    expect(qualityTierOf(720, 720)).toBe('720p');
    expect(qualityTierOf(721, 721)).toBe('1080p');
    expect(qualityTierOf(1080, 1080)).toBe('1080p');
    expect(qualityTierOf(1081, 1081)).toBe('2k');
    expect(qualityTierOf(1440, 1440)).toBe('2k');
    expect(qualityTierOf(1441, 1441)).toBe('4k');
  });

  it('floors below 480 and caps above 1440 rather than leaving a frame unpriced', () => {
    expect(qualityTierOf(320, 240)).toBe('480p');
    expect(qualityTierOf(1, 1)).toBe('480p');
    // 8K bills as 4k — a deliberate under-charge, not a refusal.
    expect(qualityTierOf(4320, 7680)).toBe('4k');
  });
});

describe('tierRank / withinTier', () => {
  it('ranks the ladder ascending', () => {
    const ranks = QUALITY_TIERS.map(tierRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(tierRank('480p')).toBeLessThan(tierRank('4k'));
  });

  it('admits the ceiling itself and everything under it', () => {
    expect(withinTier('720p', '1080p')).toBe(true);
    expect(withinTier('1080p', '1080p')).toBe(true);
    expect(withinTier('2k', '1080p')).toBe(false);
    // No ceiling means no limit.
    expect(withinTier('4k', undefined)).toBe(true);
  });
});

describe('renderCost', () => {
  it('charges duration times the tier rate', () => {
    const q = renderCost({ durationSec: 30, width: 1920, height: 1080 });
    expect(q.tier).toBe('1080p');
    expect(q.perSecond).toBe(1);
    expect(q.billedSec).toBe(30);
    expect(q.credits).toBe(30);
  });

  it('prices the same duration up the ladder', () => {
    const at = (w: number, h: number) =>
      renderCost({ durationSec: 60, width: w, height: h }).credits;
    expect(at(854, 480)).toBe(15); // 60 × 0.25
    expect(at(1280, 720)).toBe(30); // 60 × 0.5
    expect(at(1920, 1080)).toBe(60);
    expect(at(2560, 1440)).toBe(120);
    expect(at(3840, 2160)).toBe(240);
  });

  it('rounds seconds up, because a developer cannot predict 12.03s from their timeline', () => {
    expect(renderCost({ durationSec: 12.03, width: 1920, height: 1080 }).billedSec).toBe(13);
    expect(renderCost({ durationSec: 12.0, width: 1920, height: 1080 }).billedSec).toBe(12);
    // Rounding up the seconds is what makes the credits move, not a second rounding.
    expect(renderCost({ durationSec: 0.1, width: 1920, height: 1080 }).credits).toBe(1);
  });

  it('applies the minimum to a short render that would otherwise round to nothing', () => {
    // 1s at 480p is 0.25 credits — a real encode, a stored file, and without a
    // floor it bills zero.
    const q = renderCost({ durationSec: 1, width: 854, height: 480 });
    expect(q.credits).toBe(1);
  });

  it('bills nothing for a zero-length project, since there is no file', () => {
    const q = renderCost({ durationSec: 0, width: 1920, height: 1080 });
    expect(q.credits).toBe(0);
    expect(q.billedSec).toBe(0);
  });

  it('charges HDR at the multiplier', () => {
    const sdr = renderCost({ durationSec: 10, width: 1920, height: 1080 });
    const hdr = renderCost({ durationSec: 10, width: 1920, height: 1080, hdr: true });
    expect(sdr.credits).toBe(10);
    expect(hdr.credits).toBe(15);
  });

  /**
   * The invariant that protects the ledger. `balance()` sums signed deltas and
   * `minBalanceAfter: 0` compares exactly, so one fractional credit anywhere
   * leaves an account permanently a hair below a floor it should clear.
   */
  it('never emits a fractional credit, at any rate or duration', () => {
    const awkward: RenderPricing = {
      perSecond: { '480p': 0.1, '720p': 0.33, '1080p': 0.7, '2k': 1.1, '4k': 3.3 },
      minimum: 1,
      hdrMultiplier: 1.5,
    };
    const sizes: [number, number][] = [
      [854, 480],
      [1280, 720],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ];
    for (const [w, h] of sizes) {
      for (let d = 0; d < 200; d += 0.37) {
        for (const hdr of [false, true]) {
          const { credits } = renderCost({ durationSec: d, width: w, height: h, hdr }, awkward);
          expect(Number.isInteger(credits)).toBe(true);
          expect(credits).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('is monotonic in duration — a longer render never costs less', () => {
    let prev = -1;
    for (let d = 0; d <= 120; d += 0.25) {
      const { credits } = renderCost({ durationSec: d, width: 1920, height: 1080 });
      expect(credits).toBeGreaterThanOrEqual(prev);
      prev = credits;
    }
  });

  it('is monotonic up the ladder at a fixed duration', () => {
    const sizes: Record<string, [number, number]> = {
      '480p': [854, 480],
      '720p': [1280, 720],
      '1080p': [1920, 1080],
      '2k': [2560, 1440],
      '4k': [3840, 2160],
    };
    let prev = -1;
    for (const tier of QUALITY_TIERS) {
      const [w, h] = sizes[tier];
      const { credits } = renderCost({ durationSec: 90, width: w, height: h });
      expect(credits).toBeGreaterThanOrEqual(prev);
      prev = credits;
    }
  });

  it('refuses input it cannot price rather than inventing a number', () => {
    expect(() => renderCost({ durationSec: -1, width: 1920, height: 1080 })).toThrow(/durationSec/);
    expect(() => renderCost({ durationSec: NaN, width: 1920, height: 1080 })).toThrow(/durationSec/);
    expect(() => renderCost({ durationSec: 10, width: NaN, height: 1080 })).toThrow(/dimensions/);
    const missing = {
      ...DEFAULT_RENDER_PRICING,
      perSecond: { ...DEFAULT_RENDER_PRICING.perSecond, '4k': undefined as unknown as number },
    };
    expect(() => renderCost({ durationSec: 10, width: 3840, height: 2160 }, missing)).toThrow(/4k/);
  });
});
