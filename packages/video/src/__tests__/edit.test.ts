/**
 * The three ops added for canvas frame, element animation and clip transform.
 *
 * Every assertion here is about the SAME rule, which is the one that regresses
 * silently: **switching a feature off must delete its field, not store a
 * neutral value.** Nothing in the UI can see the difference, and neither can a
 * casual reading of the preview — but the export can. `hasCanvasFrame` decides
 * whether an overlay input is appended, `hasFade` joins the condition that
 * picks `yuva420p`, and a `rotate` needs `format=rgba` to avoid black corners.
 * A project someone has switched a thing back off on has to produce a
 * byte-identical filtergraph to one that never had it, and the only way to
 * guarantee that is for the field to be absent.
 *
 * These are asserted with `Object.keys`, not with `toEqual`: `toEqual` treats
 * an explicit `undefined` and an absent key as the same thing, so it would pass
 * on exactly the bug being guarded against.
 */
import { describe, expect, it } from 'vitest';
import type { TextOverlay, VideoProject, VisualTrackClip } from '../types';
import {
  patchClip,
  setClipTransform,
  setElementAnim,
  setFrame,
  updateOverlay,
} from '../edit';

const clip: VisualTrackClip = {
  id: 'c1',
  type: 'image',
  src: 'orbit-media:x',
  start: 0,
  duration: 4,
};

const base = (): VideoProject => ({
  id: 'p',
  schemaVersion: 3,
  width: 1920,
  height: 1080,
  fps: 30,
  background: { type: 'color', color: '#000000' },
  clips: [],
  overlays: [
    {
      id: 'o1',
      type: 'text',
      text: 'Hi',
      start: 0,
      end: 2,
      x: 0.5,
      y: 0.8,
      fontSize: 64,
      color: '#ffffff',
    },
  ],
  audio: [],
  tracks: [
    { id: 't1', kind: 'visual', clips: [{ ...clip }] },
    {
      id: 't2',
      kind: 'audio',
      clips: [{ id: 'a1', src: 'orbit-media:y', start: 0, duration: 6 }],
    },
  ],
});

const clipOf = (p: VideoProject) =>
  (p.tracks ?? []).flatMap((t) => (t.kind === 'visual' ? t.clips : []))[0];

const audioOf = (p: VideoProject) =>
  (p.tracks ?? []).flatMap((t) => (t.kind === 'audio' ? t.clips : []))[0];

describe('patchClip', () => {
  /*
   * This one is a REGRESSION, not a new feature. `patchClip` skipped every
   * non-visual track, so the audio clip's volume slider called it, it walked
   * past the only track that clip could be on, and the project came back
   * unchanged — a control that looked live and did nothing.
   */
  it('reaches a clip on an audio track', () => {
    const p = patchClip(base(), 'a1', { volume: 0.4 });
    expect(audioOf(p).volume).toBe(0.4);
  });

  it('still reaches a clip on a visual track', () => {
    expect(clipOf(patchClip(base(), 'c1', { opacity: 0.5 })).opacity).toBe(0.5);
  });

  it('leaves untouched tracks IDENTICAL, not merely equal', () => {
    // Object identity is what the timeline and the preview use to decide what
    // to re-render; a shared `touched` flag rebuilt every track after the match.
    const before = base();
    const after = patchClip(before, 'c1', { opacity: 0.5 });
    expect(after.tracks![1]).toBe(before.tracks![1]);
  });

  it('is a no-op for an id that is on no track', () => {
    const p = base();
    expect(patchClip(p, 'nope', { opacity: 0.5 })).toBe(p);
  });
});

describe('setFrame', () => {
  it('stores the frame it is given', () => {
    const p = setFrame(base(), { color: '#ffffff', width: 0.04 });
    expect(p.frame).toEqual({ color: '#ffffff', width: 0.04 });
  });

  it('DELETES the key rather than setting it undefined', () => {
    const on = setFrame(base(), { color: '#ffffff', width: 0.04 });
    const off = setFrame(on, undefined);
    expect('frame' in off).toBe(false);
    expect(Object.keys(off).sort()).toEqual(Object.keys(base()).sort());
  });

  it('is a no-op when there was no frame, so nothing lands in history', () => {
    const p = base();
    expect(setFrame(p, undefined)).toBe(p);
  });
});

