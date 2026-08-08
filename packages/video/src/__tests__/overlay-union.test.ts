/**
 * `Overlay` is a union, and every renderer has to say which kinds it draws.
 *
 * Before the union there was one kind, so nothing needed to. That left a rule
 * spanning two files with nothing asserting it: `ffmpeg.ts` selected overlays by
 * `images[o.id]` — whether the rasterizer had produced a PNG — which picked the
 * right ones only because `render.ts` happened to rasterize text and nothing
 * else. Correct by coincidence, and exactly the sort of coincidence that ends
 * the day a second kind of overlay arrives.
 *
 * All three kinds now draw, and each takes a DIFFERENT path, which is what this
 * file pins down:
 *
 * - `text` and `shape` are PLATES — rasterized full-frame and composited at
 *   0,0, so `overlayImages` carries a PNG for each and the filtergraph chains
 *   one `overlay` filter per plate.
 * - `image` is a CLIP — `imageOverlayAsClip` turns it into a `VisualTrackClip`
 *   placed exactly as a picture-in-picture is, so it never appears as an
 *   overlay op and never gets a plate PNG.
 *
 * The claim that matters is that **the preview and the export make the same
 * choice for the same overlay.** Two surfaces disagreeing is the failure this
 * engine is built to prevent; a kind drawn by one and skipped by the other is
 * the worst version of it.
 *
 * The ffmpeg cases deliberately hand the builder an `overlayImages` entry for
 * EVERY overlay, including the picture. That is the mutation: selection is by
 * `type`, so a builder that went back to picking overlays by "did the
 * rasterizer make a PNG" would wire the sticker in twice and these tests would
 * catch it.
 */
import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { frameStateAt } from '../frame';
import { projectDuration } from '../project';
import { toSRT } from '../srt';
import { textOverlaysOf } from '../types';
import type { ImageOverlay, Overlay, ShapeOverlay, TextOverlay, VideoProject } from '../types';

const caption: TextOverlay = {
  id: 'cap',
  type: 'text',
  text: 'Hello',
  start: 0,
  end: 4,
  x: 0.5,
  y: 0.8,
  fontSize: 48,
  color: '#ffffff',
};

const sticker: ImageOverlay = {
  id: 'img',
  type: 'image',
  src: 'sticker.png',
  start: 0,
  end: 4,
  x: 0.5,
  y: 0.5,
  width: 0.25,
  height: 0.25,
};

const plate: ShapeOverlay = {
  id: 'shp',
  type: 'shape',
  shape: 'rect',
  start: 0,
  end: 4,
  x: 0.5,
  y: 0.9,
  width: 0.8,
  height: 0.12,
  fill: '#000000',
};

function project(overlays: Overlay[]): VideoProject {
  return {
    id: 'p',
    schemaVersion: 3,
    width: 1920,
    height: 1080,
    fps: 30,
    background: { type: 'color', color: '#000000' },
    clips: [{ id: 'c0', type: 'video', src: 'a.mp4', start: 0, duration: 4 }],
    overlays,
    audio: [],
  };
}

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

/** A PNG on disk for EVERY overlay — including the picture, which must ignore it. */
const allImages = { cap: '/tmp/cap.png', img: '/tmp/img.png', shp: '/tmp/shp.png' };
const OUT = '/tmp/out.mp4';

describe('textOverlaysOf', () => {
  it('keeps captions in order and drops the rest', () => {
    expect(textOverlaysOf([sticker, caption, plate]).map((o) => o.id)).toEqual(['cap']);
  });

  it('is not fooled by an object that merely has a `text` field', () => {
    // A shape carrying a stray `text` key — from a hand-edited document, or a
    // future field — must still be a shape. Selection is by `type`, not by
    // which properties happen to be present, which is the whole reason the
    // discriminant exists.
    const odd = { ...plate, text: 'not a caption' } as unknown as Overlay;
    expect(textOverlaysOf([odd])).toEqual([]);
  });
});

