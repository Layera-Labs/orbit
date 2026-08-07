import { PexelsProvider } from "@orbit/assets";
import type { AssetProvider } from "@orbit/shared";
import { openverseProvider } from "./openverse.js";

/**
 * Which stock library a generation searches.
 *
 * Openverse by DEFAULT, because it answers anonymously: a self-hosted Orbit
 * generates video the moment it has a language model, with no stock account to
 * register and nothing to put in an env file. The cost is that Openverse
 * indexes no video, so every scene is a still — which the story format is built
 * for, since it puts an alternating slow push on every clip.
 *
 * `PEXELS_API_KEY` upgrades it, and the mode is a deliberate choice rather than
 * a default: `videos` is what makes generated output stop looking like a
 * slideshow, and it is the whole reason to bother with a key.
 */
export function openverseOrPexels(
  env: NodeJS.ProcessEnv = process.env,
): AssetProvider {
  // Truthiness, not `??` — compose passes an empty string for an unset variable.
  const key = env.PEXELS_API_KEY?.trim();
  if (!key) return openverseProvider();
  return new PexelsProvider(key, env.ORBIT_STOCK_MODE === "photos" ? "photos" : "videos");
}
