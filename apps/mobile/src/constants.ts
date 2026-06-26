/** Shared constants — ratio presets and the dark theme palette. */

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
 * Vela font families (from @expo-google-fonts). Loaded in App.tsx via useFonts;
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

/** Exact Vela design tokens (Vela.dc.html). */
export const vela = {
  // Brand
  accent: '#6d4aff', // purple — primary brand / active
  action: '#2f7bff', // blue — sliders, export CTA
  select: '#f2c14e', // yellow — selected clip / filmstrip border
  audio: '#6d2ad6', // audio track fill
  danger: '#ff3b30',

  // Editor (dark)
  editorBg: '#0b0b0d',
  bezel: '#0a0a0c',
  sheet: '#161619',
  card: '#1c1c22',
  card2: '#26262d',
  card3: '#1f1f24',
  emptyTrack: '#1a1a1f',
  toolbar: '#0e0e11',
  toolbarBorder: '#18181c',
  saveTile: '#26262b',
  toggleOff: '#3a3a42',
  divider: '#2e2e36',

  // Text on dark
  white: '#ffffff',
  textLight: '#e6e6ea',
  textLight2: '#c8c8cf',
  textDim: '#cfcfd6',
  muted: '#9a9aa2',
  muted2: '#7a7a82',
  muted3: '#6a6a72',
  muted4: '#5e5e68',
  muted5: '#8a8a93',

  // Home (light)
  homeBg: '#f6f6f8',
  lightSurface: '#ececef',
  lightCard: '#ffffff',
  ink: '#111111',
  ink2: '#16161a',
  ink3: '#44444c',
  lightMuted: '#9a9aa2',
  lightMuted2: '#a8a8b0',
  lightMuted3: '#b3b3ba',
  lightBorder: '#e6e6ea',
  folderFrom: '#bfe0ff',
  folderTo: '#9fc8ff',
  folderDot: '#9fc8ff',
} as const;

/**
 * Theme palette. Top-level keys are the legacy names many components already use
 * (accent now repointed to the Vela purple). `theme.vela` holds the full Vela
 * token set lifted verbatim from Vela.dc.html — use these for the reskin.
 */
export const theme = {
  bg: '#0b1120',
  surface: '#1e293b',
  surface2: '#0f172a',
  text: '#f8fafc',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#6d4aff',
  accentText: '#ffffff',
  danger: '#ff3b30',
  border: '#334155',
  // CapCut-style editor palette: near-black canvas, gray track bars.
  editorBg: '#0a0a0c',
  track: '#2c2c31',
  trackBorder: '#1c1c20',
  font,
  mono,
  vela,
};

/** Default render-service URL (sim shares the Mac's network on localhost). */
export const DEFAULT_SERVER = 'http://localhost:8787';
