/**
 * Which screens get light glyphs, asserted against what they are actually
 * PAINTED, not against a remembered list.
 *
 * The bug this exists to stop: the router's inline dark list included `ai`,
 * while `AiStudioScreen`'s root is `vela.homeBg` with `vela.ink` text. A light
 * screen wearing white glyphs — the clock, wifi and battery invisible on
 * #f7f7fa. Nothing failed, nothing warned; you just could not read the top of
 * the screen.
 *
 * It went unnoticed because AI Studio is reached from the same rail as the
 * editor and *feels* like editor chrome. So the assertion is deliberately not
 * "these four screens are dark" — that is the same list that was wrong, written
 * a second time. It reads each screen's own root background out of its source
 * and requires the glyph choice to follow from the colour.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { barStyleFor } from "../barStyle";
import type { BarScreen } from "../barStyle";

const here = dirname(fileURLToPath(import.meta.url));
const screensDir = join(here, "../../screens");

/** Which file paints each routable screen. */
const SCREEN_FILE: Record<BarScreen, string> = {
  projects: "HomeScreen.tsx",
  discover: "DiscoverScreen.tsx",
  library: "MediaLibraryScreen.tsx",
  ai: "AiStudioScreen.tsx",
  profile: "ProfileScreen.tsx",
  pick: "MediaPickScreen.tsx",
  generate: "GenerateScreen.tsx",
  editor: "EditorScreen.tsx",
};

/**
 * The palette, read as TEXT.
 *
 * `constants.ts` imports `expo-constants`, which reaches React Native's own
 * Flow-typed source and cannot be parsed by the test runner — the same reason
 * this file does not import the store. Reading the token's hex out of the
 * source keeps the assertion honest without dragging the native graph in.
 */
const PALETTE = readFileSync(join(here, "../../constants.ts"), "utf8");

function velaColour(token: string): string {
  const m = new RegExp('\\b' + token + ':\\s*[\'"]?(#[0-9a-fA-F]{3,8})').exec(PALETTE);
  if (!m) throw new Error(`vela.${token} is not a hex colour in constants.ts`);
  return m[1];
}

/** The first background in a screen's stylesheet — what sits under the bar. */
function rootBackground(file: string): string {
  const src = readFileSync(join(screensDir, file), "utf8");
  const m = /backgroundColor:\s*vela\.([A-Za-z0-9]+)/.exec(src);
  if (!m) throw new Error(`no root background found in ${file}`);
  return velaColour(m[1]);
}

/** Relative luminance, so "is this surface dark" is measured, not asserted. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const n =
    h.length === 3
      ? h.split("").map((c) => parseInt(c + c, 16))
      : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = n.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("barStyleFor", () => {
  const screens = Object.keys(SCREEN_FILE) as BarScreen[];

  it("covers every routable screen", () => {
    // A screen added to the union with no entry here is a screen nobody chose
    // a glyph colour for.
    expect(screens.length).toBeGreaterThan(0);
    for (const s of screens) expect(["light", "dark"]).toContain(barStyleFor(s));
  });

  it.each(screens)("gives %s glyphs that its own surface can carry", (screen) => {
    const bg = rootBackground(SCREEN_FILE[screen]);
    const dark = luminance(bg) < 0.5;
    expect(barStyleFor(screen), `${screen} paints ${bg}`).toBe(dark ? "light" : "dark");
  });

  it("puts light glyphs only on the editor and its picker", () => {
    // Stated separately so the intent is readable, and so a future screen that
    // happens to be dark cannot quietly join without someone reading this.
    expect(screens.filter((s) => barStyleFor(s) === "light").sort()).toEqual([
      "editor",
      "pick",
    ]);
  });
});
