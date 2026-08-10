import { PexelsProvider } from "@layera-labs/orbit-assets";
import type { AssetProvider } from "@layera-labs/orbit-shared";
import { openverseProvider } from "./openverse.js";

/**
 * Stock search, in TWO slots, because the pipeline needs two.
 *
 * `pickAsset` filters on the asset's own `type`, so a provider is only ever
 * good for one kind: a photos search asked for video returns nothing and every
 * scene fails, and a videos search asked for stills does the same in reverse.
 * That is why `GenerateDeps` has `provider` AND an optional `videoProvider`
 * rather than one provider with a mode on it, and it is why there are two
 * functions here rather than one with a mode argument.
 */

/**
 * The STILLS slot. Always present — a generation never fails for want of a key.
 *
 * Openverse by DEFAULT, because it answers anonymously: a self-hosted Orbit
 * generates video the moment it has a language model, with no stock account to
 * register and nothing to put in an env file.
 *
 * `PEXELS_API_KEY` upgrades the corpus (Openverse is CC0-only, which is a small
 * pool), and the mode is `photos` — not a preference, a requirement of the slot.
 * This used to hand back a VIDEOS-mode provider whenever a key was set, which
 * did not merely fail to deliver footage: it put a video search in the stills
 * slot, so `pickAsset` filtered every result out and setting the key BROKE
 * generation on a box that worked without it.
 */
export function openverseOrPexels(
  env: NodeJS.ProcessEnv = process.env,
): AssetProvider {
  // Truthiness, not `??` — compose passes an empty string for an unset variable.
  const key = env.PEXELS_API_KEY?.trim();
  if (!key) return openverseProvider();
  return new PexelsProvider(key, "photos");
}

/**
 * The FOOTAGE slot, or nothing.
 *
 * Undefined is a real answer and the pipeline is built for it: `story`,
 * `listicle` and `split` ask for `visualKind: 'video'`, and without this they
 * fall back to stills and say so (`visualsDowngraded`, `fillerSkipped`) rather
 * than failing a generation somebody has already paid for. So this must stay
 * optional — a box that generated yesterday with no stock key generates today.
 *
 * It needs a key, and there is no no-key fallback to offer: Openverse indexes
 * images and audio only, with no video corpus behind it at all, so the free
 * default cannot serve this slot even in principle. `PEXELS_API_KEY` is the
 * whole switch, and `/health` reports `capabilities.stockVideo` so an operator
 * can see which side of it this box is on without reading a generation's
 * result.
 */
export function stockVideoProvider(
  env: NodeJS.ProcessEnv = process.env,
): AssetProvider | undefined {
  const key = env.PEXELS_API_KEY?.trim();
  if (!key) return undefined;
  return new PexelsProvider(key, "videos");
}
