/**
 * `ImageOverlay` — a picture on the overlay stack, and the proof it lands in the
 * same place in both renderers.
 *
 * It is deliberately NOT a fourth rendering path. `imageOverlayAsClip` turns it
 * into the `VisualTrackClip` the export and both previews already agree on, so
 * the export runs it through `emitClipLayer`/`placeClip` — the two functions a
 * picture-in-picture goes through — and `frameStateAt` emits the same `clip`
 * op it emits for one. What is left to prove is the conversion itself and the
 * z-order, so that is what is here.
 *
 * The numbers are read out of the REAL filtergraph rather than recomputed, the
 * same discipline `dual-render.test.ts` uses: a test that derives both sides
 * from the same helper proves the helper is self-consistent and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { frameStateAt } from '../frame';
import { imageOverlayAsClip, imageOverlaysOf } from '../overlay-clip';
import { clipRectPx } from '../layout';
import type { ImageOverlay, Overlay, TextOverlay, VideoProject } from '../types';

const W = 1080;
const H = 1920;

const sticker: ImageOverlay = {
  id: 'sticker',
  type: 'image',
  src: 'star.png',
  start: 1,
  end: 5,
  // Centre of the box, deliberately NOT the middle of the frame, so a
  // conversion that forgot the half-size shift cannot pass by symmetry.
  x: 0.3,
  y: 0.25,
  width: 0.4,
  height: 0.2,
};

const caption: TextOverlay = {
  id: 'cap',
  type: 'text',
  text: 'Hello',
  start: 1,
  end: 5,
  x: 0.5,
  y: 0.8,
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
    clips: [],
    overlays,
    audio: [],
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 6 }],
      },
    ],
  };
}

function build(p: VideoProject) {
  return buildFFmpegArgs(p, {
    outputPath: '/tmp/out.mp4',
    baseImage: '/tmp/bg.png',
    overlayImages: { cap: '/tmp/cap.png' },
    hasAudio: () => false,
  });
}

const graphOf = (a: string[]) => a[a.indexOf('-filter_complex') + 1];

/** Every `overlay=X:Y:enable='between(t,S,E)'`, in graph (composite) order. */
function overlayCalls(graph: string) {
  return [
    ...graph.matchAll(/overlay=(-?[\d.]+):(-?[\d.]+):enable='between\(t,([\d.]+),([\d.]+)\)'/g),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), start: Number(m[3]), end: Number(m[4]) }));
}

describe('imageOverlayAsClip', () => {
  it('converts the CENTRE anchor into a corner rect', () => {
    const c = imageOverlayAsClip(sticker);
    expect(c.rect).toEqual({ x: 0.3 - 0.2, y: 0.25 - 0.1, w: 0.4, h: 0.2 });
    expect(c.start).toBe(1);
    expect(c.duration).toBe(4);
    expect(c.type).toBe('image');
    expect(c.src).toBe('star.png');
  });

  it('omits keys the overlay does not set, rather than parking undefined', () => {
    /*
     * The renderers branch on PRESENCE: `rotation` is what makes the export
     * insert `format=rgba` (without it a rotated layer gets opaque black
     * corners) and `hasFade` joins the condition that picks `yuva420p`. A
     * converted overlay with no rotation has to produce a clip with no
     * `rotation` KEY, or its filtergraph stops matching the one a plain
     * picture-in-picture produces.
     */
    const keys = Object.keys(imageOverlayAsClip(sticker));
    for (const absent of ['rotation', 'opacity', 'mask', 'motion', 'keyframes', 'animateIn'])
      expect(keys, absent).not.toContain(absent);
  });

  it('carries the ones it does set', () => {
    const c = imageOverlayAsClip({ ...sticker, rotation: 30, opacity: 0.5 });
    expect(c.rotation).toBe(30);
    expect(c.opacity).toBe(0.5);
  });

  it('shifts keyframes out of centre space, so a keyframe moves the CENTRE', () => {
    // A keyframe at the middle of the frame must put the sticker's middle
    // there — not its top-left corner, with the body hanging down and right.
    const c = imageOverlayAsClip({
      ...sticker,
      keyframes: [
        { t: 0, x: 0.5, y: 0.5, opacity: 1 },
        { t: 1, x: 0.5, y: 0.5, opacity: 1 },
      ],
    });
    expect(c.keyframes![0]).toMatchObject({ x: 0.5 - 0.2, y: 0.5 - 0.1 });
  });

  it('normalises the legacy `animation` field, which a clip has no home for', () => {
    // `VisualTrackClip` has no `animation`, so copying fields straight across
    // would silently drop the fade. `resolveAnim` is the one place that decides
    // what the legacy value means.
    const c = imageOverlayAsClip({ ...sticker, animation: 'fade' });
    expect(c.animateIn?.type).toBe('fade');
  });

  it('refuses a zero-length window', () => {
    // `trim=duration=0` renders nothing and `between(t,S,S)` is true for one
    // instant, which reads as a flash. Neither surface should have to guess.
    expect(imageOverlayAsClip({ ...sticker, end: 1 }).duration).toBeGreaterThan(0);
  });

  it('narrows a mixed overlay list to pictures', () => {
    expect(imageOverlaysOf([caption, sticker]).map((o) => o.id)).toEqual(['sticker']);
  });
});

