/**
 * Render a project background to a full-frame SVG, used as the base image when
 * a project has no visual clip (e.g. lyric/quote videos over a color/gradient).
 * Rasterized by resvg, same as overlays.
 */
import type { Background } from './types';
import { col, num as n } from './svg';

/**
 * A gradient's two endpoints as fractions of the box, from its angle.
 *
 * Exported because the canvas frame paints the same gradient outside its
 * rounded outer edge, and a second copy of this arithmetic is exactly how the
 * card's corners would come to disagree with the background behind them.
 * 0deg runs bottom-to-top; the default 180 runs top-to-bottom.
 */
export function gradientEnds(angle: number | undefined): {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
} {
  const a = Number.isFinite(Number(angle)) ? Number(angle) : 180;
  const rad = (a * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  return {
    x1: (0.5 - dx / 2).toFixed(3),
    y1: (0.5 - dy / 2).toFixed(3),
    x2: (0.5 + dx / 2).toFixed(3),
    y2: (0.5 + dy / 2).toFixed(3),
  };
}

export function backgroundToSVG(bg: Background, width: number, height: number): string {
  const box = `width="${n(width, 1)}" height="${n(height, 1)}"`;
  if (bg.type === 'gradient') {
    const { x1, y1, x2, y2 } = gradientEnds(bg.angle);
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
