/**
 * The dual-render invariant, enforced with numbers.
 *
 * `frameStateAt` (browser canvas preview) and `buildMultiTrackArgs` (ffmpeg
 * export) describe the same frame to two different renderers. Comments and good
 * intentions do not keep them in step — this does: build the REAL filtergraph,
 * parse the numbers back out of it, and assert they equal what the preview's
 * draw list reports at the matching timestamp.
 *
 * When this fails, the preview and the exported MP4 have diverged. Fix the
 * divergence; do not relax the assertion.
 */
import { describe, expect, it } from 'vitest';
import type { VideoProject, VisualTrack, VisualTrackClip } from '../types';
import { buildFFmpegArgs } from '../ffmpeg';
import { frameStateAt } from '../frame';
import { resolveFilter, temperatureGains, temperatureKelvin } from '../filters';
import { chromaAlphaAt, chromaParams } from '../cutout';
import { fadeFactorAt, projectEdgeFadeMap } from '../transitions';
import { resolveTransitions } from '../xfade';
import { rotatedBoxPx } from '../transform';
import { SLIDE_DISTANCE } from '../element-anim';
import { clipRectPx } from '../layout';

/**
 * Two visual clips on the main track — the second is a PiP with a colour grade,
 * blur, static opacity and a fade-in — plus a text overlay.
 */
function fixture(): VideoProject {
  return {
    id: 'p',
    schemaVersion: 2,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: 'color', color: '#101010' },
    clips: [],
    overlays: [
      {
        id: 'cap',
        type: 'text',
        text: 'Hello',
        start: 1,
        end: 5,
        x: 0.5,
        y: 0.8,
        fontSize: 64,
        color: '#ffffff',
      },
    ],
    audio: [],
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [
          { id: 'a', type: 'video', src: 'a.mp4', start: 0, duration: 6, trimIn: 2 },
          {
            id: 'b',
            type: 'video',
            src: 'b.mp4',
            start: 6,
            duration: 4,
            trimIn: 0,
            transitionIn: { type: 'fade', duration: 1 },
          },
        ],
      },
      {
        id: 'pip',
        kind: 'visual',
        clips: [
          {
            id: 'c',
            type: 'video',
            src: 'c.mp4',
            start: 1,
            duration: 5,
            // Chosen so w/h land on ODD pixels before rounding (1080×0.375=405,
            // 1920×0.1505≈289). H.264 needs even dimensions, so `even()` must
            // bump both — a fixture on already-even numbers would let a plain
            // `Math.round` regression slip through this whole file.
            rect: { x: 0.1, y: 0.2, w: 0.375, h: 0.1505 },
            filter: { preset: 'vivid' },
            blur: 0.25,
            opacity: 0.6,
            speed: 2,
          },
        ],
      },
    ],
  };
}

const project = fixture();
const args = buildFFmpegArgs(project, {
  outputPath: '/tmp/out.mp4',
  baseImage: '/tmp/bg.png',
  overlayImages: { cap: '/tmp/cap.png' },
  hasAudio: () => false,
});
const graph = args[args.indexOf('-filter_complex') + 1];

/** All `overlay=X:Y:enable='between(t,S,E)'` occurrences, in graph order. */
function overlays() {
  return [
    ...graph.matchAll(
      /overlay=(-?[\d.]+):(-?[\d.]+):enable='between\(t,([\d.]+),([\d.]+)\)'/g,
    ),
  ].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    start: Number(m[3]),
    end: Number(m[4]),
  }));
}

function opsAt(t: number) {
  return frameStateAt(project, t);
}

