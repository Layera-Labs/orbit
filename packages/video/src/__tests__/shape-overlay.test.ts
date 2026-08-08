/**
 * The shape renderer, and the dual-render invariant that keeps it honest.
 *
 * A `ShapeOverlay` is a PLATE: rasterized full-frame with the rectangle baked
 * at its anchor, then composited at 0,0 — exactly what a caption is. That is
 * not an implementation detail, it is the whole design, and it is what these
 * tests pin down. Because the two share a path, a shape inherits the window,
 * the fade, `animateIn`, the slide, the motion and the keyframe sample that
 * were already written and already tested for captions, and there is no second
 * copy of that arithmetic to drift.
 *
 * So the agreement test here does not re-check the timing machinery. It checks
 * the one thing that is genuinely new: **both surfaces build the same SVG from
 * the same shape, and both composite it the same way.** The preview draws that
 * SVG directly; the export rasterizes it to a PNG and hands it to `overlay`.
 * If the two ever built different markup the pixels would differ with nothing
 * to say so.
 */
import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { frameStateAt } from '../frame';
import { shapeBox, shapeToSVG } from '../overlay-svg';
import { plateOverlaysOf } from '../types';
import type { Overlay, ShapeOverlay, TextOverlay, VideoProject } from '../types';

const W = 1080;
const H = 1920;

const scrim: ShapeOverlay = {
  id: 'scrim',
  type: 'shape',
  shape: 'rect',
  start: 0,
  end: 4,
  x: 0.5,
  y: 0.85,
  width: 0.9,
  height: 0.2,
  fill: '#101014',
  fillOpacity: 0.7,
};

const caption: TextOverlay = {
  id: 'cap',
  type: 'text',
  text: 'Hello',
  start: 0,
  end: 4,
  x: 0.5,
  y: 0.85,
  fontSize: 64,
  color: '#ffffff',
};

function project(overlays: Overlay[]): VideoProject {
  return {
    id: 'p',
    schemaVersion: 3,
    width: W,
    height: H,
    fps: 30,
    background: { type: 'color', color: '#000000' },
    clips: [{ id: 'c0', type: 'video', src: 'a.mp4', start: 0, duration: 4 }],
    overlays,
    audio: [],
  };
}

describe('shapeBox', () => {
  it('reads x/y as the CENTRE and width/height as fractions', () => {
    // The same reading `imageOverlayAsClip` gives a picture. If these two ever
    // disagreed, a format author placing a scrim behind a caption would find
    // the scrim somewhere else entirely.
    expect(shapeBox(scrim, W, H)).toEqual({
      x: 0.5 * W - (0.9 * W) / 2,
      y: 0.85 * H - (0.2 * H) / 2,
      w: 0.9 * W,
      h: 0.2 * H,
    });
  });

  it('a full-frame shape covers the frame exactly', () => {
    const full: ShapeOverlay = { ...scrim, x: 0.5, y: 0.5, width: 1, height: 1 };
    expect(shapeBox(full, W, H)).toEqual({ x: 0, y: 0, w: W, h: H });
  });

  it('never returns a negative size from a negative fraction', () => {
    // A hand-edited document or a model that emitted -0.2. A negative width
    // makes resvg drop the element silently, so the preview would show nothing
    // while the export showed nothing for a different reason.
    expect(shapeBox({ ...scrim, width: -0.2 }, W, H).w).toBe(0);
  });
});

