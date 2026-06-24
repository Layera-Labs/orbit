import { describe, expect, it } from 'vitest';
import type { Background, Element, Page } from '@orbit/model';
import { exportPageToSVG, svgStringToBlob } from '../svg-export';

/** Build an element with sensible BaseElement defaults; extra fields override. */
function mk(partial: { type: Element['type'] } & Record<string, unknown>): Element {
  return {
    id: 'e',
    name: '',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    ...partial,
  } as unknown as Element;
}

function pg(
  children: Element[],
  background: Background = { type: 'solid', color: '#ffffff' },
): Page {
  return { id: 'p', width: 400, height: 300, background, children };
}

describe('exportPageToSVG', () => {
  it('emits a well-formed SVG document with viewBox and page size', () => {
    const svg = exportPageToSVG(pg([]));
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="300"');
    expect(svg).toContain('viewBox="0 0 400 300"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('draws a solid background, and omits it when background:false', () => {
    expect(exportPageToSVG(pg([]))).toContain('fill="#ffffff"');
    const noBg = exportPageToSVG(pg([]), { background: false });
    expect(noBg).not.toContain('fill="#ffffff"');
  });

  it('wraps each element with its translate/rotate/opacity transform', () => {
    const svg = exportPageToSVG(
      pg([mk({ type: 'shape', shape: 'rect', fill: '#112233', x: 5, y: 6, rotation: 45, opacity: 0.5 })]),
    );
    expect(svg).toContain('transform="translate(5 6) rotate(45)"');
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('fill="#112233"');
  });

  it('renders text as <text> with tspans and XML-escapes content', () => {
    const svg = exportPageToSVG(
      pg([
        mk({
          type: 'text',
          text: 'a <b> & "c"',
          fontFamily: 'Inter',
          fontSize: 24,
          fontWeight: 700,
          fill: '#000000',
          align: 'center',
        }),
      ]),
    );
    expect(svg).toContain('<text');
    expect(svg).toContain('font-size="24"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('<tspan');
    expect(svg).toContain('a &lt;b&gt; &amp; &quot;c&quot;');
  });

  it('maps shape kinds: ellipse, star/polygon points', () => {
    expect(exportPageToSVG(pg([mk({ type: 'shape', shape: 'ellipse', fill: '#f00' })]))).toContain('<ellipse');
    const star = exportPageToSVG(pg([mk({ type: 'shape', shape: 'star', fill: '#f00', points: 5 })]));
    expect(star).toContain('<polygon');
    // 5-point star => 10 vertices => 10 coordinate pairs
    const pts = /<polygon points="([^"]+)"/.exec(star)?.[1] ?? '';
    expect(pts.trim().split(/\s+/)).toHaveLength(10);
  });

  it('renders a line with an arrowhead', () => {
    const svg = exportPageToSVG(
      pg([mk({ type: 'line', points: [0, 0, 100, 0], stroke: '#000000', strokeWidth: 4, arrow: true })]),
    );
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<polygon'); // arrowhead
  });

  it('clips an image with cornerRadius and embeds its href', () => {
    const svg = exportPageToSVG(
      pg([mk({ type: 'image', src: 'https://x/y.png', cornerRadius: 12, width: 50, height: 50 })]),
    );
    expect(svg).toContain('<clipPath');
    expect(svg).toContain('<image href="https://x/y.png"');
  });

  it('recurses groups, applying the group transform', () => {
    const svg = exportPageToSVG(
      pg([
        mk({
          type: 'group',
          x: 10,
          y: 20,
          children: [mk({ type: 'shape', shape: 'rect', fill: '#abcdef' })],
        }),
      ]),
    );
    expect(svg).toContain('transform="translate(10 20)"');
    expect(svg).toContain('fill="#abcdef"');
  });

  it('skips invisible elements', () => {
    const svg = exportPageToSVG(pg([mk({ type: 'shape', shape: 'rect', fill: '#deadbe', visible: false })]));
    expect(svg).not.toContain('#deadbe');
  });

  it('converts a linear-gradient background into an SVG gradient', () => {
    const svg = exportPageToSVG(pg([], { type: 'gradient', css: 'linear-gradient(90deg, #ff0000, #0000ff)' }));
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('stop-color="#ff0000"');
    expect(svg).toContain('stop-color="#0000ff"');
    expect(svg).toContain('fill="url(#');
  });

  it('svgStringToBlob produces an image/svg+xml blob', () => {
    const blob = svgStringToBlob('<svg/>');
    expect(blob.type).toContain('image/svg+xml');
    expect(blob.size).toBeGreaterThan(0);
  });
});