describe('the preview draws each kind down its own path', () => {
  it('emits a plate op for the caption and the shape, and none for the picture', () => {
    const ops = frameStateAt(project([caption, sticker, plate]), 1);
    expect(ops.filter((o) => o.kind === 'overlay').map((o) => o.id)).toEqual(['cap', 'shp']);
    // The sticker is still drawn — as a clip, which is the whole point of it
    // not being a plate.
    expect(ops.some((o) => o.kind === 'clip' && o.id === 'img')).toBe(true);
  });

  it('never builds a caption SVG out of a shape', () => {
    /*
     * The specific mis-draw this guards, and the reason the two builders are
     * separate functions rather than one with optional fields. Handing a shape
     * to `overlayToSVG` reads a `text`, `fontSize` and `color` that are not
     * there and emits a `<text>` with `font-size="NaN"` — an empty caption
     * painted across the whole frame, over the picture, in every preview.
     */
    const ops = frameStateAt(project([plate]), 1);
    const svg = ops.find((o) => o.kind === 'overlay')?.svg ?? '';
    expect(svg).toContain('<rect');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('NaN');
  });

  it('draws an ellipse as an ellipse', () => {
    const ops = frameStateAt(project([{ ...plate, shape: 'ellipse' }]), 1);
    expect(ops.find((o) => o.kind === 'overlay')?.svg).toContain('<ellipse');
  });

  it('keeps layer order across the two paths', () => {
    // Overlays are drawn in layer order and that order has to mean the same
    // thing for every kind — a caption that ended up under a scrim because the
    // scrim took a different code path is a z-order bug with no visible cause.
    const lo = { ...caption, id: 'lo', layer: 0 };
    const hi = { ...caption, id: 'hi', layer: 2 };
    const mid = { ...plate, id: 'mid', layer: 1 };
    const ops = frameStateAt(project([hi, mid, lo]), 1);
    expect(ops.filter((o) => o.kind === 'overlay').map((o) => o.id)).toEqual(['lo', 'mid', 'hi']);
  });
});

describe('the export makes the same choice as the preview', () => {
  it('wires both plates into the legacy filtergraph, and the picture not as a plate', () => {
    const args = buildFFmpegArgs(project([caption, sticker, plate]), {
      overlayImages: allImages,
      outputPath: OUT,
    });
    expect(args).toContain('/tmp/cap.png');
    expect(args).toContain('/tmp/shp.png');
    // The sticker's plate PNG is offered and must be ignored: a picture is read
    // from its own `src` down the clip path, and consuming both would composite
    // it twice.
    expect(args).not.toContain('/tmp/img.png');
  });

  it('wires both plates into the multi-track filtergraph', () => {
    const args = buildFFmpegArgs(multitrack([caption, sticker, plate]), {
      overlayImages: allImages,
      baseImage: '/tmp/bg.png',
      outputPath: OUT,
    });
    expect(args).toContain('/tmp/cap.png');
    expect(args).toContain('/tmp/shp.png');
    expect(args).not.toContain('/tmp/img.png');

    /*
     * And CONSUMED, not merely loaded. These two assertions are not the same
     * one twice: the inputs are added by one loop and composited by another, so
     * a plate can be opened as an `-i` and then never reach an `overlay`
     * filter. That is a layer missing from the file with a filtergraph that
     * looks busy and an argv that mentions the picture — the exact failure a
     * mutation run caught here, because the presence check alone survived
     * dropping shapes from the compositing filter entirely.
     */
    const graph = args[args.indexOf('-filter_complex') + 1];
    // `[t*]` here, not `[ov*]`: the two builders name their plate streams
    // differently, and asserting the legacy names against the multi-track graph
    // passes for the wrong reason the moment the label scheme is touched.
    expect(graph).toMatch(/\[t0\]/);
    expect(graph).toMatch(/\[t1\]/);
  });

  it('chains one overlay filter per plate, in layer order', () => {
    // Input indices are positional and each `overlay` filter consumes the
    // previous stage's label, so a plate wired in at the wrong point does not
    // merely draw in the wrong order — it repoints every later stream.
    const args = buildFFmpegArgs(project([caption, plate]), {
      overlayImages: allImages,
      outputPath: OUT,
    });
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph.match(/\[ov\d\]/g)).toEqual(['[ov0]', '[ov0]', '[ov1]', '[ov1]']);
    expect(graph.indexOf('[ov0]')).toBeLessThan(graph.indexOf('[ov1]'));
  });

  it('a shape with no PNG is skipped rather than pointed at nothing', () => {
    // The rasterizer can fail on one overlay — a bad colour, a full disk — and
    // an `overlay` filter aimed at a file that does not exist takes the whole
    // render down rather than losing one layer.
    const args = buildFFmpegArgs(project([caption, plate]), {
      overlayImages: { cap: '/tmp/cap.png' },
      outputPath: OUT,
    });
    expect(args).toEqual(
      buildFFmpegArgs(project([caption]), { overlayImages: { cap: '/tmp/cap.png' }, outputPath: OUT }),
    );
  });
});

describe('everything else treats them as ordinary overlays', () => {
  it('counts a non-text overlay towards the project duration', () => {
    // `end` is a base field and means the same thing for every kind. A sticker
    // running past the last clip still has to be inside the render.
    const long = { ...sticker, end: 9 };
    expect(projectDuration(project([caption, long]))).toBe(9);
  });

  it('writes no subtitle cue for one', () => {
    const srt = toSRT(project([caption, sticker, plate]));
    expect(srt).toContain('Hello');
    // One cue, so nothing invented an empty second entry from the sticker.
    expect(srt.trimEnd().split('\n\n')).toHaveLength(1);
  });
});