describe('preview draw list matches the exported filtergraph', () => {
  it('places every clip on the pixel the export overlays it at', () => {
    const fromGraph = overlays();
    // main a, main b, pip c — the three visual clips, in composite order.
    expect(fromGraph.length).toBeGreaterThanOrEqual(3);

    // At t=3 all of a and c are live; check each against its graph entry.
    const ops = opsAt(3).filter((o) => o.kind === 'clip');
    const a = ops.find((o) => o.id === 'a')!;
    const c = ops.find((o) => o.id === 'c')!;

    const ga = fromGraph.find((g) => g.start === 0 && g.end === 6)!;
    const gc = fromGraph.find((g) => g.start === 1 && g.end === 6)!;

    expect([a.dst.x, a.dst.y]).toEqual([ga.x, ga.y]);
    expect([c.dst.x, c.dst.y]).toEqual([gc.x, gc.y]);
  });

  it('sizes the PiP box exactly as scale/crop does', () => {
    // `scale=rw:rh:force_original_aspect_ratio=increase,crop=rw:rh`
    const sizes = [...graph.matchAll(/scale=(\d+):(\d+):force_original_aspect_ratio=increase/g)]
      .map((m) => `${m[1]}x${m[2]}`);
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(sizes).toContain(`${c.dst.w}x${c.dst.h}`);
  });

  it('emits only the clips whose enable window is open', () => {
    const live = (t: number) =>
      opsAt(t)
        .filter((o) => o.kind === 'clip')
        .map((o) => o.id)
        .sort();
    // Graph windows: a [0,6], c [1,6], b [6,10].
    expect(live(0.5)).toEqual(['a']);
    expect(live(3)).toEqual(['a', 'c']);
    expect(live(8)).toEqual(['b']);
  });

  it('grades with the same eq parameters', () => {
    const eq = graph.match(/eq=brightness=(-?[\d.]+):contrast=([\d.]+):saturation=([\d.]+)/)!;
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(c.filter.brightness).toBe(Number(eq[1]));
    expect(c.filter.contrast).toBe(Number(eq[2]));
    expect(c.filter.saturation).toBe(Number(eq[3]));
    // …and the preview agrees with the shared resolver, not a local copy.
    expect(c.filter).toEqual(resolveFilter({ preset: 'vivid' }));
  });

  it('blurs at the same sigma', () => {
    const sigma = Number(graph.match(/gblur=sigma=([\d.]+)/)![1]);
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(c.blurSigma).toBe(sigma);
  });

  it('carries the same static opacity', () => {
    const aa = Number(graph.match(/colorchannelmixer=aa=([\d.]+)/)![1]);
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(c.alpha).toBeCloseTo(aa, 6);
  });

  it('reads the source at the time the trim/setpts pair would', () => {
    // clip c: trimIn 0, speed 2 → at t=3 (2s in) the source is at 4s.
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(c.srcTime).toBeCloseTo(4, 6);
    expect(graph).toContain('trim=start=0:duration=10'); // duration 5 × speed 2
    // clip a: trimIn 2, speed 1 → at t=3 the source is at 5s.
    expect(opsAt(3).find((o) => o.id === 'a')!.srcTime).toBeCloseTo(5, 6);
    expect(graph).toContain('trim=start=2:duration=6');
  });

  it('fades over the window the export fades over', () => {
    /*
     * Scoped to clip b's own SEGMENT, not matched against the whole graph.
     * `match` returns the FIRST hit, and a graph can now carry several `fade`
     * filters — a transition's and an element's, on different clips — so a
     * whole-graph regex would happily assert against the wrong one and keep
     * passing. A test that stops testing is worse than no test.
     */
    const seg = graph.split(';').find((s) => s.endsWith('[v1]'))!;
    const fin = seg.match(/fade=t=in:st=([\d.]+):d=([\d.]+):alpha=1/)!;
    expect(Number(fin[1])).toBe(6); // clip b starts at 6
    expect(Number(fin[2])).toBe(1);

    const fades = projectEdgeFadeMap(project);
    // Midway through b's 1s fade-in the preview must be at half alpha.
    expect(fadeFactorAt(fades.get('b'), 6, 10, 6.5)).toBeCloseTo(0.5, 6);
    expect(opsAt(6.5).find((o) => o.id === 'b')!.alpha).toBeCloseTo(0.5, 6);
    expect(opsAt(7.5).find((o) => o.id === 'b')!.alpha).toBe(1);
  });

  it('fades out the outgoing clip across the same boundary', () => {
    const seg = graph.split(';').find((s) => s.endsWith('[v0]'))!;
    const fout = seg.match(/fade=t=out:st=([\d.]+):d=([\d.]+):alpha=1/)!;
    expect(Number(fout[1])).toBe(5); // a ends at 6, fades out over the last 1s
    expect(opsAt(5.5).find((o) => o.id === 'a')!.alpha).toBeCloseTo(0.5, 6);
  });

  it('gates the text overlay on the same window and composites it last', () => {
    expect(graph).toMatch(/enable='between\(t,1,5\)'/);
    expect(opsAt(0.5).some((o) => o.kind === 'overlay')).toBe(false);
    expect(opsAt(3).some((o) => o.kind === 'overlay')).toBe(true);
    const ops = opsAt(3);
    expect(ops[ops.length - 1].kind).toBe('overlay');
    expect(ops[0].kind).toBe('background');
  });

  it('keeps track array order as z-order, not start time', () => {
    // c starts AFTER a but sits on a higher track, so it must composite later.
    const ids = opsAt(3)
      .filter((o) => o.kind === 'clip')
      .map((o) => o.id);
    expect(ids).toEqual(['a', 'c']);
  });
});

