/** Shared constants — ratio presets and the Orbit design tokens. */
import Constants from 'expo-constants';

export interface RatioPreset {
  key: string;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export const RATIOS: RatioPreset[] = [
  // Portrait
  {
    key: '9:16',
    label: '9:16',
    hint: 'Reel / Story',
    width: 1080,
    height: 1920,
  },
  { key: '4:5', label: '4:5', hint: 'Portrait', width: 1080, height: 1350 },
  { key: '2:3', label: '2:3', hint: 'Portrait', width: 1080, height: 1620 },
  { key: '3:4', label: '3:4', hint: 'Portrait', width: 1080, height: 1440 },
  { key: '1:2', label: '1:2', hint: 'Tall', width: 1080, height: 2160 },
  // Square
  { key: '1:1', label: '1:1', hint: 'Square', width: 1080, height: 1080 },
  // Landscape
  { key: '16:9', label: '16:9', hint: 'Landscape', width: 1920, height: 1080 },
  { key: '4:3', label: '4:3', hint: 'Classic', width: 1440, height: 1080 },
  { key: '3:2', label: '3:2', hint: 'Photo', width: 1620, height: 1080 },
  { key: '2:1', label: '2:1', hint: 'Wide', width: 2160, height: 1080 },
  { key: '1.85:1', label: '1.85:1', hint: 'Film', width: 1998, height: 1080 },
  {
    key: '2.35:1',
    label: '2.35:1',
    hint: 'Cinemascope',
    width: 2538,
    height: 1080,
  },
  { key: '21:9', label: '21:9', hint: 'Cinematic', width: 2520, height: 1080 },
  { key: '42:9', label: '42:9', hint: 'Ultrawide', width: 5040, height: 1080 },
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
 * Orbit design tokens. One indigo hue over neutral light surfaces and a neutral
 * near-black editor — `accent2` is a lighter STEP of the same hue, not a second
 * colour. Token names stay stable so the editor inherits changes without
 * touching its rendering or timeline behavior.
 */
export const vela = {
  // Brand
  accent: '#5b4bff',
  action: '#5b4bff',
  accent2: '#8b83ff',
  accentDim: '#4938e8',
  accentSoft: 'rgba(91,75,255,0.14)',
  onAccent: '#ffffff',
  select: '#6b50ff',
  audio: '#2868b7',
  danger: '#ff453a',
  success: '#54be72',
  warning: '#f2a83b',
  trackText: '#7437bd',
  trackEffect: '#a66b1f',
  trackMusic: '#267747',
  trackAudio: '#2868b7',

  // Editor (dark)
  editorBg: '#0e0e11',
  bezel: '#0a0a0d',
  sheet: '#17171a',
  card: '#1c1c1f',
  card2: '#222225',
  card3: '#1a1a1d',
  emptyTrack: '#17171a',
  toolbar: '#101013',
  toolbarBorder: '#2b2b2e',
  saveTile: '#202023',
  toggleOff: '#3c3c3f',
  divider: '#2e2e31',

  // Timeline surfaces (tokenised — no more hardcoded hex in Timeline.tsx)
  clipBg: '#222225',
  wave: '#6fb1ff',
  waveSound: '#7dbf96',
  soundBlock: '#173a29',
  tickMinor: '#2e2e31',

  // Text on dark
  white: '#ffffff',
  textLight: '#f6f7fb',
  textLight2: '#d5d9e2',
  textDim: '#bdc3cf',
  muted: '#9aa2b2',
  muted2: '#7d8698',
  muted3: '#687183',
  muted4: '#596274',
  muted5: '#8d95a5',

  // App chrome (light)
  homeBg: '#f7f7fa',
  lightSurface: '#f0f0f5',
  lightCard: '#ffffff',
  ink: '#101116',
  ink2: '#181a21',
  ink3: '#5f6472',
  lightMuted: '#8e94a3',
  lightMuted2: '#a6abb7',
  lightMuted3: '#b9bdc7',
  lightBorder: '#e5e5ec',
  folderFrom: '#e9e6ff',
  folderTo: '#d8d2ff',
  folderDot: '#6b50ff',
} as const;

/**
 * Brand accent as a TONAL pair (same hue, two values) — not a two-hue gradient.
 * The previous `[accent, accent2]` was indigo→purple, the most recognizable
 * machine-made colour move there is. Prefer a solid `vela.action` fill; reach
 * for this only where a surface genuinely needs depth.
 */
export const orbitTonal = [vela.accent, vela.accentDim] as const;

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
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  float: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

/**
 * Default render-service URL.
 *
 * The simulator shares the Mac's network, so `localhost` works there — but a
 * PHYSICAL device cannot reach it, which silently breaks export, AI generation
 * and TTS on the one build you actually want to test. In a dev build Expo hands
 * us the dev machine's LAN address as `hostUri` ("192.168.1.5:8081"), so reuse
 * that host on the service port and a device works first launch with no setup.
 *
 * Resolution order: an explicit `extra.serverUrl` (set this for a deployed
 * service), then the dev host, then localhost. Settings can always override it.
 */
function defaultServer(): string {
  const extra = Constants.expoConfig?.extra as
    | { serverUrl?: string }
    | undefined;
  if (extra?.serverUrl) return extra.serverUrl;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8787`;
  return 'http://localhost:8787';
}

export const DEFAULT_SERVER = defaultServer();

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

/**
 * Where "Help & Support" actually goes.
 *
 * Orbit is open source, so its own issue tracker IS the support channel —
 * which is why this can be a real destination rather than the "coming soon"
 * alert that used to sit there. It is a constant and not a literal because the
 * product is white-label: anyone shipping their own build points these at their
 * own docs and their own inbox.
 */
export const SUPPORT_URL =
  (Constants.expoConfig?.extra as { supportUrl?: string } | undefined)?.supportUrl ||
  'https://github.com/jsonpreet/orbit/issues';
