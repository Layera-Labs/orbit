/**
 * What a render costs: a function of how long the output is and how big its
 * frames are.
 *
 * Separate from `metering.ts` because the shapes genuinely differ. A generation
 * is one call at one price — a flat `CostTable` lookup is the right model for
 * it. A render is billed per second at a rate that depends on resolution, so
 * the cost cannot be known until the project is in hand.
 */

/**
 * The resolution ladder. Named for how the industry says them, which is not
 * always the pixel count: `2k` here is 1440p/QHD, the rung people actually
 * ship between 1080p and 4K, not DCI 2K (2048×1080) which is barely above
 * 1080p and would make the ladder non-monotonic in cost.
 */
export type QualityTier = '480p' | '720p' | '1080p' | '2k' | '4k';

/** Ascending. Exported so callers can compare tiers without a lookup table. */
export const QUALITY_TIERS: readonly QualityTier[] = [
  '480p',
  '720p',
  '1080p',
  '2k',
  '4k',
];

/** Position on the ladder. Higher is bigger. */
export function tierRank(tier: QualityTier): number {
  return QUALITY_TIERS.indexOf(tier);
}

/**
 * Upper bound of the SHORT edge for each tier, in ascending order.
 *
 * The short edge is what decides the tier, and this is the one detail worth
 * getting right: a 1080×1920 vertical reel is 1080p everywhere in the world,
 * but its LONG edge is 1920, which a naive `max(w, h)` reads as 2K. That would
 * overcharge every phone-shaped video on the platform — which, for this
 * product, is most of them.
 */
const TIER_MAX_SHORT_EDGE: readonly (readonly [number, QualityTier])[] = [
  [480, '480p'],
  [720, '720p'],
  [1080, '1080p'],
  [1440, '2k'],
];

/**
 * Which tier a frame of this size bills at.
 *
 * Anything below 480 short-edge still bills as `480p`: the floor is a price
 * floor, not a claim about the pixels. Anything above 1440 is `4k`, including
 * genuinely larger frames — there is no 8K rung, and an 8K render billing as
 * 4K is a deliberate under-charge rather than an unpriced request we would
 * have to refuse.
 */
export function qualityTierOf(width: number, height: number): QualityTier {
  const short = Math.min(Math.abs(width), Math.abs(height));
  for (const [max, tier] of TIER_MAX_SHORT_EDGE) if (short <= max) return tier;
  return '4k';
}

export interface RenderPricing {
  /** Credits per second of output, by tier. May be fractional; totals are not. */
  perSecond: Record<QualityTier, number>;
  /**
   * Smallest charge for any render that produces a file. Without it a 0.4s
   * sticker export at 480p rounds to a rate below one credit and bills nothing,
   * while still costing a process spawn, an encode and a stored object.
   */
  minimum: number;
  /**
   * Multiplier for HDR10. 10-bit HEVC is materially slower to encode than the
   * 8-bit H.264 path, so it is not the same product at the same price.
   */
  hdrMultiplier: number;
  /** Highest tier this account may request, if capped. */
  maxTier?: QualityTier;
}

/**
 * Rates roughly track encode cost, which rises with pixel count but not
 * linearly with it — 4K has 9× the pixels of 720p and nothing like 9× the
 * wall-clock, because the encoder parallelises and the I/O amortises.
 *
 * Deployments override this wholesale. It is a starting point, not a claim
 * about anyone's margin.
 */
export const DEFAULT_RENDER_PRICING: RenderPricing = {
  perSecond: { '480p': 0.25, '720p': 0.5, '1080p': 1, '2k': 2, '4k': 4 },
  minimum: 1,
  hdrMultiplier: 1.5,
};

/** What to price. Dimensions are the OUTPUT's, after any export override. */
export interface RenderSpec {
  durationSec: number;
  width: number;
  height: number;
  hdr?: boolean;
}

export interface RenderQuote {
  /** Whole credits. Always an integer — see `renderCost`. */
  credits: number;
  tier: QualityTier;
  /** Seconds actually charged for, after rounding up. */
  billedSec: number;
  /** The rate applied, for a caller that wants to explain the number. */
  perSecond: number;
}

/**
 * Price a render.
 *
 * Two rounding decisions, both deliberate:
 *
 * **Seconds round up.** Per-second billing that charges for 12.03 seconds is
 * not something a developer can predict from their own timeline, and the
 * fraction comes from frame quantisation they never asked about. Whole seconds
 * are what the pricing page can honestly say.
 *
 * **Credits are integers, and that is not cosmetic.** `balance()` sums the
 * signed deltas of every ledger row. Fractional deltas accumulate binary
 * floating-point error across thousands of rows, so a balance that should read
 * 0 reads 3.55e-15 — and `minBalanceAfter: 0`, the floor that stops an account
 * overspending, is an exact comparison. An account could sit permanently a
 * hair below zero and be unable to spend credits it demonstrably has. Rounding
 * once, here, at the boundary, keeps every stored value exact.
 */
export function renderCost(
  spec: RenderSpec,
  pricing: RenderPricing = DEFAULT_RENDER_PRICING,
): RenderQuote {
  if (!Number.isFinite(spec.durationSec) || spec.durationSec < 0)
    throw new Error(`renderCost: bad durationSec ${spec.durationSec}`);
  if (!Number.isFinite(spec.width) || !Number.isFinite(spec.height))
    throw new Error('renderCost: bad output dimensions');

  const tier = qualityTierOf(spec.width, spec.height);
  const perSecond = pricing.perSecond[tier];
  if (perSecond == null || perSecond < 0)
    throw new Error(`renderCost: no rate configured for tier ${tier}`);

  const billedSec = Math.ceil(spec.durationSec);
  const raw = billedSec * perSecond * (spec.hdr ? pricing.hdrMultiplier : 1);

  // A zero-length project bills nothing rather than the minimum: there is no
  // file at the end of it, and the minimum exists to cover work that happened.
  const credits = billedSec === 0 ? 0 : Math.max(pricing.minimum, Math.ceil(raw));

  return { credits: Math.ceil(credits), tier, billedSec, perSecond };
}

/**
 * Is this tier within the account's ceiling?
 *
 * Separate from `renderCost` on purpose. The two failures are different HTTP
 * answers — over the ceiling is 403-shaped (your plan does not include this),
 * too expensive is 402-shaped (top up) — and folding them together would force
 * one status onto both.
 */
export function withinTier(tier: QualityTier, max?: QualityTier): boolean {
  return max == null || tierRank(tier) <= tierRank(max);
}
