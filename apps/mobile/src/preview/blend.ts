/**
 * Blend-mode → Skia blend name (preview side) — VENDORED from
 * `packages/video/src/blend.ts`. Keep in sync with the engine map.
 */
import type { BlendMode } from '../model/types';

type SkiaBlend = 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference' | 'plus';

export function blendToSkia(mode: BlendMode | undefined): SkiaBlend | undefined {
  switch (mode) {
    case 'multiply': return 'multiply';
    case 'screen': return 'screen';
    case 'overlay': return 'overlay';
    case 'darken': return 'darken';
    case 'lighten': return 'lighten';
    case 'difference': return 'difference';
    case 'add': return 'plus';
    default: return undefined;
  }
}
