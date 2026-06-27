/**
 * Built-in starter templates. Each is a self-contained project (background +
 * text overlays, no external media) so it opens, previews, and exports
 * immediately. Tapping one in Discover creates a new editable project from it.
 */
import type { Background, TextOverlay } from '../model/types';
import { font } from '../constants';

export interface EditorTemplate {
  id: string;
  name: string;
  tag: string;
  /** Discover card gradient. */
  colors: readonly [string, string];
  width: number;
  height: number;
  background: Background;
  /** Overlay factories — ids are assigned when the project is built. */
  texts: Omit<TextOverlay, 'id' | 'type'>[];
}

const t = (o: Partial<TextOverlay> & Pick<TextOverlay, 'text' | 'y' | 'fontSize'>): Omit<TextOverlay, 'id' | 'type'> => ({
  start: 0,
  end: 5,
  x: 0.5,
  color: '#ffffff',
  align: 'center',
  fontFamily: font.bold,
  ...o,
});

export const BUILTIN_TEMPLATES: EditorTemplate[] = [
  {
    id: 'quote',
    name: 'Quote Card',
    tag: 'quote',
    colors: ['#6a5a7a', '#c8a0b0'],
    width: 1080,
    height: 1080,
    background: { type: 'gradient', from: '#3a2e4a', to: '#7d5a8c', angle: 45 },
    texts: [
      t({ text: '"The best way out\nis always through."', y: 0.4, fontSize: 72, bold: true }),
      t({ text: '— Robert Frost', y: 0.62, fontSize: 40, color: '#e8d8f0' }),
    ],
  },
  {
    id: 'title',
    name: 'Bold Title',
    tag: 'intro',
    colors: ['#1e2a3a', '#2f7bff'],
    width: 1080,
    height: 1920,
    background: { type: 'gradient', from: '#0c1830', to: '#1f3a7a', angle: 90 },
    texts: [
      t({ text: 'YOUR\nTITLE', y: 0.36, fontSize: 130, bold: true, animation: 'fade' }),
      t({ text: 'add your subtitle here', y: 0.6, fontSize: 44, color: '#a8c4ff' }),
    ],
  },
  {
    id: 'lyric',
    name: 'Lyric Video',
    tag: 'music',
    colors: ['#2a1a3a', '#6d4aff'],
    width: 1080,
    height: 1920,
    background: { type: 'gradient', from: '#15101f', to: '#3a2466', angle: 60 },
    texts: [t({ text: 'and the words\nfade in and out', y: 0.45, fontSize: 80, bold: true, animation: 'fade' })],
  },
  {
    id: 'caption',
    name: 'Caption Reel',
    tag: 'social',
    colors: ['#1a1a1a', '#4a4030'],
    width: 1080,
    height: 1920,
    background: { type: 'color', color: '#0a0a0a' },
    texts: [t({ text: 'POV: your\ncaption goes here', y: 0.78, fontSize: 76, bold: true })],
  },
  {
    id: 'birthday',
    name: 'Birthday',
    tag: 'b-day',
    colors: ['#b07a4e', '#e0a878'],
    width: 1080,
    height: 1920,
    background: { type: 'gradient', from: '#7a2e5a', to: '#e0708c', angle: 120 },
    texts: [
      t({ text: 'Happy\nBirthday!', y: 0.4, fontSize: 120, bold: true, color: '#fff3d0' }),
      t({ text: 'tap to edit', y: 0.64, fontSize: 40, color: '#ffe0e8' }),
    ],
  },
];