describe('colour temperature agrees between the filtergraph and the preview', () => {
  /**
   * `colortemperature` is a per-channel gain — measured against ffmpeg at
   * 4000/5000/6500/8000/9000 K over eight probe colours, every channel matching.
   * These are the fixed points of that measurement, so a change to the ported
   * curve has to break here before it can reach a preview.
   */
  it('reproduces ffmpeg kelvin2rgb at the measured points', () => {
    const at = (kelvin: number) => temperatureGains((6500 - kelvin) / 2500);
    // Byte values ffmpeg produced for pure white, over 255. ffmpeg truncates to
    // uint8, so the tolerance is one step of that quantisation.
    const near = (got: number, byte: number) => expect(got).toBeCloseTo(byte / 255, 2);
    const [r4, g4, b4] = at(4000);
    near(r4, 255); near(g4, 205); near(b4, 166);
    const [r8, g8, b8] = at(8000);
    near(r8, 221); near(g8, 229); near(b8, 255);
  });

  it('is identity at neutral, matching an omitted filter', () => {
    // `filterToFFmpeg` emits NO colortemperature at 0, so the preview must not
    // tint either — note this is deliberately not `kelvin2rgb(6500)`, which is
    // (1, 0.9965, 0.9806).
    expect(temperatureGains(0)).toEqual([1, 1, 1]);
  });

  it('drives the same Kelvin the real filtergraph carries', () => {
    const p = fixture();
    (p.tracks![1] as VisualTrack).clips[0].filter = { preset: 'warm' };
    const built = buildFFmpegArgs(p, {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      overlayImages: { cap: '/tmp/cap.png' },
      hasAudio: () => false,
    });
    const g = built[built.indexOf('-filter_complex') + 1];
    const kelvin = Number(/colortemperature=temperature=(\d+)/.exec(g)![1]);
    const c = frameStateAt(p, 3).find((o) => o.id === 'c')!;
    expect(temperatureKelvin(c.filter.temperature)).toBe(kelvin);
  });
});

describe('chroma key agrees between the filtergraph and the preview', () => {
  /** The PiP clip, typed — `Track` is a union so `clips` needs narrowing. */
  const pipClip = (p: VideoProject) => (p.tracks![1] as VisualTrack).clips[0];

  const keyed = () => {
    const p = fixture();
    pipClip(p).cutout = { color: '#00ff00', similarity: 0.3, smoothness: 0.2 };
    return p;
  };

  it('carries the key through to the draw list', () => {
    const c = frameStateAt(keyed(), 3).find((o) => o.id === 'c')!;
    expect(c.cutout).toEqual({ color: '#00ff00', similarity: 0.3, smoothness: 0.2 });
  });

  it('drives the same colour, similarity and blend the filtergraph does', () => {
    const built = buildFFmpegArgs(keyed(), {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      overlayImages: { cap: '/tmp/cap.png' },
      hasAudio: () => false,
    });
    const g = built[built.indexOf('-filter_complex') + 1];
    const m = /colorkey=color=0x([0-9a-f]{6}):similarity=([\d.]+):blend=([\d.]+)/.exec(g)!;
    const p = chromaParams(frameStateAt(keyed(), 3).find((o) => o.id === 'c')!.cutout)!;
    expect(p.key.map((v) => Math.round(v * 255))).toEqual([0, 255, 0]);
    expect(m[1]).toBe('00ff00');
    expect(Number(m[2])).toBe(p.similarity);
    expect(Number(m[3])).toBe(p.blend);
  });

  /**
   * Alpha at the exact bytes ffmpeg produced for these pixels. If the shader and
   * this reference ever disagree the matte moves, so the numbers are pinned.
   */
  it('reproduces ffmpeg alpha at the measured pixels', () => {
    const p = chromaParams({ color: '#00ff00', similarity: 0.1, smoothness: 0.5 })!;
    const a = (r: number, g: number, b: number) =>
      Math.floor(chromaAlphaAt(p, r / 255, g / 255, b / 255) * 255);
    expect(a(0, 255, 0)).toBe(0); // the key itself
    expect(a(0, 200, 0)).toBe(12);
    expect(a(64, 255, 64)).toBe(53);
    expect(a(128, 255, 128)).toBe(158);
    expect(a(0, 255, 255)).toBe(243);
    expect(a(128, 128, 128)).toBe(204);
    expect(a(255, 0, 0)).toBe(255);
  });

  it('is a hard cut when blend is zero', () => {
    const p = chromaParams({ color: '#00ff00', similarity: 0.3, smoothness: 0 })!;
    expect(chromaAlphaAt(p, 0.5, 1, 0.5)).toBe(1);
    expect(chromaAlphaAt(p, 64 / 255, 1, 64 / 255)).toBe(0);
  });
});


/**
 * Rotation and source-crop, which are the newest way for the preview and the
 * export to disagree — both change WHERE pixels land, and neither is visible in
 * the numbers the older assertions read.
 */