describe('setElementAnim', () => {
  it('sets both ends on a clip', () => {
    const p = setElementAnim(
      base(),
      'c1',
      { type: 'fade', duration: 0.5 },
      { type: 'slide', duration: 0.4, edge: 'right' },
    );
    expect(clipOf(p).animateIn).toEqual({ type: 'fade', duration: 0.5 });
    expect(clipOf(p).animateOut).toEqual({ type: 'slide', duration: 0.4, edge: 'right' });
  });

  it('finds a text overlay by the same id path', () => {
    const p = setElementAnim(base(), 'o1', { type: 'fade', duration: 0.3 }, undefined);
    expect(p.overlays[0].animateIn).toEqual({ type: 'fade', duration: 0.3 });
    // ...and did not wander onto the clip while looking for it.
    expect('animateIn' in clipOf(p)).toBe(false);
  });

  it("treats type 'none' as off, and off as absent", () => {
    const on = setElementAnim(base(), 'c1', { type: 'fade', duration: 0.5 }, undefined);
    const off = setElementAnim(on, 'c1', { type: 'none', duration: 0.5 }, undefined);
    expect('animateIn' in clipOf(off)).toBe(false);
    expect(Object.keys(clipOf(off)).sort()).toEqual(Object.keys(clip).sort());
  });

  it('clearing one end leaves the other alone', () => {
    const both = setElementAnim(
      base(),
      'c1',
      { type: 'fade', duration: 0.5 },
      { type: 'fade', duration: 0.5 },
    );
    const outOnly = setElementAnim(both, 'c1', undefined, { type: 'fade', duration: 0.5 });
    expect('animateIn' in clipOf(outOnly)).toBe(false);
    expect(clipOf(outOnly).animateOut).toEqual({ type: 'fade', duration: 0.5 });
  });
});

describe('setClipTransform', () => {
  it('normalizes an angle on the way in', () => {
    // The model's range is (-180, 180], NOT 0..360 — so a left turn stays
    // negative and the slider can be a plain symmetric -180..180.
    expect(clipOf(setClipTransform(base(), 'c1', { rotation: 370 })).rotation).toBe(10);
    expect(clipOf(setClipTransform(base(), 'c1', { rotation: -90 })).rotation).toBe(-90);
    expect(clipOf(setClipTransform(base(), 'c1', { rotation: 270 })).rotation).toBe(-90);
    expect(clipOf(setClipTransform(base(), 'c1', { rotation: 180 })).rotation).toBe(180);
  });

  it('drops a rotation of zero, however it was expressed', () => {
    const turned = setClipTransform(base(), 'c1', { rotation: 90 });
    for (const deg of [0, 360, -360]) {
      const straight = setClipTransform(turned, 'c1', { rotation: deg });
      expect('rotation' in clipOf(straight)).toBe(false);
    }
  });

  it('drops a full-frame crop', () => {
    const cropped = setClipTransform(base(), 'c1', { crop: { x: 0.25, y: 0, w: 0.75, h: 1 } });
    expect(clipOf(cropped).crop).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
    const whole = setClipTransform(cropped, 'c1', { crop: { x: 0, y: 0, w: 1, h: 1 } });
    expect('crop' in clipOf(whole)).toBe(false);
  });

  it('returns a clip to its exact original shape once both are neutral', () => {
    const messed = setClipTransform(base(), 'c1', {
      rotation: 20,
      crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    });
    const reset = setClipTransform(messed, 'c1', {
      rotation: 0,
      crop: { x: 0, y: 0, w: 1, h: 1 },
    });
    expect(Object.keys(clipOf(reset)).sort()).toEqual(Object.keys(clip).sort());
  });

  it('clamps a crop that runs outside the source', () => {
    const p = setClipTransform(base(), 'c1', { crop: { x: -0.5, y: 0.2, w: 2, h: 0.5 } });
    const c = clipOf(p).crop!;
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y + c.h).toBeLessThanOrEqual(1);
    expect(c.x + c.w).toBeLessThanOrEqual(1);
  });

  it('moves only the fields it was handed', () => {
    const withRect = setClipTransform(base(), 'c1', { rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } });
    const turned = setClipTransform(withRect, 'c1', { rotation: 45 });
    expect(clipOf(turned).rect).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });
});

describe('updateOverlay', () => {
  // Narrowed once, here: `Overlay` is a union and this suite is entirely about
  // a caption. A cast would hide the day one of these fixtures stops being one.
  const overlayOf = (p: VideoProject): TextOverlay => {
    const o = p.overlays[0];
    if (o.type !== 'text') throw new Error(`expected a caption, got ${o.type}`);
    return o;
  };

  it('sets a field', () => {
    expect(overlayOf(updateOverlay(base(), 'o1', { maxWidth: 800 })).maxWidth).toBe(800);
  });

  it('REMOVES a field patched with undefined rather than parking one there', () => {
    /*
     * `linesOf` branches on presence, so a `maxWidth` key holding `undefined`
     * and no key at all render the same today — and would stop doing so the
     * moment anything asked `'maxWidth' in o`. More immediately, a project
     * whose wrap was switched back off has to serialise as the project it was
     * before, or a sync diff shows a change nobody made.
     */
    const wrapped = updateOverlay(base(), 'o1', { maxWidth: 800 });
    const off = updateOverlay(wrapped, 'o1', { maxWidth: undefined });
    expect(Object.keys(overlayOf(off))).not.toContain('maxWidth');
  });

  it('leaves the other overlays and the rest of the project alone', () => {
    const p = base();
    const next = updateOverlay(p, 'o1', { maxWidth: 800 });
    expect(next.tracks).toBe(p.tracks);
    expect(overlayOf(next).text).toBe('Hi');
  });

  it('is a no-op for an id that is not there', () => {
    const p = base();
    expect(overlayOf(updateOverlay(p, 'nope', { maxWidth: 800 })).maxWidth).toBeUndefined();
  });
});
