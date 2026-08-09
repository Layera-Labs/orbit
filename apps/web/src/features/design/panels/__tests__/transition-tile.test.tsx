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
import { previewableTransitions } from '@layera-labs/video/browser';
import { TransitionTile } from '../TransitionTile';


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

    /*
     * No exceptions, and stated as a bare empty array on purpose. The first
     * version of this listed the eleven mask families as known-identical and
     * compared against that list only when the list was non-empty — which made
     * it pass whether they collided or not, and it did pass in the run that was
     * meant to prove they had stopped. An allowance that can satisfy itself is
     * worse than no test.
     */
    const collisions = [...byMarkup.values()]
      .filter((g) => g.length > 1)
      .map((g) => g.sort());
    expect(collisions).toEqual([]);
  });
});
