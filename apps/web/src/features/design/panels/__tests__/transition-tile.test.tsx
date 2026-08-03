/**
 * No two transitions the picker offers may draw the same tile.
 *
 * The tile's whole claim is that it IS the transition, laid out by
 * `xfadeStateAt` rather than drawn by hand — so a family that lands in the
 * renderer gets a correct tile for free. The failure mode that claim invites is
 * silent and was real: `xfadeStateAt` grew `mask`, `hole`, `scale` and a
 * separate `veil` op, the tile consumed only `clip`/`dx`/`dy`/`alpha`, and
 * every family whose whole effect lived in one of the others rendered as a
 * plain cross-fade. Black, White, Blink and Light were four buttons with
 * different labels and the identical picture of a Fade.
 *
 * Nothing catches that by looking, because each tile is individually plausible.
 * This does, by rendering every one and comparing the markup.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { previewableTransitions } from '@orbit/video/browser';
import { TransitionTile } from '../TransitionTile';

/**
 * The families that legitimately still collide, and why.
 *
 * Their effect is entirely a soft alpha `mask` — a field sampled per pixel —
 * which the tile does not draw yet, so all eleven fall back to the cross-fade
 * underneath and are identical to each other. Named rather than tolerated: this
 * fails if a twelfth quietly joins them, and it fails again when the masks land
 * and the list needs to shrink.
 */
const KNOWN_IDENTICAL = [
  'circleclose',
  'circleopen',
  'diagbl',
  'diagbr',
  'diagtl',
  'diagtr',
  'horzclose',
  'horzopen',
  'radial',
  'vertclose',
  'vertopen',
].sort();

describe('the transition picker', () => {
  it('draws a distinct tile for every family it offers', () => {
    const types = previewableTransitions()
      .flatMap((f) => f.variants.map((v) => v.type))
      .filter((t) => t !== 'cut');
    expect(types.length).toBeGreaterThan(40);

    const byMarkup = new Map<string, string[]>();
    for (const t of types) {
      const html = renderToStaticMarkup(<TransitionTile type={t} />)
        // The clip-path ids are built from the type, so they differ even when
        // the picture does not. Normalise them out or every tile is unique and
        // this test can never fail.
        .replace(/id="[^"]*"/g, 'id="x"')
        .replace(/url\(#[^)]*\)/g, 'url(#x)');
      byMarkup.set(html, [...(byMarkup.get(html) ?? []), t]);
    }

    const collisions = [...byMarkup.values()]
      .filter((g) => g.length > 1)
      .map((g) => g.sort());
    expect(collisions).toEqual(collisions.length ? [KNOWN_IDENTICAL] : []);
  });
});
