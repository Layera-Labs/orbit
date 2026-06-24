/**
 * Render a project background to a full-frame SVG, used as the base image when
 * a project has no visual clip (e.g. lyric/quote videos over a color/gradient).
 * Rasterized by resvg, same as overlays.
 */
import type { Background } from './types';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function backgroundToSVG(bg: Background, width: number, height: number): string {
  const box = `width="${width}" height="${height}"`;
  if (bg.type === 'gradient') {
    const rad = ((bg.angle ?? 180) * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const x1 = (0.5 - dx / 2).toFixed(3);
    const y1 = (0.5 - dy / 2).toFixed(3);
    const x2 = (0.5 + dx / 2).toFixed(3);
    const y2 = (0.5 + dy / 2).toFixed(3);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" ${box}>` +
      `<defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      `<stop offset="0%" stop-color="${esc(bg.from)}"/><stop offset="100%" stop-color="${esc(bg.to)}"/>` +
      `</linearGradient></defs><rect ${box} fill="url(#g)"/></svg>`
    );
  }
  const color = bg.type === 'color' ? bg.color : '#111111';
  return `<svg xmlns="http://www.w3.org/2000/svg" ${box}><rect ${box} fill="${esc(color)}"/></svg>`;
}
