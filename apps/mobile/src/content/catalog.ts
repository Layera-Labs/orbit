/**
 * Content library catalog (hybrid sourcing): background presets are pure data
 * (offline); emoji/sticker assets come from a CDN, cached into the project media
 * on use, with a small bundled starter set for offline. See `library.ts` for the
 * add path and `content/assets.ts` for the CDN/bundled resolution.
 */
import type { Background } from '../model/types';

export type BgPreset = { id: string; label: string; bg: Background };

/** Curated gradients — rendered identically by the engine (backgroundToSVG). */
export const GRADIENT_PRESETS: BgPreset[] = [
  { id: 'sunset', label: 'Sunset', bg: { type: 'gradient', from: '#ff7e5f', to: '#feb47b', angle: 135 } },
  { id: 'ocean', label: 'Ocean', bg: { type: 'gradient', from: '#2193b0', to: '#6dd5ed', angle: 135 } },
  { id: 'grape', label: 'Grape', bg: { type: 'gradient', from: '#6a11cb', to: '#2575fc', angle: 135 } },
  { id: 'peach', label: 'Peach', bg: { type: 'gradient', from: '#ffecd2', to: '#fcb69f', angle: 135 } },
  { id: 'mint', label: 'Mint', bg: { type: 'gradient', from: '#00b09b', to: '#96c93d', angle: 135 } },
  { id: 'candy', label: 'Candy', bg: { type: 'gradient', from: '#ff9a9e', to: '#fecfef', angle: 135 } },
  { id: 'night', label: 'Night', bg: { type: 'gradient', from: '#0f2027', to: '#2c5364', angle: 135 } },
  { id: 'ember', label: 'Ember', bg: { type: 'gradient', from: '#f83600', to: '#f9d423', angle: 135 } },
  { id: 'violet', label: 'Violet', bg: { type: 'gradient', from: '#c471f5', to: '#fa71cd', angle: 135 } },
  { id: 'sky', label: 'Sky', bg: { type: 'gradient', from: '#a1c4fd', to: '#c2e9fb', angle: 135 } },
  { id: 'lush', label: 'Lush', bg: { type: 'gradient', from: '#56ab2f', to: '#a8e063', angle: 135 } },
  { id: 'plum', label: 'Plum', bg: { type: 'gradient', from: '#42275a', to: '#734b6d', angle: 135 } },
];

// ---- Image backgrounds (sample set; users can also pick their own photo) ----

const BG_SEEDS = ['peaks', 'forest', 'shore', 'dusk', 'bloom', 'aurora', 'sand', 'city'];
/** Sample background images (stable Picsum seeds). `thumb` for the grid, `full` for the canvas. */
export const BG_IMAGES: { id: string; thumb: string; full: string }[] = BG_SEEDS.map((seed) => ({
  id: seed,
  thumb: `https://picsum.photos/seed/orbitbg-${seed}/200/356`,
  full: `https://picsum.photos/seed/orbitbg-${seed}/1080/1920`,
}));

/*
 * The Stock tab's Picsum starter set lived here. It existed because stock
 * search was bring-your-own-key and the tab was otherwise an empty rectangle
 * under a search field — twelve placeholder photographs standing in for
 * content. `content/openverse.ts` answers that properly now, with CC0 content
 * and no key, so the placeholders are gone rather than sitting behind a tab
 * that claims a licence they were never under.
 */

// ---- Emojis (OpenMoji, CC BY-SA 4.0) — crisp 618px PNGs via jsDelivr --------

const OPENMOJI = 'https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@15.0.0/color';
/** OpenMoji image URL for a hex code (uppercase, FE0F dropped). `size`: 72 | 618. */
export function openmojiUrl(code: string, size: 72 | 618 = 618): string {
  return `${OPENMOJI}/${size}x${size}/${code}.png`;
}

