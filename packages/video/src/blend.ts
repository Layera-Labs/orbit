/**
 * Blend-mode maps shared by preview and export. One `BlendMode` resolves to a
 * Skia blend mode (live preview) and an ffmpeg `blend=all_mode` (export), kept
 * in lock-step so a "screen" layer looks the same live as in the rendered MP4.
 */
import type { BlendMode } from './types';

/** ffmpeg `blend` filter `all_mode` value, or null for normal (plain over). */
export function blendToFFmpeg(mode: BlendMode | undefined): string | null {
  switch (mode) {
    case 'multiply': return 'multiply';
    case 'screen': return 'screen';
    case 'overlay': return 'overlay';
    case 'darken': return 'darken';
    case 'lighten': return 'lighten';
    case 'difference': return 'difference';
    case 'add': return 'addition';
    default: return null; // 'normal' / undefined
  }
}

/** Skia `BlendMode` prop value, or null for normal. */
export function blendToSkia(mode: BlendMode | undefined): string | null {
  switch (mode) {
    case 'multiply': return 'multiply';
    case 'screen': return 'screen';
    case 'overlay': return 'overlay';
    case 'darken': return 'darken';
    case 'lighten': return 'lighten';
    case 'difference': return 'difference';
    case 'add': return 'plus';
    default: return null;
  }
}

export const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'add'];
