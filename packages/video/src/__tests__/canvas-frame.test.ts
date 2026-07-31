/**
 * The canvas frame's geometry and its SVG.
 *
 * The frame reaches ffmpeg as a rasterized PNG, so — unlike a grade or an
 * overlay position — there are no numbers in the filtergraph to compare a
 * preview against. That is the same position the background and the captions
 * are already in, and it is why `dual-render.test.ts` asserts nothing about
 * background colour. The teeth therefore live here instead: if this module and
 * the export agree, and the preview draws from this module, the three agree.
 */
import { describe, expect, it } from 'vitest';
import {
  canvasFramePx,
  canvasFrameToSVG,
  hasCanvasFrame,
} from '../canvas-frame';
import { assertNoExternalRefs } from '../svg';
import type { CanvasFrame } from '../types';

const W = 1080;
const H = 1920;

describe('hasCanvasFrame', () => {
  it('is false for anything that would paint nothing', () => {
    // Each of these must skip the rasterize, the input AND the overlay — a
    // transparent PNG composited every frame is a real cost for no pixels.
    expect(hasCanvasFrame(undefined)).toBe(false);
    expect(hasCanvasFrame({ color: '#fff', width: 0 })).toBe(false);
    expect(hasCanvasFrame({ color: '#fff', width: 0, radius: 0 })).toBe(false);
    expect(hasCanvasFrame({ color: '#fff', width: 0.1, opacity: 0 })).toBe(
      false,
    );
  });

  it('is true for a band, for corners alone, and for both', () => {
    expect(hasCanvasFrame({ color: '#fff', width: 0.05 })).toBe(true);
    expect(hasCanvasFrame({ color: '#fff', width: 0, radius: 0.08 })).toBe(true);
    expect(
      hasCanvasFrame({ color: '#fff', width: 0.05, radius: 0.08 }),
    ).toBe(true);
  });
});

describe('canvasFramePx', () => {
  it('measures the band against the SHORT side', () => {
    // Against min(W,H), so a frame authored on a reel is the same thickness
    // when the same project is exported 16:9.
    expect(canvasFramePx({ color: '#fff', width: 0.05 }, W, H).borderPx).toBe(54);
    expect(canvasFramePx({ color: '#fff', width: 0.05 }, H, W).borderPx).toBe(54);
  });

  it('clamps the radius to half the OPENING, not half the canvas', () => {
    // The opening after a 0.4 band on 1080 is 216 wide, so the largest
    // meaningful radius is 108 — well under the 0.5*1080 the input asks for.
    const { borderPx, radiusPx } = canvasFramePx(
      { color: '#fff', width: 0.4, radius: 0.5 },
      W,
      H,
    );
    expect(borderPx).toBe(432);
    expect(radiusPx).toBe(108);
  });

  it('never lets a hostile value out of the helper', () => {
    // Out-of-range radii resolve DIFFERENTLY in SVG, canvas and Skia, so the
    // clamp has to happen once, here, and not three times downstream.
    for (const bad of [-1, 5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const g = canvasFramePx(
        { color: '#fff', width: bad, radius: bad },
        W,
        H,
      );
      expect(g.borderPx).toBeGreaterThanOrEqual(0);
      expect(g.borderPx).toBeLessThanOrEqual(W / 2);
      expect(g.radiusPx).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(g.radiusPx)).toBe(true);
    }
  });

  it('is pure in the box it is handed, so mobile can pass its own canvas', () => {
    // Mobile calls this with the PREVIEW size, not the project size. The two
    // must scale, not agree — which is what the mirror test asserts.
    const big = canvasFramePx({ color: '#fff', width: 0.1 }, 1080, 1920);
    const small = canvasFramePx({ color: '#fff', width: 0.1 }, 270, 480);
    expect(big.borderPx / small.borderPx).toBeCloseTo(4, 9);
  });

  it('returns nothing for a degenerate box', () => {
    expect(canvasFramePx({ color: '#fff', width: 0.1 }, 0, 0)).toEqual({
      borderPx: 0,
      radiusPx: 0,
      outerRadiusPx: 0,
    });
  });

  describe('the outer radius', () => {
    it('is concentric with the opening: one radius plus the band', () => {
      const g = canvasFramePx({ color: '#fff', width: 0.05, radius: 0.1 }, W, H);
      expect(g.outerRadiusPx).toBeCloseTo(g.radiusPx + g.borderPx, 6);
    });

    it('is zero when the opening is square, however thick the band', () => {
      // Frames authored before the outer edge could round asked for a
      // rectangle; rounding one because its band is thick would rewrite the
      // look of a stored document nobody touched.
      expect(
        canvasFramePx({ color: '#fff', width: 0.4 }, W, H).outerRadiusPx,
      ).toBe(0);
    });

    it('never exceeds half the canvas', () => {
      const g = canvasFramePx({ color: '#fff', width: 0.5, radius: 0.5 }, W, H);
      expect(g.outerRadiusPx).toBeLessThanOrEqual(Math.min(W, H) / 2);
    });
  });
});