describe('rotation and crop', () => {
  /** The fixture plus ONE clip that is both rotated and cropped. */
  function turned(): VideoProject {
    const p = fixture();
    (p.tracks as VisualTrack[]).push({
      id: 'turned',
      kind: 'visual',
      clips: [
        {
          id: 'd',
          type: 'image',
          src: 'd.png',
          start: 2,
          duration: 4,
          // An odd-pixel rect again, and an angle that is NOT a multiple of 90,
          // so the box genuinely has to grow.
          rect: { x: 0.3, y: 0.25, w: 0.401, h: 0.2015 },
          rotation: 22.5,
          crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.55 },
        },
      ],
    });
    return p;
  }
  const build = (p: VideoProject) =>
    buildFFmpegArgs(p, {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      overlayImages: { cap: '/tmp/cap.png' },
      hasAudio: () => false,
    });
  const args2 = build(turned());
  const graph = args2[args2.indexOf('-filter_complex') + 1];
  const opsAt = (t: number) => frameStateAt(turned(), t);
  const overlays = () =>
    [
      ...graph.matchAll(
        /overlay=(-?[\d.]+):(-?[\d.]+):enable='between\(t,([\d.]+),([\d.]+)\)'/g,
      ),
    ].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      start: Number(m[3]),
      end: Number(m[4]),
    }));

  const rotated = () =>
    [...graph.matchAll(/rotate=(-?[\d.]+)\*PI\/180:c=none:ow=(\d+):oh=(\d+)/g)].map(
      (m) => ({ deg: Number(m[1]), ow: Number(m[2]), oh: Number(m[3]) }),
    );

  it('emits one rotate per rotated clip, and none for the others', () => {
    const r = rotated();
    expect(r).toHaveLength(1);
    const d = opsAt(3).find((o) => o.id === 'd')!;
    expect(r[0].deg).toBe(d.rotation);
  });

  it('sizes the rotated box with the SHARED helper, not ffmpeg rotw()/roth()', () => {
    const d = opsAt(3).find((o) => o.id === 'd')!;
    const want = rotatedBoxPx({ w: d.dst.w, h: d.dst.h }, d.rotation!);
    expect(rotated()[0]).toMatchObject({ ow: want.ow, oh: want.oh });
  });

  it('pulls the overlay origin back by half the growth, pinning the centre', () => {
    // Everything the preview knows about the box is `dst` — the UNROTATED box.
    // The export must therefore land it at dst minus the growth, or the clip
    // rotates about its corner in the file and its centre on screen.
    const d = opsAt(3).find((o) => o.id === 'd')!;
    const { dx, dy } = rotatedBoxPx({ w: d.dst.w, h: d.dst.h }, d.rotation!);
    const g = overlays().find((o) => o.start === 2 && o.end === 6)!;
    expect([g.x, g.y]).toEqual([d.dst.x - dx, d.dst.y - dy]);
    // And the two centres agree, which is the property that actually matters.
    const { ow, oh } = rotatedBoxPx({ w: d.dst.w, h: d.dst.h }, d.rotation!);
    expect([g.x + ow / 2, g.y + oh / 2]).toEqual([
      d.dst.x + d.dst.w / 2,
      d.dst.y + d.dst.h / 2,
    ]);
  });

  it('forces an alpha plane on a rotated clip', () => {
    // `rotate=…:c=none` writes a transparent fill; with no alpha plane that
    // fill is opaque BLACK and every rotated clip gets black corners.
    const seg = graph
      .split(';')
      .find((s) => s.includes('scale=') && s.includes('[vq'))!;
    expect(seg).toContain('format=rgba');
  });

  it('crops the SOURCE, and does it before the cover-fit', () => {
    const d = opsAt(3).find((o) => o.id === 'd')!;
    expect(d.srcRect).toEqual({ x: 0.1, y: 0.2, w: 0.6, h: 0.55 });
    const seg = graph.split(';').find((s) => s.includes('[vq'))!;
    const crop = seg.indexOf('crop=iw*0.6:ih*0.55:iw*0.1:ih*0.2');
    const cover = seg.indexOf('force_original_aspect_ratio=increase');
    expect(crop).toBeGreaterThanOrEqual(0);
    // Order IS the argument that nothing crops twice: the one cover-fit reads
    // from the window the user chose.
    expect(crop).toBeLessThan(cover);
  });

  it('leaves the graph byte-identical for a project with neither', () => {
    // The whole point of the feature not being a rewrite: an existing project
    // must produce exactly the bytes it produced before.
    const plain = turned();
    const withFields = turned();
    // …with the rotation and crop stripped from BOTH, so what is compared is
    // "fields present but neutral" against "fields absent".
    for (const track of plain.tracks as VisualTrack[])
      for (const clip of track.clips) {
        delete (clip as { rotation?: number }).rotation;
        delete (clip as { crop?: unknown }).crop;
      }
    for (const track of withFields.tracks as VisualTrack[]) {
      for (const clip of track.clips) {
        (clip as { rotation?: number }).rotation = 0;
        (clip as { crop?: unknown }).crop = { x: 0, y: 0, w: 1, h: 1 };
      }
    }
    // A zero rotation and a whole-frame crop are the same as not having them.
    expect(build(withFields)).toEqual(build(plain));
    expect(build(plain).join(' ')).not.toContain('rotate=');
    expect(build(plain).join(' ')).not.toContain('crop=iw*');
  });

  it('agrees on the unrotated box, which is what dst means', () => {
    const d = opsAt(3).find((o) => o.id === 'd')!;
    expect({ x: d.dst.x, y: d.dst.y, w: d.dst.w, h: d.dst.h }).toEqual(
      clipRectPx({ x: 0.3, y: 0.25, w: 0.401, h: 0.2015 }, 1080, 1920),
    );
  });
});

/*
 * The canvas frame reaches ffmpeg as a rasterized PNG, so — unlike a grade or
 * an overlay position — there are no numbers in the filtergraph to compare a
 * preview against. That is the same position the background and the captions
 * are already in, and it is why this file asserts nothing about background
 * colour either. The geometry's teeth live in `canvas-frame.test.ts`.
 *
 * What the graph CAN prove is the two things that would actually go wrong, and
 * both of them look nearly right in a thumbnail.
 */
