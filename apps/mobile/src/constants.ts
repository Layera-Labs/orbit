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

export const theme = {
  bg: '#0b1120',
  surface: '#1e293b',
  surface2: '#0f172a',
  text: '#f8fafc',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#10b981',
  accentText: '#06281f',
  danger: '#f87171',
  border: '#334155',
  // CapCut-style editor palette: near-black canvas, gray track bars.
  editorBg: '#0a0a0c',
  track: '#2c2c31',
  trackBorder: '#1c1c20',
};

/** Default render-service URL (sim shares the Mac's network on localhost). */
export const DEFAULT_SERVER = 'http://localhost:8787';
