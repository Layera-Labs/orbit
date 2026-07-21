/** Shared constants — ratio presets and the Orbit design tokens. */

export interface RatioPreset {
  key: string;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export const RATIOS: RatioPreset[] = [
  { key: '9:16', label: '9:16', hint: 'Reel / Story', width: 1080, height: 1920 },
  { key: '1:1', label: '1:1', hint: 'Square', width: 1080, height: 1080 },
  { key: '4:5', label: '4:5', hint: 'Portrait', width: 1080, height: 1350 },
  { key: '2:3', label: '2:3', hint: 'Portrait', width: 1080, height: 1620 },
  { key: '16:9', label: '16:9', hint: 'Landscape', width: 1920, height: 1080 },
];

export function ratioLabel(width: number, height: number): string {
  const found = RATIOS.find((r) => r.width === width && r.height === height);
  if (found) return found.label;
  return `${width}×${height}`;
}

/**
 * Font families (from @expo-google-fonts). Loaded in App.tsx via useFonts;
 * the keys here MUST match the export names of those packages.
 */
export const font = {
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extrabold: 'HankenGrotesk_800ExtraBold',
} as const;

export const mono = {
  regular: 'JetBrainsMono_400Regular',
  medium: 'JetBrainsMono_500Medium',
  bold: 'JetBrainsMono_700Bold',
} as const;

/**
 * Orbit design tokens. One signature palette: a warm gold accent on warm
 * near-black surfaces (gold + black). Purple, blue and teal are retired. Token
 * NAMES are kept stable so existing call sites inherit the new values.
 *
 * One gold does every job — primary action, "option ON", and editing-selection
 * (`accent`/`action`/`select` are the same gold). Text/icons on a gold fill use
 * `onAccent` (near-black ink), since gold is a light-valued accent.
 */
export const vela = {
  // Brand — gold on black
  accent: '#e3ac3d', // gold — primary brand / active / all CTAs / selection
  action: '#e3ac3d', // gold — same primary
  accentDim: '#b98a2b', // deeper gold — pressed
  accentSoft: 'rgba(227,172,61,0.16)', // low-opacity gold tint
  onAccent: '#1c1503', // near-black ink for text/icons on a gold fill
  select: '#e3ac3d', // gold — selected clip / filmstrip border
  audio: '#a9812c', // audio track fill (deep gold)
  danger: '#ff453a',

  // Editor (dark) — warm near-black, 3-step elevation ladder
  editorBg: '#0c0b0a',
  bezel: '#080706',
  sheet: '#161512',
  card: '#1b1916',
  card2: '#252220',
  card3: '#1e1c18',
  emptyTrack: '#171512',
  toolbar: '#100e0c',
  toolbarBorder: '#1c1a16',
  saveTile: '#252220',
  toggleOff: '#3a3630',
  divider: '#2a2620',

  // Timeline surfaces (tokenised — no more hardcoded hex in Timeline.tsx)
  clipBg: '#221f1b',
  wave: '#edc258', // audio waveform (gold)
  waveSound: '#c9b078', // sound waveform (muted gold)
  soundBlock: '#2a2617',
  tickMinor: '#2a2620',

  // Text on dark — warm neutral ramp
  white: '#ffffff',
  textLight: '#ece9e3',
  textLight2: '#c9c5bc',
  textDim: '#cbc7bf',
  muted: '#9b968c',
  muted2: '#7b766c',
  muted3: '#6b665d',
  muted4: '#605b52',
  muted5: '#8b867c',

  // Home (light) — warm tinted off-white (not the UI-kit slop gray)
  homeBg: '#f7f6f2',
  lightSurface: '#edeae3',
  lightCard: '#fffefb',
  ink: '#14120f',
  ink2: '#1b1815',
  ink3: '#47433b',
  lightMuted: '#9b968c',
  lightMuted2: '#a9a49a',
  lightMuted3: '#b4afa5',
  lightBorder: '#e6e2d9',
  folderFrom: '#f0e2bf',
  folderTo: '#e6d199',
  folderDot: '#e3ac3d',
} as const;

/** Spacing scale (px). */
export const sp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

/** Corner-radius scale (px). */
export const r = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/**
 * Elevation — tight, directional (downward), dark-tinted shadows. Not a fat
 * all-around bloom; most surfaces stay flat and lift with tone + a self-colored
 * edge instead. Spread as `...elev.float` into a style.
 */
export const elev = {
  card: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  float: { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
} as const;

/** Default render-service URL (sim shares the Mac's network on localhost). */
export const DEFAULT_SERVER = 'http://localhost:8787';

/**
 * Require login/register before AI generation + credits. Set false only for a
 * local dev server running without auth (ORBIT_AUTH_PROVIDER unset), where the
 * anonymous account is used instead. The editor is always usable logged-out.
 */
export const AUTH_ENABLED = true;

/**
 * RevenueCat public SDK keys (per platform), for buying credit packs. Empty until
 * you configure RevenueCat — while empty, the SDK is never loaded and the
 * Buy-credits UI shows a "not available yet" state. Fill these in, add the
 * `react-native-purchases` config plugin, and rebuild the dev client to enable.
 */
export const REVENUECAT_API_KEY = { ios: '', android: '' } as const;