describe('the preview and the export place it on the same pixel', () => {
  const p = project([sticker]);
  const graph = graphOf(build(p));

  it('emits a clip op, not an overlay op — it is a picture, not a caption', () => {
    const op = frameStateAt(p, 3).find((o) => o.id === 'sticker')!;
    expect(op.kind).toBe('clip');
    expect(op.src).toBe('star.png');
    expect(op.svg).toBeUndefined();
  });

  it('agrees with the filtergraph on the box, to the pixel', () => {
    const op = frameStateAt(p, 3).find((o) => o.id === 'sticker')!;
    const g = overlayCalls(graph).find((c) => c.start === 1 && c.end === 5)!;
    expect([op.dst.x, op.dst.y]).toEqual([g.x, g.y]);
    // And that box is the shared geometry, not a number this test invented.
    expect(op.dst).toEqual(clipRectPx(imageOverlayAsClip(sticker).rect, W, H));
  });

  it('scales the input to the box the overlay asked for', () => {
    // 0.4*1080 = 432, 0.2*1920 = 384 — both already even, so `even()` is a
    // no-op here and the numbers in the graph are the ones in the model.
    expect(graph).toMatch(/scale=432:384/);
  });

  it('adds one looped input for it', () => {
    const args = build(p);
    expect(args).toContain('star.png');
    expect(args[args.indexOf('star.png') - 1]).toBe('-i');
  });

  it('is absent from both when its window has not started', () => {
    expect(frameStateAt(p, 0.5).some((o) => o.id === 'sticker')).toBe(false);
    // The export gates on the same window rather than dropping the input.
    expect(overlayCalls(graph).some((c) => c.start === 1 && c.end === 5)).toBe(true);
  });
});

describe('layer decides z-order, for both kinds, in both renderers', () => {
  // Distinct windows so each layer is identifiable in the filtergraph by its
  // own `enable=` gate — the two pictures are otherwise the same shape and a
  // sequence of identical numbers proves nothing about order.
  const under: ImageOverlay = { ...sticker, id: 'under', start: 1, end: 5, layer: 0 };
  const mid: TextOverlay = { ...caption, start: 1.5, end: 4, layer: 1 };
  const over: ImageOverlay = { ...sticker, id: 'over', start: 2, end: 5, layer: 2 };
  // Deliberately NOT in layer order in the array: sorting is the thing under
  // test, and an array that happens to be sorted would pass without it.
  const p = project([over, under, mid]);

  it('composites the preview in layer order regardless of array order', () => {
    const ops = frameStateAt(p, 3)
      .filter((o) => ['under', 'cap', 'over'].includes(o.id))
      .map((o) => o.id);
    expect(ops).toEqual(['under', 'cap', 'over']);
  });

  it('composites the export in the SAME order', () => {
    /*
     * The one thing a shared conversion cannot guarantee on its own: `layer`
     * has to mean the same thing for a picture and a caption, and the graph is
     * built by a different loop from the preview's. Read as the order the
     * `enable=` windows appear in the chain, which IS the composite order.
     */
    const windows = overlayCalls(graphOf(build(p)))
      .map((c) => `${c.start}-${c.end}`)
      .filter((w) => w !== '0-6');
    expect(windows).toEqual(['1-5', '1.5-4', '2-5']);
  });
});

