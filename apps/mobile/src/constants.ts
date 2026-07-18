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
 * Orbit design tokens. One signature palette: a deep teal primary + warm gold
 * used strictly for editing-selection, on warm near-black surfaces. Purple and
 * blue are retired. Token NAMES are kept stable so existing call sites inherit
 * the new values; only the values change.
 *
 * Roles (one meaning each): `accent`/`action` (teal) = primary action + "option
 * ON"; `select` (gold) = clip selected for editing. Text on a teal fill uses
 * `onAccent` (dark ink), since teal is a light-valued accent.
 */
export const vela = {
  // Brand — teal signature + complementary gold
  accent: '#16a58f', // teal — primary brand / active / all CTAs
  action: '#16a58f', // teal — same primary (blue retired)
  accentDim: '#0e7d70', // deeper teal — pressed / audio track
  accentSoft: 'rgba(22,165,143,0.14)', // low-opacity teal tint
  onAccent: '#042420', // dark ink for text/icons on a teal fill
  select: '#f2c14e', // gold — selected clip / filmstrip border (editing only)
  audio: '#0e7d70', // audio track fill (deep teal)
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
  wave: '#4fcbb8', // audio waveform (teal)
  waveSound: '#e2c56b', // sound waveform (gold)
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
  folderFrom: '#cbe8e1',
  folderTo: '#a6d7cc',
  folderDot: '#16a58f',
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

/**
 * Legacy `theme` object — kept as a thin alias over the Orbit tokens so the two
 * screens still reading `theme.*` (QuickGenerate, NewProjectModal) render the
 * warm-teal system, not the old slate, until their bespoke reskin. Prefer
 * importing `vela`/`sp`/`r`/`elev` directly in new code.
 */
export const theme = {
  bg: vela.editorBg,
  surface: vela.card,
  surface2: vela.sheet,
  text: vela.textLight,
  subtext: vela.muted,
  muted: vela.muted2,
  accent: vela.accent,
  accentText: vela.onAccent,
  danger: vela.danger,
  border: vela.divider,
  editorBg: vela.editorBg,
  track: vela.clipBg,
  trackBorder: vela.toolbarBorder,
  font,
  mono,
  vela,
};

/** Default render-service URL (sim shares the Mac's network on localhost). */
export const DEFAULT_SERVER = 'http://localhost:8787';
