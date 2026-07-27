/**
 * Built-in starter templates. Each is a self-contained project (background +
 * text overlays, no external media) so it opens, previews, and exports
 * immediately. Tapping one in Discover creates a new editable project from it.
 */
import type { Background, TextOverlay } from '../model/types';
import { font } from '../constants';

/** Discover section a template belongs to. */
export type TemplateCategory = 'Titles' | 'Social' | 'Music' | 'Celebrate';

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ['Titles', 'Social', 'Music', 'Celebrate'];

export interface EditorTemplate {
  id: string;
  name: string;
  tag: string;
  category: TemplateCategory;
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
    category: 'Social',
    colors: ['#1c1e26', '#464c66'],
    width: 1080,
    height: 1080,
    background: { type: 'gradient', from: '#241a12', to: '#3f2d1c', angle: 45 },
    texts: [
      t({ text: '"The best way out\nis always through."', y: 0.4, fontSize: 72, bold: true, color: '#f2e8d6' }),
      t({ text: '— Robert Frost', y: 0.62, fontSize: 40, color: '#d9b877' }),
    ],
  },
  {
    id: 'title',
    name: 'Bold Title',
    tag: 'intro',
    category: 'Titles',
    colors: ['#0f1018', '#6f74d6'],
    width: 1080,
    height: 1920,
    background: { type: 'gradient', from: '#0c0b0a', to: '#1f1810', angle: 90 },
    texts: [
      t({ text: 'YOUR\nTITLE', y: 0.36, fontSize: 130, bold: true, animation: 'fade', color: '#e3ac3d' }),
      t({ text: 'add your subtitle here', y: 0.6, fontSize: 44, color: '#cbbf9a' }),
    ],
  },
  {
    id: 'lyric',
    name: 'Lyric Video',
    tag: 'music',
    category: 'Music',
    colors: ['#141019', '#4a3566'],
    width: 1080,
    height: 1920,
    background: { type: 'gradient', from: '#160b0e', to: '#3d1620', angle: 60 },
    texts: [t({ text: 'and the words\nfade in and out', y: 0.45, fontSize: 80, bold: true, animation: 'fade', color: '#f2e2e4' })],
  },
  {
    id: 'caption',
    name: 'Caption Reel',
    tag: 'social',
    category: 'Social',
    colors: ['#121317', '#282b31'],
    width: 1080,
    height: 1920,
    background: { type: 'color', color: '#0a0a0a' },
    texts: [t({ text: 'POV: your\ncaption goes here', y: 0.78, fontSize: 76, bold: true })],
  },
  {
    id: 'birthday',
    name: 'Birthday',
    tag: 'b-day',
    category: 'Celebrate',
    colors: ['#141a2b', '#4f7fd6'],
    width: 1080,
    height: 1920,
    background: { type: 'gradient', from: '#3a1e12', to: '#c8763a', angle: 120 },
    texts: [
      t({ text: 'Happy\nBirthday!', y: 0.4, fontSize: 120, bold: true, color: '#fff3d0' }),
      t({ text: 'tap to edit', y: 0.64, fontSize: 40, color: '#ffe0c4' }),
    ],
  },
  {
    id: 'sale',
    name: 'Big Drop',
    tag: 'promo',
    category: 'Social',
    colors: ['#0d0d12', '#7b6fe0'],
    width: 1080,
    height: 1920,
    background: { type: 'color', color: '#0c0b0a' },
    texts: [
      t({ text: 'BIG\nDROP', y: 0.34, fontSize: 160, bold: true, animation: 'fade', color: '#e3ac3d' }),
      t({ text: '50% OFF · TODAY ONLY', y: 0.6, fontSize: 46, bold: true }),
    ],
  },
  {
    id: 'podcast',
    name: 'Podcast',
    tag: 'audio',
    category: 'Music',
    colors: ['#131519', '#333a3f'],
    width: 1080,
    height: 1080,
    background: { type: 'gradient', from: '#161310', to: '#2a2318', angle: 90 },
    texts: [
      t({ text: 'EPISODE 01', y: 0.3, fontSize: 40, bold: true, color: '#e3ac3d' }),
      t({ text: 'The title of\nthis episode', y: 0.5, fontSize: 72, bold: true }),
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    tag: 'clean',
    category: 'Titles',
    colors: ['#121316', '#272a2e'],
    width: 1080,
    height: 1920,
    background: { type: 'color', color: '#0f0d0b' },
    texts: [t({ text: 'less,\nbut better', y: 0.46, fontSize: 92, bold: true, color: '#ece4d4' })],
  },
];