/** Curated emoji set — [hexcode, label]. Codes are OpenMoji filenames. */
export const EMOJIS: { code: string; label: string }[] = [
  ['1F600', 'grinning'], ['1F602', 'joy'], ['1F60D', 'heart eyes'], ['1F60E', 'cool'],
  ['1F618', 'kiss'], ['1F970', 'smiling hearts'], ['1F929', 'star struck'], ['1F914', 'thinking'],
  ['1F644', 'eye roll'], ['1F62D', 'sob'], ['1F621', 'rage'], ['1F925', 'lying'],
  ['1F634', 'sleeping'], ['1F971', 'yawn'], ['1F92F', 'mind blown'], ['1F973', 'party'],
  ['1F60F', 'smirk'], ['1F97A', 'pleading'], ['1F44D', 'thumbs up'], ['1F44E', 'thumbs down'],
  ['1F44F', 'clap'], ['1F64C', 'raised hands'], ['1F4AA', 'muscle'], ['1F64F', 'pray'],
  ['1F44B', 'wave'], ['270C', 'victory'], ['1F918', 'rock on'], ['1F91D', 'handshake'],
  ['2764', 'red heart'], ['1F9E1', 'orange heart'], ['1F49B', 'yellow heart'], ['1F49A', 'green heart'],
  ['1F499', 'blue heart'], ['1F49C', 'purple heart'], ['1F494', 'broken heart'], ['1F525', 'fire'],
  ['2B50', 'star'], ['2728', 'sparkles', ], ['1F4A5', 'boom'], ['1F4AF', '100'],
  ['1F389', 'tada'], ['1F38A', 'confetti'], ['1F381', 'gift'], ['1F380', 'ribbon'],
  ['1F44C', 'ok'], ['1F440', 'eyes'], ['1F921', 'clown'], ['1F480', 'skull'],
  ['1F47B', 'ghost'], ['1F916', 'robot'], ['1F63A', 'cat'], ['1F436', 'dog'],
  ['1F984', 'unicorn'], ['1F308', 'rainbow'], ['2600', 'sun'], ['1F327', 'rain'],
  ['1F340', 'clover'], ['1F339', 'rose'], ['1F355', 'pizza'], ['1F354', 'burger'],
  ['1F382', 'cake'], ['2615', 'coffee'], ['1F37A', 'beer'], ['1F3C6', 'trophy'],
].map(([code, label]) => ({ code, label }));

/** Curated sticker/graphic set (OpenMoji symbols + objects) — [hexcode, label]. */
export const STICKERS: { code: string; label: string }[] = [
  ['2728', 'sparkles'], ['2B50', 'star'], ['1F31F', 'glow star'], ['1F4AB', 'dizzy'],
  ['26A1', 'bolt'], ['1F525', 'fire'], ['1F4A5', 'boom'], ['1F4A2', 'anger'],
  ['1F389', 'tada'], ['1F38A', 'confetti'], ['1F388', 'balloon'], ['1F381', 'gift'],
  ['2764', 'heart'], ['1F496', 'sparkle heart'], ['1F495', 'two hearts'], ['1F498', 'cupid'],
  ['1F4AF', '100'], ['1F451', 'crown'], ['1F48E', 'gem'], ['1F3C6', 'trophy'],
  ['1F947', 'gold medal'], ['1F308', 'rainbow'], ['2600', 'sun'], ['2B50', 'star2'],
  ['1F319', 'moon'], ['2601', 'cloud'], ['1F4A7', 'droplet'], ['2744', 'snowflake'],
  ['1F3B5', 'note'], ['1F3B6', 'notes'], ['1F4F8', 'camera'], ['1F3AC', 'clapper'],
  ['1F4AC', 'speech'], ['1F4AD', 'thought'], ['1F4A1', 'idea'], ['1F514', 'bell'],
  ['2705', 'check'], ['274C', 'cross'], ['2757', 'bang'], ['2753', 'question'],
  ['27A1', 'arrow'], ['1F44B', 'wave'], ['1F440', 'eyes'], ['1F44D', 'thumbs up'],
  ['1F339', 'rose'], ['1F338', 'blossom'], ['1F340', 'clover'], ['1F984', 'unicorn'],
].map(([code, label]) => ({ code, label }));

/**
 * Bundled sound effects — a small original starter pack (synthesized in-repo,
 * public-domain). Ids match `BUNDLED_SFX` in `content/assets.ts`; `dur` seconds
 * is used to size the timeline clip. All are offline/bundled (no CDN).
 */
export type SfxItem = { id: string; label: string; dur: number };
export const SFX: SfxItem[] = [
  { id: 'pop', label: 'Pop', dur: 0.14 },
  { id: 'click', label: 'Click', dur: 0.05 },
  { id: 'tick', label: 'Tick', dur: 0.03 },
  { id: 'ding', label: 'Ding', dur: 0.6 },
  { id: 'beep', label: 'Beep', dur: 0.16 },
  { id: 'chime', label: 'Chime', dur: 0.55 },
  { id: 'success', label: 'Success', dur: 0.6 },
  { id: 'impact', label: 'Impact', dur: 0.4 },
  { id: 'whoosh', label: 'Whoosh', dur: 0.5 },
  { id: 'swoosh', label: 'Swoosh', dur: 0.22 },
  { id: 'riser', label: 'Riser', dur: 0.7 },
];

/** Solid colour palette. */
export const SOLID_PRESETS: BgPreset[] = [
  '#000000', '#ffffff', '#101018', '#1f2933', '#6d4aff', '#2f7bff', '#15b8a6', '#f2c14e', '#ff6b6b', '#ff8fab', '#c04af0', '#0e7c66',
].map((c) => ({ id: `solid-${c}`, label: c, bg: { type: 'color', color: c } as Background }));
