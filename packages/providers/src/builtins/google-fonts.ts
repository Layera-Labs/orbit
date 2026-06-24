import type { FontItem, FontListOptions, FontProvider } from '../types';

const POPULAR: FontItem[] = [
  { family: 'Inter', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Roboto', category: 'sans-serif', weights: [400, 700] },
  { family: 'Open Sans', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Montserrat', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Poppins', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Lato', category: 'sans-serif', weights: [400, 700] },
  { family: 'Playfair Display', category: 'serif', weights: [400, 700] },
  { family: 'Merriweather', category: 'serif', weights: [400, 700] },
  { family: 'Lora', category: 'serif', weights: [400, 700] },
  { family: 'Oswald', category: 'sans-serif', weights: [400, 700] },
  { family: 'Raleway', category: 'sans-serif', weights: [400, 700] },
  { family: 'Bebas Neue', category: 'display', weights: [400] },
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 700] },
  { family: 'Pacifico', category: 'handwriting', weights: [400] },
  { family: 'Caveat', category: 'handwriting', weights: [400, 700] },
  { family: 'Source Code Pro', category: 'monospace', weights: [400, 700] },
];

/**
 * Google Fonts provider. Loading injects a stylesheet <link> (browser only).
 * A curated popular list is used for `list()`; supply a Google Fonts API key
 * implementation for the full catalog.
 */
export class GoogleFontProvider implements FontProvider {
  readonly id = 'google-fonts';
  readonly kind = 'font' as const;
  private loaded = new Set<string>();

  async list(options?: FontListOptions): Promise<FontItem[]> {
    const q = options?.query?.toLowerCase().trim();
    let items = POPULAR;
    if (options?.category) items = items.filter((f) => f.category === options.category);
    if (q) items = items.filter((f) => f.family.toLowerCase().includes(q));
    return items;
  }

  async load(family: string, weights: number[] = [400, 700]): Promise<void> {
    if (typeof document === 'undefined' || this.loaded.has(family)) return;
    this.loaded.add(family);
    const spec = `${family.replace(/ /g, '+')}:wght@${weights.join(';')}`;
    const href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    // Best-effort: wait for the font to be ready if the API is available.
    if ('fonts' in document) {
      try {
        await (document as Document & { fonts: FontFaceSet }).fonts.load(`16px "${family}"`);
      } catch {
        /* ignore */
      }
    }
  }
}
