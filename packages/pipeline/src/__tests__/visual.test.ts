/**
 * Choosing a scene's picture.
 *
 * The searching and the fetching are one call each. The part with judgement in
 * it is which of twenty results to use, and it is where an automatic video
 * visibly fails — a landscape shot in a 9:16 frame shows a narrow vertical
 * slice of the middle, and nothing downstream can repair that.
 *
 * So most of what is asserted here is the RELAXATION ORDER: which requirement
 * gets given up first when the search cannot satisfy all of them, and that
 * every one given up is reported rather than swallowed.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Asset, AssetProvider } from '@layera-labs/orbit-shared';
import {
  NoVisualError,
  aspectMismatch,
  pickAsset,
  resolveVisual,
  retainedFraction,
  type AssetStore,
  type VisualWant,
} from '../visual.ts';

const VERTICAL: VisualWant = { width: 1080, height: 1920, kind: 'image' };

const asset = (over: Partial<Asset> & { id: string }): Asset => ({
  type: 'image',
  src: `https://cdn/${over.id}.jpg`,
  width: 1080,
  height: 1920,
  ...over,
});

describe('aspectMismatch', () => {
  it('is zero for an exact match and symmetric either side', () => {
    expect(aspectMismatch(asset({ id: 'a' }), VERTICAL)).toBeCloseTo(0, 9);
    // 16:9 into 9:16 and 9:16 into 16:9 are the same crop, opposite directions.
    const wide = asset({ id: 'w', width: 1920, height: 1080 });
    const tall = asset({ id: 't', width: 1080, height: 1920 });
    expect(aspectMismatch(wide, VERTICAL)).toBeCloseTo(
      aspectMismatch(tall, { ...VERTICAL, width: 1920, height: 1080 }),
      9,
    );
  });

  it('treats an asset with no dimensions as unusable rather than perfect', () => {
    expect(aspectMismatch(asset({ id: 'x', width: undefined, height: undefined }), VERTICAL))
      .toBe(Infinity);
  });
});

describe('pickAsset', () => {
  it('takes a vertical shot over a landscape one', () => {
    const chosen = pickAsset(
      [
        asset({ id: 'wide', width: 1920, height: 1080 }),
        asset({ id: 'tall', width: 1080, height: 1920 }),
      ],
      VERTICAL,
    );
    expect(chosen!.asset.id).toBe('tall');
    expect(chosen!.compromises).toEqual([]);
  });

  /*
   * Everything is downscaled into the frame anyway, so a 4K master buys nothing
   * and costs a download on every scene of every generation.
   */
  it('takes the smallest that still fills the frame', () => {
    const chosen = pickAsset(
      [
        asset({ id: 'huge', width: 2160, height: 3840 }),
        asset({ id: 'enough', width: 1080, height: 1920 }),
        asset({ id: 'big', width: 1440, height: 2560 }),
      ],
      VERTICAL,
    );
    expect(chosen!.asset.id).toBe('enough');
  });

  /*
   * Shape beats size among assets that BOTH qualify. Sorting on size alone
   * would take the 4:5 here — it is fewer pixels — and crop 30% off a scene
   * when an exact match was sitting in the same result set.
   */
  it('prefers the closer shape even when it is the larger file', () => {
    const chosen = pickAsset(
      [
        asset({ id: 'four-five', width: 1600, height: 2000 }),
        asset({ id: 'exact', width: 1440, height: 2560 }),
      ],
      VERTICAL,
    );
    expect(chosen!.asset.id).toBe('exact');
  });

  it('ignores results of the wrong kind', () => {
    const chosen = pickAsset(
      [asset({ id: 'img' }), asset({ id: 'vid', type: 'video', duration: 10 })],
      { ...VERTICAL, kind: 'video' },
    );
    expect(chosen!.asset.id).toBe('vid');
  });

  it('gives back nothing when the search found nothing of the kind', () => {
    expect(pickAsset([asset({ id: 'img' })], { ...VERTICAL, kind: 'video' })).toBeNull();
    expect(pickAsset([], VERTICAL)).toBeNull();
  });

  /*
   * The relaxation order is the claim this file exists to pin down, and it is
   * the reverse of the obvious guess. Soft is the mildest failure; a hole is
   * the worst.
   */
  describe('relaxation order', () => {
    it('gives up resolution first — soft beats badly cropped', () => {
      const chosen = pickAsset(
        [
          asset({ id: 'small-tall', width: 540, height: 960 }),
          asset({ id: 'big-wide', width: 3840, height: 2160 }),
        ],
        VERTICAL,
      );
      expect(chosen!.asset.id).toBe('small-tall');
      expect(chosen!.compromises).toEqual(['resolution']);
    });

    it('gives up aspect second, when nothing of the right shape exists', () => {
      const chosen = pickAsset([asset({ id: 'wide', width: 1920, height: 1080 })], VERTICAL);
      expect(chosen!.asset.id).toBe('wide');
      expect(chosen!.compromises).toEqual(['resolution', 'aspect']);
    });

    /*
     * Duration goes last because it is the only compromise that leaves a HOLE:
     * a video shorter than its scene runs out, and there is no looping in the
     * engine to cover it.
     */
    it('gives up duration last, preferring a badly cropped clip that is long enough', () => {
      const want: VisualWant = { ...VERTICAL, kind: 'video', minDurationSec: 8 };
      const chosen = pickAsset(
        [
          asset({ id: 'perfect-but-short', type: 'video', duration: 3 }),
          asset({ id: 'wide-but-long', type: 'video', width: 1920, height: 1080, duration: 12 }),
        ],
        want,
      );
      expect(chosen!.asset.id).toBe('wide-but-long');
      expect(chosen!.compromises).toEqual(['resolution', 'aspect']);
    });

    it('reports every compromise when nothing satisfies anything', () => {
      const want: VisualWant = { ...VERTICAL, kind: 'video', minDurationSec: 8 };
      const chosen = pickAsset(
        [asset({ id: 'only', type: 'video', width: 640, height: 360, duration: 2 })],
        want,
      );
      expect(chosen!.asset.id).toBe('only');
      expect(chosen!.compromises).toEqual(['resolution', 'aspect', 'duration']);
    });

    it('asks nothing about duration for a still', () => {
      const chosen = pickAsset([asset({ id: 'img' })], VERTICAL);
      expect(chosen!.compromises).toEqual([]);
    });
  });

  /*
   * The threshold, stated as the thing it protects. These four are what a
   * vertical search actually returns, and the line falls between 3:4 and 1:1.
   */
  it.each([
    ['4:5', 1600, 2000, true],
    ['3:4', 1620, 2160, true],
    ['1:1', 2000, 2000, false],
    ['16:9', 3840, 2160, false],
  ])('%s into 9:16 is %s a compromise', (_name, w, h, accepted) => {
    const chosen = pickAsset([asset({ id: 'only', width: w as number, height: h as number })], VERTICAL);
    expect(chosen!.compromises.includes('aspect')).toBe(!accepted);
  });

  it('reports how much of a shot a crop keeps', () => {
    expect(retainedFraction(asset({ id: 'a' }), VERTICAL)).toBeCloseTo(1, 6);
    // 16:9 into 9:16 keeps under a third — a narrow slice of the middle.
    expect(retainedFraction(asset({ id: 'w', width: 1920, height: 1080 }), VERTICAL))
      .toBeCloseTo(0.316, 3);
  });
});