describe('canvasFrameToSVG', () => {
  it('is null exactly when nothing would be painted', () => {
    expect(canvasFrameToSVG(undefined, W, H)).toBeNull();
    expect(canvasFrameToSVG({ color: '#fff', width: 0 }, W, H)).toBeNull();
  });

  it('is a single evenodd path: the canvas, minus the opening', () => {
    const svg = canvasFrameToSVG({ color: '#ff0000', width: 0.05 }, W, H)!;
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('fill="#ff0000"');
    // Outer subpath is the whole canvas; inner starts at the band thickness.
    expect(svg).toContain(`M0,0H${W}V${H}H0Z`);
    expect(svg).toContain('M54,54');
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
  });

  it('draws square corners with no arcs when the radius is zero', () => {
    const svg = canvasFrameToSVG({ color: '#fff', width: 0.05 }, W, H)!;
    expect(svg).not.toContain('A');
  });

  it('draws arcs at the clamped radius when there is one', () => {
    const svg = canvasFrameToSVG(
      { color: '#fff', width: 0, radius: 0.1 },
      W,
      H,
    )!;
    expect(svg).toContain('A108,108');
  });

  it('carries the opacity, so the band can be seen through', () => {
    const svg = canvasFrameToSVG(
      { color: '#fff', width: 0.05, opacity: 0.4 },
      W,
      H,
    )!;
    expect(svg).toContain('fill-opacity="0.4"');
  });

  describe('the rounded outer edge', () => {
    const F = { color: '#ffffff', width: 0.05, radius: 0.08 } as const;

    it('paints the wedges outside the card with a solid background', () => {
      const svg = canvasFrameToSVG(F, W, H, { type: 'color', color: '#123456' })!;
      expect((svg.match(/<path/g) ?? []).length).toBe(2);
      expect(svg).toContain('fill="#123456"');
      // The card's own outer edge is no longer the bare canvas rectangle.
      expect(svg).not.toContain(`M0,0H${W}V${H}H0ZM54,54`);
    });

    it('reuses the background gradient rather than restating it', async () => {
      const bg = { type: 'gradient', from: '#ff0000', to: '#0000ff', angle: 45 } as const;
      const svg = canvasFrameToSVG(F, W, H, bg)!;
      const { gradientEnds } = await import('../background-svg');
      const { x1, y1, x2, y2 } = gradientEnds(45);
      expect(svg).toContain(`x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`);
      expect(svg).toContain('url(#fo)');
    });

    it('sits the card on black over a photo background', () => {
      // resvg refuses `<image>`, so the photograph itself cannot go in the
      // frame's PNG. Black is what all three renderers can agree on — and
      // agreeing matters more here than being pretty.
      const svg = canvasFrameToSVG(F, W, H, { type: 'image', src: 'a.jpg' })!;
      expect((svg.match(/<path/g) ?? []).length).toBe(2);
      expect(svg).toContain('fill="#000000"');
    });

    it('paints the wedges opaque even when the band is see-through', () => {
      const svg = canvasFrameToSVG(
        { ...F, opacity: 0.4 },
        W,
        H,
        { type: 'color', color: '#123456' },
      )!;
      expect(svg).toContain('fill="#123456"/>');
      expect(svg).toContain('fill-opacity="0.4"');
    });

    it('survives a hostile background colour', () => {
      const svg = canvasFrameToSVG(F, W, H, {
        type: 'color',
        color: "url('/etc/passwd')",
      })!;
      expect(svg).not.toContain('/etc/passwd');
      expect(() => assertNoExternalRefs(svg)).not.toThrow();
    });
  });

  it('survives a hostile colour without emitting a reference', () => {
    // `col` constrains rather than escapes, because `esc` is an XML transform
    // the parser UNDOES — see svg.ts. This is the same attack that once read a
    // file off local disk into a rendered frame.
    const hostile = {
      color: "url('/etc/passwd')",
      width: 0.05,
    } as CanvasFrame;
    const svg = canvasFrameToSVG(hostile, W, H)!;
    expect(svg).not.toContain('/etc/passwd');
    expect(() => assertNoExternalRefs(svg)).not.toThrow();
  });

  it('survives hostile numbers', () => {
    const svg = canvasFrameToSVG(
      { color: '#fff', width: '0.05"/><script/>' as never, radius: NaN },
      W,
      H,
    );
    if (svg) {
      expect(svg).not.toContain('<script');
      expect(() => assertNoExternalRefs(svg)).not.toThrow();
    }
  });
});