describe('element animation matches between preview and export', () => {
  const animated = (
    a: Partial<Pick<VisualTrackClip, 'animateIn' | 'animateOut' | 'blend'>>,
  ): VideoProject => {
    const p = fixture();
    (p.tracks as VisualTrack[])[0].clips = [
      { id: 'a', type: 'video', src: 'a.mp4', start: 0, duration: 6, ...a },
    ];
    (p.tracks as VisualTrack[]).length = 1;
    p.overlays = [];
    return p;
  };
  const build = (p: VideoProject) =>
    buildFFmpegArgs(p, {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      hasAudio: () => false,
    });
  const graphOf = (p: VideoProject) => {
    const a = build(p);
    return a[a.indexOf('-filter_complex') + 1];
  };

  it('gives a faded clip an alpha plane to fade INTO', () => {
    /*
     * The landmine. `fade=alpha=1` on a stream with no alpha plane does
     * nothing at all, and the format is otherwise chosen from the TRANSITION
     * fade alone — so an element fade on a clip with no transition, no mask,
     * no opacity and no key would have previewed as a fade and exported as a
     * hard cut, with nothing in the graph to show for it.
     */
    const g = graphOf(animated({ animateIn: { type: 'fade', duration: 1 } }));
    expect(g).toContain('format=yuva420p');
    expect(g).toContain('fade=t=in:st=0:d=1:alpha=1');
  });

  it('agrees on the alpha at sampled times', () => {
    const p = animated({
      animateIn: { type: 'fade', duration: 1 },
      animateOut: { type: 'fade', duration: 2 },
    });
    const alphaAt = (t: number) =>
      frameStateAt(p, t).find((o) => o.id === 'a')!.alpha;
    expect(alphaAt(0)).toBe(0);
    expect(alphaAt(0.5)).toBeCloseTo(0.5, 9);
    expect(alphaAt(3)).toBe(1);
    expect(alphaAt(5)).toBeCloseTo(0.5, 9);
    expect(alphaAt(6)).toBe(0);
    // …and the export's windows are the same two numbers.
    const g = graphOf(p);
    expect(g).toContain('fade=t=in:st=0:d=1:alpha=1');
    expect(g).toContain('fade=t=out:st=4:d=2:alpha=1');
  });

  it('slides by the same pixels the expression computes', () => {
    const p = animated({
      animateIn: { type: 'slide', duration: 1, edge: 'left' },
    });
    const g = graphOf(p);
    const m = g.match(/overlay='([^']+)':/)!;
    // The expression is in the graph…
    expect(m[1]).toContain('clip(');
    // …and the preview's dst carries the same offset at the same instants.
    const travel = SLIDE_DISTANCE * 1080;
    expect(frameStateAt(p, 0).find((o) => o.id === 'a')!.dst.x).toBe(-travel);
    expect(frameStateAt(p, 0.5).find((o) => o.id === 'a')!.dst.x).toBe(
      -travel / 2,
    );
    expect(frameStateAt(p, 1).find((o) => o.id === 'a')!.dst.x).toBe(0);
  });

  it('holds a BLENDED clip still, because the export cannot move it', () => {
    /*
     * The blend branch crops the base region under the clip and `crop` cannot
     * vary its width or height per frame, so a moving box is not expressible.
     * Both previews must therefore hold it still — this used to be a real
     * drift, with the export pinning a keyframed clip while `frameStateAt`
     * moved it.
     */
    const p = animated({
      blend: 'screen',
      animateIn: { type: 'slide', duration: 1, edge: 'left' },
    });
    expect(frameStateAt(p, 0).find((o) => o.id === 'a')!.dst.x).toBe(0);
    expect(graphOf(p)).not.toMatch(/overlay='/);
  });

  it('still fades a blended clip, because that part DOES survive', () => {
    // The fade is baked into the alpha plane before the blend branch merges it
    // back on, so only movement is lost. Gating the whole animation would have
    // removed something that works.
    const p = animated({
      blend: 'screen',
      animateIn: { type: 'fade', duration: 1 },
    });
    expect(frameStateAt(p, 0.5).find((o) => o.id === 'a')!.alpha).toBeCloseTo(
      0.5,
      9,
    );
    expect(graphOf(p)).toContain('fade=t=in:st=0:d=1:alpha=1');
  });

  it('leaves the graph byte-identical without animation, and for a legacy caption', () => {
    // Neutral fields must cost nothing…
    const none = animated({});
    const neutral = animated({ animateIn: { type: 'none', duration: 1 } });
    expect(build(neutral)).toEqual(build(none));
    // …and a stored `animation:'fade'` must render exactly as it always has,
    // which is the whole migration story in one assertion.
    const legacy = fixture();
    const viaNew = fixture();
    legacy.overlays[0].animation = 'fade';
    viaNew.overlays[0].animateIn = { type: 'fade', duration: 0.3 };
    viaNew.overlays[0].animateOut = { type: 'fade', duration: 0.3 };
    expect(graphOf(viaNew)).toBe(graphOf(legacy));
  });
});

