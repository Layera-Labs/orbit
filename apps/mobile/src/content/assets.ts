/**
 * Bundled offline content packs. A small starter subset of the CDN catalog is
 * shipped inside the app binary so the library's first screen renders and can be
 * added to a project with NO network. `require()` needs static string literals,
 * so the maps below are explicit and keyed by the same OpenMoji `code` used in
 * `catalog.ts`. Bundled assets embed via expo-asset (app.json `expo-asset`
 * plugin + default `assetBundlePatterns`); the CDN remains the full catalog.
 *
 * OpenMoji emoji/stickers are CC BY-SA 4.0 — see `assets/content/README.md`.
 */
import { Asset } from 'expo-asset';
import { copyIntoMedia } from '../storage/media';

/** Bundled emoji PNGs (618px), keyed by OpenMoji code (subset of `EMOJIS`). */
export const BUNDLED_EMOJI: Record<string, number> = {
  '1F600': require('../../assets/content/emoji/1F600.png'),
  '1F602': require('../../assets/content/emoji/1F602.png'),
  '1F60D': require('../../assets/content/emoji/1F60D.png'),
  '1F60E': require('../../assets/content/emoji/1F60E.png'),
  '1F44D': require('../../assets/content/emoji/1F44D.png'),
  '1F44E': require('../../assets/content/emoji/1F44E.png'),
  '1F44F': require('../../assets/content/emoji/1F44F.png'),
  '1F4AA': require('../../assets/content/emoji/1F4AA.png'),
  '1F64F': require('../../assets/content/emoji/1F64F.png'),
  '1F44B': require('../../assets/content/emoji/1F44B.png'),
  '2764': require('../../assets/content/emoji/2764.png'),
  '1F525': require('../../assets/content/emoji/1F525.png'),
  '2B50': require('../../assets/content/emoji/2B50.png'),
  '2728': require('../../assets/content/emoji/2728.png'),
  '1F4AF': require('../../assets/content/emoji/1F4AF.png'),
  '1F389': require('../../assets/content/emoji/1F389.png'),
  '1F440': require('../../assets/content/emoji/1F440.png'),
  '1F480': require('../../assets/content/emoji/1F480.png'),
  '1F916': require('../../assets/content/emoji/1F916.png'),
  '1F44C': require('../../assets/content/emoji/1F44C.png'),
};

/** Bundled sticker PNGs (618px), keyed by OpenMoji code (subset of `STICKERS`). */
export const BUNDLED_STICKER: Record<string, number> = {
  '2728': require('../../assets/content/stickers/2728.png'),
  '2B50': require('../../assets/content/stickers/2B50.png'),
  '1F31F': require('../../assets/content/stickers/1F31F.png'),
  '26A1': require('../../assets/content/stickers/26A1.png'),
  '1F525': require('../../assets/content/stickers/1F525.png'),
  '1F4A5': require('../../assets/content/stickers/1F4A5.png'),
  '1F389': require('../../assets/content/stickers/1F389.png'),
  '1F388': require('../../assets/content/stickers/1F388.png'),
  '2764': require('../../assets/content/stickers/2764.png'),
  '1F4AF': require('../../assets/content/stickers/1F4AF.png'),
  '1F451': require('../../assets/content/stickers/1F451.png'),
  '1F48E': require('../../assets/content/stickers/1F48E.png'),
  '1F3C6': require('../../assets/content/stickers/1F3C6.png'),
  '1F308': require('../../assets/content/stickers/1F308.png'),
  '2705': require('../../assets/content/stickers/2705.png'),
  '274C': require('../../assets/content/stickers/274C.png'),
};

/**
 * Bundled sound effects (mono WAV), keyed by id (matches `SFX` in `catalog.ts`).
 * Original, synthesized in-repo — public-domain (see `assets/content/README.md`).
 */
export const BUNDLED_SFX: Record<string, number> = {
  pop: require('../../assets/content/sfx/pop.wav'),
  click: require('../../assets/content/sfx/click.wav'),
  tick: require('../../assets/content/sfx/tick.wav'),
  ding: require('../../assets/content/sfx/ding.wav'),
  beep: require('../../assets/content/sfx/beep.wav'),
  chime: require('../../assets/content/sfx/chime.wav'),
  success: require('../../assets/content/sfx/success.wav'),
  impact: require('../../assets/content/sfx/impact.wav'),
  whoosh: require('../../assets/content/sfx/whoosh.wav'),
  swoosh: require('../../assets/content/sfx/swoosh.wav'),
  riser: require('../../assets/content/sfx/riser.wav'),
};

export type BundledBg = { id: string; label: string; module: number };

/** Bundled offline image backgrounds (grained directional gradients, 1080x1920). */
export const BUNDLED_BG: BundledBg[] = [
  { id: 'bg-charcoal', label: 'Charcoal', module: require('../../assets/content/backgrounds/bg1.jpg') },
  { id: 'bg-teal', label: 'Teal', module: require('../../assets/content/backgrounds/bg2.jpg') },
  { id: 'bg-oxblood', label: 'Oxblood', module: require('../../assets/content/backgrounds/bg3.jpg') },
  { id: 'bg-ember', label: 'Ember', module: require('../../assets/content/backgrounds/bg4.jpg') },
  { id: 'bg-forest', label: 'Forest', module: require('../../assets/content/backgrounds/bg5.jpg') },
  { id: 'bg-stone', label: 'Stone', module: require('../../assets/content/backgrounds/bg6.jpg') },
];

/**
 * Resolve a bundled `require()` module to a stable media `file://` URI (offline).
 * expo-asset places bundled assets locally; `downloadAsync()` also covers the
 * dev client (where Metro serves them) by fetching to cache first.
 */
export async function resolveModuleToMedia(module: number, fallbackExt: string): Promise<string> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  const localUri = asset.localUri;
  if (!localUri) throw new Error('Bundled asset has no local URI');
  return copyIntoMedia(localUri, fallbackExt);
}
