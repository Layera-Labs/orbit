import type {
  BackgroundItem,
  BackgroundListOptions,
  BackgroundProvider,
} from '../types';

const SOLIDS = [
  '#ffffff', '#000000', '#f9fafb', '#111827', '#4f46e5', '#0ea5e9',
  '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
];

const GRADIENTS: Record<string, string> = {
  Sunset: 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
  Ocean: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)',
  Midnight: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
  Berry: 'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)',
  Citrus: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  Mint: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
};

/** Zero-config background library: solid swatches + preset gradients. */
export class PresetBackgroundProvider implements BackgroundProvider {
  readonly id = 'preset-backgrounds';
  readonly kind = 'background' as const;

  async list(options?: BackgroundListOptions): Promise<BackgroundItem[]> {
    const items: BackgroundItem[] = [];
    if (!options?.type || options.type === 'solid') {
      for (const color of SOLIDS) {
        items.push({ id: `solid-${color}`, type: 'solid', value: color, thumbnail: color });
      }
    }
    if (!options?.type || options.type === 'gradient') {
      for (const [name, css] of Object.entries(GRADIENTS)) {
        items.push({ id: `gradient-${name}`, type: 'gradient', value: css, thumbnail: css });
      }
    }
    return items;
  }
}
