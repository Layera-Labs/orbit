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
 * The claim under test is narrow and it is the one that matters right now:
 * **a non-text overlay is SKIPPED by every renderer, not mis-drawn by one.**
 * `image` and `shape` have no renderer yet; a skipped layer is a missing
 * picture, which the preview and the export can agree about, while a mis-drawn
 * one is two surfaces disagreeing — the failure this engine is built to prevent.
 *
 * The ffmpeg cases deliberately hand the builder an `overlayImages` entry for
 * the non-text overlay. That is the mutation: under the old `images[o.id]`
 * selection those overlays WOULD have been wired into the filtergraph, so a test
 * that omitted the entry would pass against the bug.
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

/** A PNG on disk for EVERY overlay — including the ones that must be ignored. */
const allImages = { cap: '/tmp/cap.png', img: '/tmp/img.png', shp: '/tmp/shp.png' };

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

describe('the preview skips what it cannot draw', () => {
  it('emits an overlay op for the caption and none for the others', () => {
    const ops = frameStateAt(project([caption, sticker, plate]), 1);
    expect(ops.filter((o) => o.kind === 'overlay').map((o) => o.id)).toEqual(['cap']);
  });

  it('never builds a caption SVG out of a non-text overlay', () => {
    /*
     * The specific mis-draw this guards. `overlayToSVG` would read a `text`,
     * `fontSize` and `color` that are not there and emit a `<text>` with
     * `font-size="NaN"` — an empty caption painted across the whole frame,
     * over the picture, in every preview.
     */
    const ops = frameStateAt(project([sticker, plate]), 1);
    expect(ops.filter((o) => o.kind === 'overlay')).toHaveLength(0);
    expect(ops.some((o) => o.svg?.includes('<text'))).toBe(false);
  });

  it("leaves the captions' own layer order untouched by an interloper", () => {
    // Overlays are drawn in layer order, and skipping one must not renumber the
    // rest — a caption that moved above a title because a sticker was dropped
    // between them is a z-order bug with no visible cause.
    const lo = { ...caption, id: 'lo', layer: 0 };
    const hi = { ...caption, id: 'hi', layer: 2 };
    const mid = { ...sticker, layer: 1 };
    const ops = frameStateAt(project([hi, mid, lo]), 1);
    expect(ops.filter((o) => o.kind === 'overlay').map((o) => o.id)).toEqual(['lo', 'hi']);
  });
});

describe('the export skips the same overlays', () => {
  it('wires only the caption into the legacy filtergraph', () => {
    const args = buildFFmpegArgs(project([caption, sticker, plate]), {
      overlayImages: allImages,
    });
    expect(args).toContain('/tmp/cap.png');
    expect(args).not.toContain('/tmp/img.png');
    expect(args).not.toContain('/tmp/shp.png');
  });

  it('wires only the caption into the multi-track filtergraph', () => {
    const p: VideoProject = {
      ...project([caption, sticker, plate]),
      clips: [],
      tracks: [
        {
          id: 'main',
          kind: 'visual',
          clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 4 }],
        },
      ],
    };
    const args = buildFFmpegArgs(p, { overlayImages: allImages, baseImage: '/tmp/bg.png' });
    expect(args).toContain('/tmp/cap.png');
    expect(args).not.toContain('/tmp/img.png');
    expect(args).not.toContain('/tmp/shp.png');
  });

  it('emits the SAME argv as a project that never had the other overlays', () => {
    // The strongest form of "skipped": not merely absent from the inputs, but
    // producing a filtergraph indistinguishable from the one before they were
    // added. Input indices are positional, so an overlay wired in by mistake
    // would shift every later stream label as well as adding a picture.
    const withAll = buildFFmpegArgs(project([caption, sticker, plate]), {
      overlayImages: allImages,
    });
    const captionOnly = buildFFmpegArgs(project([caption]), { overlayImages: allImages });
    expect(withAll).toEqual(captionOnly);
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
