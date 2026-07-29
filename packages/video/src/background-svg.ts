/**
 * Render a project background to a full-frame SVG, used as the base image when
 * a project has no visual clip (e.g. lyric/quote videos over a color/gradient).
 * Rasterized by resvg, same as overlays.
 */
import type { Background } from './types';
import { col, num as n } from './svg';

export function backgroundToSVG(bg: Background, width: number, height: number): string {
  const box = `width="${n(width, 1)}" height="${n(height, 1)}"`;
  if (bg.type === 'gradient') {
    const angle = Number.isFinite(Number(bg.angle)) ? Number(bg.angle) : 180;
    const rad = (angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const x1 = (0.5 - dx / 2).toFixed(3);
    const y1 = (0.5 - dy / 2).toFixed(3);
    const x2 = (0.5 + dx / 2).toFixed(3);
    const y2 = (0.5 + dy / 2).toFixed(3);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" ${box}>` +
      `<defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      `<stop offset="0%" stop-color="${col(bg.from)}"/><stop offset="100%" stop-color="${col(bg.to)}"/>` +
      `</linearGradient></defs><rect ${box} fill="url(#g)"/></svg>`
    );
  }
  const color = bg.type === 'color' ? bg.color : '#111111';
  return `<svg xmlns="http://www.w3.org/2000/svg" ${box}><rect ${box} fill="${col(color, '#111111')}"/></svg>`;
}
