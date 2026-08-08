/**
 * Not every ffmpeg has every transition, and naming one it lacks is fatal.
 *
 * `cover*` and `reveal*` — this editor's Push and Reveal — landed in ffmpeg
 * 6.1. The render service's image installs Debian bookworm's 5.1, so eight of
 * the nineteen the pickers offer name a token that build cannot parse. That is
 * not a wrong pixel: an unknown enum value fails the whole filtergraph, so the
 * render dies minutes in with an error about an option.
 *
 * The fixture below is the real `ffmpeg -hide_banner -h filter=xfade` dump from
 * the deployed server (5.1.9, Debian bookworm), trimmed in the middle. Keeping
 * the actual text matters more than a synthetic one would: the parser's whole
 * job is to survive ffmpeg's help formatting, and a hand-written sample proves
 * nothing about that.
 */
import { describe, expect, it } from 'vitest';
import {
  parseXfadeTokens,
  previewableTransitions,
  resolveTransitions,
  transitionUnsupportedMessage,
  unsupportedTransitions,
} from '../xfade';
import type { VisualTrackClip } from '../types';

/** Verbatim from the production box, middle elided. */
const HELP_5_1 = `Filter xfade
  Cross fade one video with another video.
    Inputs:
       #0: main (video)
       #1: xfade (video)
    Outputs:
       #0: default (video)
xfade AVOptions:
   transition        <int>        ..FV....... set cross fade transition (from -1 to 45) (default fade)
     custom          -1           ..FV....... custom transition
     fade            0            ..FV....... fade transition
     wipeleft        1            ..FV....... wipe left transition
     wiperight       2            ..FV....... wipe right transition
     slideleft       5            ..FV....... slide left transition
     slidedown       8            ..FV....... slide down transition
     fadeblack       12           ..FV....... fadeblack transition
     circleopen      19           ..FV....... circleopen transition
     zoomin          43           ..FV....... zoom in transition
     fadefast        44           ..FV....... fast fade transition
     fadeslow        45           ..FV....... slow fade transition
   duration          <duration>   ..FV....... set cross fade duration (default 1)
   offset            <duration>   ..FV....... set cross fade start relative to first input stream (default 0)
   expr              <string>     ..FV....... set expression for custom transition
`;

describe('parseXfadeTokens', () => {
  const tokens = parseXfadeTokens(HELP_5_1);

  it('reads the enum constants out of a real help dump', () => {
    expect(tokens).toContain('fade');
    expect(tokens).toContain('wipeleft');
    expect(tokens).toContain('fadeslow');
  });

  it('takes the integer column as what separates a constant from an option', () => {
    // `duration`, `offset` and `expr` carry `<duration>`/`<string>`, and
    // `transition` itself carries `<int>` — so none of them is a transition.
    // Keying on the shape rather than on a list of names is what lets a future
    // ffmpeg add an option here without being misread as a transition.
    expect(tokens).not.toContain('duration');
    expect(tokens).not.toContain('offset');
    expect(tokens).not.toContain('expr');
    expect(tokens).not.toContain('transition');
  });

  it('does not count `custom`', () => {
    // It takes a per-pixel expression; it is an escape hatch, not a family, and
    // counting it would make a build look capable of something it is not.
    expect(tokens).not.toContain('custom');
  });

  it('reports the 5.1 build as lacking cover and reveal', () => {
    expect(tokens.filter((t) => /^(cover|reveal)/.test(t))).toEqual([]);
  });

  it('returns nothing rather than throwing on unreadable output', () => {
    // An empty parse means UNKNOWN everywhere downstream, so a help format we
    // cannot read costs the safety net and not the service.
    expect(parseXfadeTokens('')).toEqual([]);
    expect(parseXfadeTokens('command not found')).toEqual([]);
  });
});

describe('previewableTransitions', () => {
  it('offers everything when nothing is known about the server', () => {
    const all = previewableTransitions();
    const gated = previewableTransitions(undefined);
    expect(gated).toEqual(all);
    // Deliberately NOT fail-closed, unlike the HDR gate: the editor has to work
    // with no server reachable at all, and hiding every transition on a plane
    // would cost far more than the case it prevents.
    expect(previewableTransitions([])).toEqual(all);
  });

  it('drops the families this ffmpeg cannot parse', () => {
    const keys = previewableTransitions(parseXfadeTokens(HELP_5_1)).map((f) => f.key);
    expect(keys).not.toContain('push');
    expect(keys).not.toContain('reveal');
  });

  it('never drops cut or fade, whatever the server says', () => {
    // A cut names no filter and a fade is drawn by the compositor rather than
    // by `xfade`, so neither can be missing from any build.
    const keys = previewableTransitions(['wipeleft']).map((f) => f.key);
    expect(keys).toContain('cut');
    expect(keys).toContain('fade');
  });

  it('keeps a family whose token IS present', () => {
    const wipe = previewableTransitions(parseXfadeTokens(HELP_5_1)).find(
      (f) => f.key === 'wipe',
    );
    // Only wipeleft and wiperight are in the trimmed fixture, so the family
    // survives with exactly those two — a family is filtered per variant, not
    // dropped whole because one direction is missing.
    expect(wipe?.variants.map((v) => v.type)).toEqual(['wipeleft', 'wiperight']);
  });
});

const clip = (id: string, start: number, type?: string): VisualTrackClip =>
  ({
    id,
    type: 'image',
    src: `${id}.png`,
    start,
    duration: 4,
    ...(type ? { transitionIn: { type, duration: 1 } } : {}),
  }) as VisualTrackClip;

describe('unsupportedTransitions', () => {
  /** Two clips overlapping by 1s, joined by `type`. */
  const boundariesFor = (type: string) =>
    resolveTransitions([clip('a', 0), clip('b', 3, type)]).boundaries;

  it('names a token the build lacks', () => {
    expect(unsupportedTransitions(boundariesFor('coverleft'), parseXfadeTokens(HELP_5_1)))
      .toEqual(['coverleft']);
  });

  it('passes a token the build has', () => {
    expect(unsupportedTransitions(boundariesFor('wipeleft'), parseXfadeTokens(HELP_5_1)))
      .toEqual([]);
  });

  it('never flags a fade, which uses no xfade filter at all', () => {
    // `isAlphaOnly` — a fade is the compositor drawing B over A, so it cannot
    // be missing even from an ffmpeg with no xfade whatsoever.
    expect(unsupportedTransitions(boundariesFor('fade'), ['wipeleft'])).toEqual([]);
  });

  it('subtracts nothing when the probe came back empty', () => {
    // Unknown must not read as "supports nothing", or one unreadable help dump
    // would refuse every export on the box.
    expect(unsupportedTransitions(boundariesFor('coverleft'), [])).toEqual([]);
  });

  it('reports each missing token once, however many boundaries use it', () => {
    const many = resolveTransitions([
      clip('a', 0),
      clip('b', 3, 'coverleft'),
      clip('c', 6, 'coverleft'),
      clip('d', 9, 'revealup'),
    ]).boundaries;
    expect(unsupportedTransitions(many, parseXfadeTokens(HELP_5_1)).sort()).toEqual([
      'coverleft',
      'revealup',
    ]);
  });
});

describe('transitionUnsupportedMessage', () => {
  it('names what is missing and what would fix it', () => {
    const msg = transitionUnsupportedMessage(['coverleft', 'revealup']);
    expect(msg).toContain('coverleft');
    expect(msg).toContain('revealup');
    // The version is the actionable part — without it the reader knows only
    // that something is wrong, not that the answer is a newer ffmpeg.
    expect(msg).toContain('6.1');
  });
});
