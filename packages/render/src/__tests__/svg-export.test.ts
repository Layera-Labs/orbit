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

/** A page holding one 100x100 image, with the fields under test applied. */
function mkPage(extra: Record<string, unknown>): Page {
  return pg([
    mk({
      type: 'image',
      src: 'data:image/png;base64,iVBORw0KGgo=',
      naturalWidth: 400,
      naturalHeight: 400,
      ...extra,
    }),
  ]);
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

  /*
   * The still editor grew Shadow / Edges / Crop controls, and those were
   * verified on the Konva canvas. PNG and PDF go through `stage.toDataURL()`,
   * so they get whatever the canvas drew for free — but SVG is built by THIS
   * file, independently, and had no coverage for any of them. `image.crop` in
   * particular was documented as "not applied", which was a defensible gap
   * while nothing could set a crop and a real divergence the moment something
   * could.
   */
  describe('the fields the element inspector can set', () => {
    it('applies a drop shadow', () => {
      const svg = exportPageToSVG(
        pg([
          mk({
            type: 'shape',
            shape: 'rect',
            fill: '#123456',
            shadow: { color: '#000000', blur: 12, opacity: 0.35, offsetX: 2, offsetY: 6 },
          }),
        ]),
      );
      expect(svg).toContain('<feDropShadow');
      expect(svg).toContain('dy="6"');
      // stdDeviation is half the blur — SVG's sigma against Konva's radius.
      expect(svg).toContain('stdDeviation="6"');
      expect(svg).toContain('flood-opacity="0.35"');
      expect(svg).toMatch(/filter="url\(#[^)]+\)"/);
    });

    it('rounds an image and strokes it', () => {
      const svg = exportPageToSVG(
        mkPage({ cornerRadius: 20, stroke: '#ff0000', strokeWidth: 4 }),
      );
      expect(svg).toContain('<clipPath');
      expect(svg).toContain('rx="20"');
      expect(svg).toContain('stroke="#ff0000"');
      expect(svg).toContain('stroke-width="4"');
    });

    it('maps a crop window onto the whole box', () => {
      // The right half of the source, drawn into a 100-wide box: the image has
      // to be twice as wide and pulled left by its own width, then clipped.
      const svg = exportPageToSVG(
        mkPage({ crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }),
      );
      expect(svg).toContain('width="200"');
      expect(svg).toContain('x="-100"');
      expect(svg).toContain('<clipPath');
    });

    it('offsets on both axes for a centred crop', () => {
      const svg = exportPageToSVG(
        mkPage({ crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }),
      );
      expect(svg).toContain('width="200"');
      expect(svg).toContain('height="200"');
      expect(svg).toContain('x="-50"');
      expect(svg).toContain('y="-50"');
    });

    it('draws an uncropped image exactly as it always did', () => {
      // The regression guard: every stored document without a crop must emit
      // byte-identical markup to before crop existed.
      const svg = exportPageToSVG(mkPage({}));
      expect(svg).toContain('x="0" y="0" width="100" height="100"');
      expect(svg).not.toContain('<clipPath');
    });

    it('survives a degenerate crop rather than dividing by zero', () => {
      const svg = exportPageToSVG(mkPage({ crop: { x: 0, y: 0, width: 0, height: 0 } }));
      expect(svg).not.toContain('Infinity');
      expect(svg).not.toContain('NaN');
    });
  });

  it('svgStringToBlob produces an image/svg+xml blob', () => {
    const blob = svgStringToBlob('<svg/>');
    expect(blob.type).toContain('image/svg+xml');
    expect(blob.size).toBeGreaterThan(0);
  });
});
