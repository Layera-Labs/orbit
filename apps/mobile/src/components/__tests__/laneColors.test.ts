/**
 * The lane palette, held to the thing that is easy to get wrong.
 *
 * Anyone can pick five colours. What breaks later is a hue getting nudged
 * brighter and taking its label's legibility with it — white on a yellow HUD is
 * the design law's "text you cannot read", and it looks fine to whoever changed
 * the hue because they were looking at the hue. So `onKey` is measured here, not
 * eyeballed, and the same for a mark drawn on its body.
 */
import { describe, expect, it } from "vitest";
import {
  LANES,
  laneColors,
  laneFor,
  type LaneKey,
  type TrackKind,
} from "../laneColors";

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const EDITOR_BG = "#0e0e11";
const KEYS = Object.keys(LANES) as LaneKey[];

describe("laneFor", () => {
  it("maps every kind, and splits visual by whether it is the main track", () => {
    expect(laneFor("audio", false)).toBe("music");
    expect(laneFor("text", false)).toBe("text");
    expect(laneFor("sound", false)).toBe("sound");
    // The one that carries real meaning: the main track is the film, anything
    // else visual is laid over it.
    expect(laneFor("visual", true)).toBe("main");
    expect(laneFor("visual", false)).toBe("sticker");
  });

  it("resolves every combination to a lane that exists", () => {
    for (const kind of ["audio", "text", "visual", "sound"] as TrackKind[])
      for (const isMain of [true, false]) {
        const l = laneColors(kind, isMain);
        expect(LANES[laneFor(kind, isMain)]).toBe(l);
        expect(l.key).toMatch(/^#[0-9a-f]{6}$/);
      }
  });

  // `isMain` is meaningless for the three non-visual kinds, and a caller that
  // gets it wrong should not be able to change what colour a lane is.
  it("ignores isMain for the kinds it cannot apply to", () => {
    for (const kind of ["audio", "text", "sound"] as TrackKind[])
      expect(laneFor(kind, true)).toBe(laneFor(kind, false));
  });
});

describe("the palette reads", () => {
  it("gives its ink enough contrast on every key", () => {
    // 4.5:1 — the small-text threshold, because the HUD's label is 10pt.
    for (const k of KEYS)
      expect(contrast(LANES[k].onKey, LANES[k].key), k).toBeGreaterThanOrEqual(4.5);
  });

  it("does not settle on one ink, because the hues do not allow it", () => {
    // The point of `onKey` existing at all: white fails on yellow and orange.
    const white = KEYS.filter((k) => LANES[k].onKey === "#ffffff");
    expect(white.length).toBeGreaterThan(0);
    expect(white.length).toBeLessThan(KEYS.length);
    for (const k of KEYS)
      if (LANES[k].onKey !== "#ffffff")
        expect(contrast("#ffffff", LANES[k].key), `white on ${k}`).toBeLessThan(4.5);
  });

  it("keeps a lane's mark legible on its own body", () => {
    for (const k of KEYS)
      expect(contrast(LANES[k].mark, LANES[k].body), k).toBeGreaterThanOrEqual(4.5);
  });

  it("shows every key against the editor's background", () => {
    // 3:1 — these are graphics (a border, a handle, an icon), not body text.
    for (const k of KEYS)
      expect(contrast(LANES[k].key, EDITOR_BG), k).toBeGreaterThanOrEqual(3);
  });

  it("gives every lane a distinguishable key", () => {
    for (const a of KEYS)
      for (const b of KEYS)
        if (a !== b) expect(LANES[a].key, `${a} vs ${b}`).not.toBe(LANES[b].key);
  });

  it("holds the keys to one family rather than a paint box", () => {
    // Similar lightness across the five, so they read as a set. Without this a
    // later "make music pop" turns one lane into the loudest thing on screen.
    const ls = KEYS.map((k) => luminance(LANES[k].key));
    expect(Math.max(...ls) - Math.min(...ls)).toBeLessThan(0.4);
    // And every body genuinely darker than its own key.
    for (const k of KEYS)
      expect(luminance(LANES[k].body), k).toBeLessThan(luminance(LANES[k].key));
  });
});