describe('shapeToSVG', () => {
  it('draws a rect at the box, full-frame', () => {
    const svg = shapeToSVG(scrim, W, H);
    const b = shapeBox(scrim, W, H);
    expect(svg).toContain(`width="${W}" height="${H}"`);
    expect(svg).toContain(`x="${b.x}"`);
    expect(svg).toContain(`width="${b.w}"`);
    expect(svg).toContain('fill="#101014"');
    expect(svg).toContain('fill-opacity="0.7"');
  });

  it('draws an ellipse from the same box', () => {
    const svg = shapeToSVG({ ...scrim, shape: 'ellipse' }, W, H);
    const b = shapeBox(scrim, W, H);
    expect(svg).toContain(`cx="${b.x + b.w / 2}"`);
    expect(svg).toContain(`rx="${b.w / 2}"`);
    expect(svg).not.toContain('<rect');
  });

  it('clamps a corner radius to half the box, so a pill stays a pill', () => {
    const b = shapeBox(scrim, W, H);
    const svg = shapeToSVG({ ...scrim, cornerRadius: 9999 }, W, H);
    expect(svg).toContain(`rx="${Math.min(b.w / 2, b.h / 2)}"`);
  });

  it('needs BOTH a stroke colour and a width to draw one', () => {
    // `stroke-width` alone leaves SVG's default `stroke: none`, so a shape
    // setting only the width would render unstroked here and — depending on the
    // renderer's defaults — possibly not there.
    expect(shapeToSVG({ ...scrim, strokeWidth: 8 }, W, H)).not.toContain('stroke=');
    expect(shapeToSVG({ ...scrim, stroke: '#ff0000' }, W, H)).not.toContain('stroke=');
    const both = shapeToSVG({ ...scrim, stroke: '#ff0000', strokeWidth: 8 }, W, H);
    expect(both).toContain('stroke="#ff0000"');
    expect(both).toContain('stroke-width="8"');
  });

  it('rotates about the shape centre, clockwise, in degrees', () => {
    const b = shapeBox(scrim, W, H);
    expect(shapeToSVG({ ...scrim, rotation: 12 }, W, H)).toContain(
      `rotate(12 ${b.x + b.w / 2} ${b.y + b.h / 2})`,
    );
    // No transform at all when there is nothing to rotate, so the markup a
    // stored document produces does not change under an added default.
    expect(shapeToSVG(scrim, W, H)).not.toContain('<g');
  });

  it('refuses a hostile fill rather than escaping it', () => {
    /*
     * The injection rule this package runs on. `esc` is an XML transform the
     * parser UNDOES, so an escaped `url('/etc/passwd')` decodes back into a
     * live reference and resvg reads a file off local disk into the frame.
     * `col` rejects anything that is not a colour outright, which is why
     * colours never go through `esc`.
     */
    const svg = shapeToSVG({ ...scrim, fill: "url('/etc/passwd')" } as ShapeOverlay, W, H);
    expect(svg).not.toContain('/etc/passwd');
    expect(svg).not.toContain('url(');
  });

  it('emits no element the rasterizer refuses', () => {
    // `rasterizeSVG` rejects <image>/<use>/<script>/<foreignObject> because
    // nothing we build emits them. A builder that started to would fail at
    // render time on the server, not here, so assert it here.
    const svg = shapeToSVG({ ...scrim, shape: 'ellipse', rotation: 30 }, W, H);
    for (const el of ['<image', '<use', '<script', '<foreignObject']) {
      expect(svg).not.toContain(el);
    }
  });
});

describe('plateOverlaysOf', () => {
  it('takes text and shapes, in order, and leaves pictures alone', () => {
    const sticker: Overlay = {
      id: 'img',
      type: 'image',
      src: 's.png',
      start: 0,
      end: 4,
      x: 0.5,
      y: 0.5,
      width: 0.2,
      height: 0.2,
    };
    expect(plateOverlaysOf([sticker, scrim, caption]).map((o) => o.id)).toEqual(['scrim', 'cap']);
  });
});