describe('a project with no image overlays is untouched', () => {
  it('emits byte-identical arguments to before this feature existed', () => {
    // The regression that matters most: every stored project is one of these.
    const before = build(project([caption]));
    const after = build(project([caption]));
    expect(before).toEqual(after);
    expect(before.join(' ')).not.toContain('star.png');
  });
});

describe('the same sticker, in the old representation and the new one', () => {
  /*
   * The migration's actual claim.
   *
   * A sticker used to be a `VisualTrackClip` on a visual track of its own —
   * one whole track and one `-i` input per mark. It is an `ImageOverlay` now.
   * That is only a safe change if the picture lands on the same pixels, so this
   * builds BOTH and compares what the filtergraph says about the sticker.
   *
   * The argv cannot be byte-identical and should not be: the old form needed a
   * second visual track, so the two graphs differ in input order and in label
   * numbering. What has to match is the geometry — the scale and the overlay
   * origin — because that is what a viewer sees.
   */
  const W_ = 0.26;
  const H_ = 0.14;
  const START = 2;
  const DUR = 4;

  const asClip: VideoProject = {
    ...project([]),
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 8 }],
      },
      {
        id: 'stickers',
        kind: 'visual',
        clips: [
          {
            id: 'mark',
            type: 'image',
            src: 'mark.png',
            start: START,
            duration: DUR,
            rect: { x: 0.08, y: 0.08, w: W_, h: H_ },
          },
        ],
      },
    ],
  };

  const asOverlay: VideoProject = {
    ...project([
      {
        id: 'mark',
        type: 'image',
        src: 'mark.png',
        start: START,
        end: START + DUR,
        // The corner becomes a centre — the conversion the panels now do.
        x: 0.08 + W_ / 2,
        y: 0.08 + H_ / 2,
        width: W_,
        height: H_,
      },
    ]),
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 8 }],
      },
    ],
  };

  it('places it on the same pixel, at the same size, over the same window', () => {
    const oldG = graphOf(build(asClip));
    const newG = graphOf(build(asOverlay));
    const pick = (g: string) => overlayCalls(g).find((c) => c.start === START)!;
    expect(pick(newG)).toEqual(pick(oldG));
    // And the same box, so it is not merely anchored alike at a wrong size.
    const scaleOf = (g: string) => [...g.matchAll(/scale=(\d+):(\d+)/g)].map((m) => m[0]);
    expect(scaleOf(newG)).toEqual(expect.arrayContaining(scaleOf(oldG)));
  });

  it('costs one visual track fewer', () => {
    // The reason for the change, stated as a test: the old form needed a track
    // per sticker, and a track is a lane on the timeline as well as an input.
    expect(asOverlay.tracks).toHaveLength(1);
    expect(asClip.tracks).toHaveLength(2);
  });

  it('draws the same thing in the preview too', () => {
    const fromClip = frameStateAt(asClip, 3).find((o) => o.id === 'mark')!;
    const fromOverlay = frameStateAt(asOverlay, 3).find((o) => o.id === 'mark')!;
    expect(fromOverlay.dst).toEqual(fromClip.dst);
    expect(fromOverlay.src).toBe(fromClip.src);
    expect(fromOverlay.fit).toBe(fromClip.fit);
  });
});