describe('the canvas frame is composited in the right place', () => {
  const framed = (): VideoProject => ({
    ...fixture(),
    frame: { color: '#ffffff', width: 0.04, radius: 0.06 },
  });
  const build = (p: VideoProject, frameImage?: string) =>
    buildFFmpegArgs(p, {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      overlayImages: { cap: '/tmp/cap.png' },
      frameImage,
      hasAudio: () => false,
      output: { width: 2160, height: 3840 },
    });
  const fArgs = build(framed(), '/tmp/frame.png');
  const fGraph = fArgs[fArgs.indexOf('-filter_complex') + 1];

  it('lands after every clip and every caption', () => {
    // A frame something can cover is not a frame. This catches the one
    // ordering mistake anyone actually makes: inserting it before the captions.
    const segs = fGraph.split(';');
    const frameSeg = segs.findIndex((s) => s.includes('[fr]overlay=0:0'));
    const lastContent = Math.max(
      ...segs.map((s, i) => (/\[(c|tc)\d+\]$/.test(s) ? i : -1)),
    );
    expect(frameSeg).toBeGreaterThan(-1);
    expect(frameSeg).toBeGreaterThan(lastContent);
  });

  it('lands BEFORE the output resize, or a 4K export gets a quarter-thick mat', () => {
    // The mat is authored against the project (1080) and the tail scales to
    // the requested output (2160). Composite after that scale and the band is
    // half the width the preview showed — in each axis, so a quarter the area.
    expect(fGraph.indexOf('[fr]overlay=0:0')).toBeLessThan(
      fGraph.indexOf('scale=2160:3840'),
    );
  });

  it('lands BEFORE the HDR conversion, or its white is the wrong white', () => {
    const hdrArgs = buildFFmpegArgs(framed(), {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      overlayImages: { cap: '/tmp/cap.png' },
      frameImage: '/tmp/frame.png',
      hasAudio: () => false,
      output: { hdr: true },
    });
    const g = hdrArgs[hdrArgs.indexOf('-filter_complex') + 1];
    // After the conversion, the mat's Rec.709 codes would be composited into a
    // stream that is then TAGGED PQ BT.2020 without being converted — the exact
    // mistagging `hdr.ts` exists to prevent.
    expect(g.indexOf('[fr]overlay=0:0')).toBeLessThan(g.indexOf('zscale'));
  });

  it('is the LAST input, so no clip or caption index shifts', () => {
    // Every index comes from `idx++`. Inserting the frame anywhere earlier
    // repoints every other input at the wrong file, silently.
    const iAt = fArgs.reduce<number[]>(
      (acc, a, i) => (a === '-i' ? [...acc, i] : acc),
      [],
    );
    expect(fArgs[iAt[iAt.length - 1] + 1]).toBe('/tmp/frame.png');
  });

  it('is the last op in the preview too', () => {
    const ops = frameStateAt(framed(), 3);
    expect(ops[ops.length - 1].kind).toBe('frame');
  });

  it('leaves the graph byte-identical when the frame paints nothing', () => {
    // A frame of zero width and zero radius must cost nothing at all — not an
    // input, not a decode, not a composite pass per frame. `hasCanvasFrame`
    // gates the caller, so no `frameImage` is produced and none is wired.
    const neutral: VideoProject = {
      ...fixture(),
      frame: { color: '#ffffff', width: 0, radius: 0 },
    };
    expect(build(neutral)).toEqual(build(fixture()));
    expect(build(fixture()).join(' ')).not.toContain('[fr]overlay=0:0');
  });
});

/**
 * A boundary the clips actually overlap on — the shape the editor produces now.
 *
 * The fixture above is the FALLBACK: its clips are butt-joined, so there is no
 * instant where both are on screen, and a transition there can only ramp through
 * the background as it always did. This one is the real thing.
 */