describe('preview and export agree about a shape', () => {
  it('the preview draws exactly the SVG the export rasterizes', () => {
    /*
     * The invariant, stated as directly as it can be. `render.ts` builds the
     * export's PNG from `shapeToSVG(overlay, width, height)`; this asserts the
     * preview's op carries the identical string. Two builders producing
     * different markup is the failure mode the dual-render rule exists for, and
     * it is invisible in any test that only checks that both drew *something*.
     */
    const op = frameStateAt(project([scrim]), 1).find((o) => o.kind === 'overlay');
    expect(op?.svg).toBe(shapeToSVG(scrim, W, H));
  });

  it('composites it full-frame at the origin, like a caption', () => {
    const op = frameStateAt(project([scrim]), 1).find((o) => o.kind === 'overlay');
    expect(op?.dst).toEqual({ x: 0, y: 0, w: W, h: H });
    expect(op?.fit).toBe('stretch');
  });

  it('honours the window on both surfaces', () => {
    const p = project([{ ...scrim, start: 1, end: 2 }]);
    expect(frameStateAt(p, 0.5).some((o) => o.kind === 'overlay')).toBe(false);
    expect(frameStateAt(p, 1.5).some((o) => o.kind === 'overlay')).toBe(true);
    expect(frameStateAt(p, 3).some((o) => o.kind === 'overlay')).toBe(false);

    const graph = graphOf(p);
    expect(graph).toContain("enable='between(t,1,2)'");
  });

  it('fades on both surfaces from one resolved animation', () => {
    // `animateIn` is read by `resolveAnim` for every plate, so a shape fading
    // in is the caption code path with different content. Half-way through a
    // 1s fade the preview is at ~0.5 alpha and the graph carries the same ramp.
    const fading: ShapeOverlay = { ...scrim, animateIn: { type: 'fade', duration: 1 } };
    const op = frameStateAt(project([fading]), 0.5).find((o) => o.kind === 'overlay');
    expect(op?.alpha).toBeGreaterThan(0.3);
    expect(op?.alpha).toBeLessThan(0.7);
    expect(graphOf(multitrack([fading]))).toContain('fade=t=in:st=0:d=1:alpha=1');
  });

  it('inherits the legacy path\'s existing blind spot rather than a new one', () => {
    /*
     * Measured, not assumed. The LEGACY single-track builder emits no `fade`
     * for an overlay — and it does not for a CAPTION either, which is what
     * makes this a pre-existing limitation of that path rather than something
     * the shape renderer introduced. Asserted for both kinds together so the
     * day someone fixes it, this test fails and says exactly which claim moved.
     *
     * It costs nothing today: every shipping client sends `tracks`, so nothing
     * reaches the legacy builder, and `@orbit/formats` emits tracks too.
     */
    const anim = { type: 'fade', duration: 1 } as const;
    expect(graphOf(project([{ ...scrim, animateIn: anim }]))).not.toContain('fade=t=in');
    expect(graphOf(project([{ ...caption, animateIn: anim }]))).not.toContain('fade=t=in');
  });

  it('puts a scrim under its caption on both surfaces when the layers say so', () => {
    /*
     * The actual reason this renderer exists: a legibility scrim behind a
     * caption. Layer order has to mean the same thing across the two kinds, and
     * because both are plates they sort in one list with one comparator.
     */
    const p = project([
      { ...caption, layer: 1 },
      { ...scrim, layer: 0 },
    ]);
    expect(
      frameStateAt(p, 1)
        .filter((o) => o.kind === 'overlay')
        .map((o) => o.id),
    ).toEqual(['scrim', 'cap']);

    // In the graph the scrim's input must be consumed before the caption's.
    const graph = graphOf(p, { scrim: '/tmp/scrim.png', cap: '/tmp/cap.png' });
    expect(graph.indexOf('[ov0]')).toBeLessThan(graph.indexOf('[ov1]'));
  });
});

/** The same project on the multi-track builder, which is what clients send. */
function multitrack(overlays: Overlay[]): VideoProject {
  return {
    ...project(overlays),
    clips: [],
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 4 }],
      },
    ],
  };
}

function graphOf(p: VideoProject, images?: Record<string, string>): string {
  const overlayImages =
    images ?? Object.fromEntries(p.overlays.map((o) => [o.id, `/tmp/${o.id}.png`]));
  const args = buildFFmpegArgs(p, {
    overlayImages,
    // Harmless on the legacy path, required on the multi-track one, so one
    // helper serves both.
    baseImage: '/tmp/bg.png',
    outputPath: '/tmp/out.mp4',
  });
  return args[args.indexOf('-filter_complex') + 1];
}