describe('resolveVisual', () => {
  const store: AssetStore = { fetch: async (url) => `upload:${url.slice(-8)}` };
  const providerOf = (assets: Asset[]): AssetProvider => ({
    id: 'fake',
    search: vi.fn(async () => assets),
    getById: async () => assets[0],
  });

  it('searches, chooses and fetches', async () => {
    const provider = providerOf([
      asset({ id: 'wide', width: 1920, height: 1080 }),
      asset({ id: 'tall' }),
    ]);
    const out = await resolveVisual({ provider, store }, 'a red door', VERTICAL);
    expect(out.asset.id).toBe('tall');
    expect(out.src).toBe('upload:tall.jpg');
    expect(out.type).toBe('image');
  });

  /*
   * Asking narrows what comes back, which beats filtering twenty landscape
   * results down to none — but providers honour it unevenly, which is why the
   * scoring above has to stand on its own regardless.
   */
  it('tells the provider which orientation it wants', async () => {
    const provider = providerOf([asset({ id: 'tall' })]);
    await resolveVisual({ provider, store }, 'q', VERTICAL);
    expect(provider.search).toHaveBeenCalledWith('q', expect.objectContaining({
      orientation: 'portrait',
    }));

    const square = providerOf([asset({ id: 's', width: 1080, height: 1080 })]);
    await resolveVisual({ provider: square, store }, 'q', {
      width: 1080,
      height: 1080,
      kind: 'image',
    });
    expect(square.search).toHaveBeenCalledWith('q', expect.objectContaining({
      orientation: 'squarish',
    }));
  });

  it('raises a named error when the search returned nothing usable', async () => {
    const provider = providerOf([]);
    await expect(resolveVisual({ provider, store }, 'the concept of clarity', VERTICAL))
      .rejects.toBeInstanceOf(NoVisualError);
    await expect(resolveVisual({ provider, store }, 'the concept of clarity', VERTICAL))
      .rejects.toThrow(/the concept of clarity/);
  });

  it('carries the compromises out to the caller', async () => {
    const provider = providerOf([asset({ id: 'wide', width: 1920, height: 1080 })]);
    const out = await resolveVisual({ provider, store }, 'q', VERTICAL);
    expect(out.compromises).toEqual(['resolution', 'aspect']);
  });
});