describe('an overlapping boundary crossfades instead of dipping to black', () => {
  function crossfade(overlap = 1, bDur = 4): VideoProject {
    const base = fixture();
    const main = base.tracks![0] as VisualTrack;
    const a = main.clips[0];
    const b = main.clips[1];
    return {
      ...base,
      overlays: [],
      tracks: [
        {
          ...main,
          clips: [
            a,
            {
              ...b,
              start: a.start + a.duration - overlap,
              duration: bDur,
              transitionIn: { type: 'fade', duration: overlap },
            },
          ],
        },
        base.tracks![1],
      ],
    };
  }

  const graphOf = (p: VideoProject) => {
    const a = buildFFmpegArgs(p, {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      hasAudio: () => false,
    });
    return a[a.indexOf('-filter_complex') + 1];
  };

  it('ramps the INCOMING clip up over the overlap', () => {
    const g = graphOf(crossfade());
    const seg = g.split(';').find((s) => s.endsWith('[v1]'))!;
    const fin = seg.match(/fade=t=in:st=([\d.]+):d=([\d.]+):alpha=1/)!;
    // b now starts at 5, one second before a ends.
    expect(Number(fin[1])).toBe(5);
    expect(Number(fin[2])).toBe(1);
  });

  it('leaves the OUTGOING clip alone — it is what the fade reveals', () => {
    /*
     * The whole point of the overlap. Drawing b over a at alpha p is
     * `p*b + (1-p)*a`, which is exactly what `xfade=transition=fade` computes;
     * fading a out as well would take the picture to the background in the
     * middle and cost twice the duration, which is what this replaced.
     */
    const g = graphOf(crossfade());
    const seg = g.split(';').find((s) => s.endsWith('[v0]'))!;
    expect(seg).not.toContain('fade=t=out');
  });

  it('has both clips live at once, in composite order', () => {
    const p = crossfade();
    const ops = frameStateAt(p, 5.5).filter((o) => o.kind === 'clip');
    const ids = ops.map((o) => o.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
  });

  it('agrees with the graph on the alpha of each side', () => {
    const p = crossfade();
    const at = (t: number, id: string) =>
      frameStateAt(p, t).find((o) => o.id === id)!.alpha;
    expect(at(5.5, 'b')).toBeCloseTo(0.5, 6);
    expect(at(5.5, 'a')).toBe(1);
    expect(at(5, 'b')).toBeCloseTo(0, 6);
    expect(at(6, 'b')).toBeCloseTo(1, 6);
  });

  it('gates each clip on the window the export overlays it in', () => {
    const g = graphOf(crossfade());
    expect(g).toContain("enable='between(t,0,6)'");
    expect(g).toContain("enable='between(t,5,9)'");
  });

  it('reports one boundary, and its overlap is the geometry', () => {
    const main = crossfade(1.5).tracks![0] as VisualTrack;
    const r = resolveTransitions(main.clips);
    expect(r.edges).toEqual([]);
    expect(r.boundaries).toHaveLength(1);
    expect(r.boundaries[0]).toMatchObject({
      prevId: 'a',
      nextId: 'b',
      name: 'fade',
      overlap: 1.5,
      at: 4.5,
    });
  });

  it('clamps an overlap that would swallow half a clip', () => {
    // b is 2s long, so no more than 1s of it may be spent transitioning — past
    // that it would never once be seen whole.
    const main = crossfade(1.6, 2).tracks![0] as VisualTrack;
    const r = resolveTransitions(main.clips);
    expect(r.boundaries[0].overlap).toBe(1);
  });

  it('falls back to a background ramp when the clips only touch', () => {
    const main = fixture().tracks![0] as VisualTrack;
    const r = resolveTransitions(main.clips);
    expect(r.boundaries).toEqual([]);
    expect(r.edges).toEqual([
      { index: 1, clipId: 'b', duration: 1, reason: 'no-overlap' },
    ]);
  });
});

describe('a geometric transition is built as one xfade run', () => {
  /**
   * `n` main-track clips, each 4s, joined by the given transitions. `types[k]`
   * is what arrives at clip `k + 1`; `undefined` is a plain cut, which leaves
   * the clips butt-joined.
   */
  function chain(types: (string | undefined)[], overlap = 1): VideoProject {
    const base = fixture();
    const main = base.tracks![0] as VisualTrack;
    const src = main.clips[0];
    const clips: VisualTrackClip[] = [];
    let cursor = 0;
    types.forEach((type, k) => {
      const ov = type ? overlap : 0;
      if (k === 0) {
        clips.push({ ...src, id: 'c0', src: 'c0.mp4', start: 0, duration: 4 });
        cursor = 4;
      }
      const start = cursor - ov;
      clips.push({
        ...src,
        id: `c${k + 1}`,
        src: `c${k + 1}.mp4`,
        start,
        duration: 4,
        ...(type ? { transitionIn: { type, duration: overlap } as never } : {}),
      });
      cursor = start + 4;
    });
    return {
      ...base,
      overlays: [],
      tracks: [{ ...main, clips }],
    };
  }

  const graphOf = (p: VideoProject) => {
    const a = buildFFmpegArgs(p, {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      hasAudio: () => false,
    });
    return a[a.indexOf('-filter_complex') + 1];
  };
  /** Every `xfade=` in the graph, as `[name, duration, offset]`. */
  const xfadesIn = (g: string) =>
    [...g.matchAll(/xfade=transition=(\w+):duration=([\d.]+):offset=([\d.]+)/g)].map(
      (m) => [m[1], Number(m[2]), Number(m[3])] as const,
    );

  it('emits the token, the overlap and the offset the timeline implies', () => {
    const p = chain(['wipeleft']);
    // c1 starts at 3, the run starts at 0, so the transition begins 3s in.
    expect(xfadesIn(graphOf(p))).toEqual([['wipeleft', 1, 3]]);
    const main = (p.tracks![0] as VisualTrack).clips;
    expect(main.map((c) => c.start)).toEqual([0, 3]);
  });

  it('takes the offset from the clip, not from an accumulator', () => {
    /*
     * The two agree only while the resolver's clamp does not bite. Here it
     * does — a 3s transition onto a 4s clip is cut to 2 — and an accumulator
     * would put the transition at `4 - 2 = 2s` while the clip, and therefore
     * `frameStateAt`, has it at 1.
     */
    const p = chain(['wipeleft'], 3);
    const main = (p.tracks![0] as VisualTrack).clips;
    expect(main[1].start).toBe(1);
    expect(xfadesIn(graphOf(p))).toEqual([['wipeleft', 2, 1]]);
  });

  it('chains a whole run through one filtergraph branch', () => {
    const g = graphOf(chain(['wipeleft', 'slideup', 'circleopen']));
    expect(xfadesIn(g)).toEqual([
      ['wipeleft', 1, 3],
      ['slideup', 1, 6],
      ['circleopen', 1, 9],
    ]);
    // One run means one composite onto the canvas, not four.
    expect(g.match(/\[xr\d+\]overlay=0:0/g)).toHaveLength(1);
  });

  it('does not ramp the incoming clip as well as wiping it', () => {
    /*
     * Both at once hands `xfade` a half-transparent picture to work on. It
     * measured 252/255 away from the transition asked for, on every geometric
     * family at once, and it looked entirely plausible in the graph.
     */
    const g = graphOf(chain(['wipeleft']));
    expect(g.split(';').find((s) => s.endsWith('[v1]'))).not.toContain('fade=t=in');
  });

  it('pads each clip to the canvas before joining them', () => {
    // `xfade` demands two streams of identical size, and a clip is only as big
    // as its rect. rgba, so the blending families mix where the previews mix.
    const g = graphOf(chain(['wipeleft']));
    expect(g).toContain('color=c=black@0:s=1080x1920:r=30:d=4,format=rgba[xp0]');
    expect(g).toContain('[xp0][v0]overlay=0:0:eof_action=pass,format=rgba[xc0]');
  });

  it('anchors the finished run once, onto the timeline', () => {
    const p = chain([undefined, 'wipeleft']);
    const main = (p.tracks![0] as VisualTrack).clips;
    // c0 0-4, c1 4-8, c2 laid back to 7. The run is c1+c2 only.
    expect(main.map((c) => c.start)).toEqual([0, 4, 7]);
    const g = graphOf(p);
    expect(xfadesIn(g)).toEqual([['wipeleft', 1, 3]]);
    expect(g).toContain('setpts=PTS-STARTPTS+4/TB,format=yuva420p[xr1]');
    expect(g).toContain("[xr1]overlay=0:0:enable='between(t,4,11)'");
  });

  it('leaves a fade off the run entirely', () => {
    /*
     * With the clips already overlapping, drawing b over a at alpha p IS
     * `xfade=fade`. Keeping it on the per-clip path is what makes every
     * project that predates the geometric families emit the graph it always
     * did — this file's other 40-odd assertions are that guarantee.
     */
    const g = graphOf(chain(['fade']));
    expect(xfadesIn(g)).toEqual([]);
    expect(g.split(';').find((s) => s.endsWith('[v1]'))).toContain('fade=t=in');
  });

  it('breaks the run at a cut and starts a new one after it', () => {
    const g = graphOf(chain(['wipeleft', undefined, 'wipeleft']));
    expect(xfadesIn(g)).toEqual([
      ['wipeleft', 1, 3],
      ['wipeleft', 1, 3],
    ]);
    // Two runs, so two composites: the second lands over the first.
    expect(g.match(/\[xr\d+\]overlay=0:0/g)).toHaveLength(2);
  });

  it('agrees with the preview on when each clip is on screen', () => {
    /*
     * The run is one layer to ffmpeg and two clips to `frameStateAt`, so the
     * one thing they must not disagree about is the window. Sampled either
     * side of the transition and in the middle of it.
     */
    const p = chain(['wipeleft']);
    const live = (t: number) =>
      frameStateAt(p, t)
        .filter((o) => o.kind === 'clip')
        .map((o) => o.id);
    expect(live(2)).toEqual(['c0']);
    expect(live(3.5)).toEqual(['c0', 'c1']);
    expect(live(5)).toEqual(['c1']);
    const g = graphOf(p);
    expect(g).toContain("enable='between(t,0,7)'"); // the run, end to end
  });

  it('keeps a blended clip out of the run, and its transition', () => {
    /*
     * A blended clip's export branch reads the canvas accumulated UNDER it,
     * and inside a run there is no such canvas — the run is composited as one
     * unit. The resolver downgrades the boundary to a fade rather than
     * dropping it, which with overlap costs nothing.
     */
    const p = chain(['wipeleft']);
    const main = p.tracks![0] as VisualTrack;
    const blended: VideoProject = {
      ...p,
      tracks: [
        {
          ...main,
          clips: [main.clips[0], { ...main.clips[1], blend: 'screen' } as never],
        },
      ],
    };
    const r = resolveTransitions((blended.tracks![0] as VisualTrack).clips);
    expect(r.boundaries[0]).toMatchObject({ name: 'fade', downgraded: 'blend' });
    const g = graphOf(blended);
    expect(xfadesIn(g)).toEqual([]);
    expect(g).toContain('blend=all_mode=screen');
  });
});
