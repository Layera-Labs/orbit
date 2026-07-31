/**
 * The mobile gradient-angle mirror against the canonical one.
 *
 * This test exists because the two did NOT agree: mobile built its line from
 * `cos`/`sin` of the raw angle, so the default 180deg ran right-to-left in the
 * preview and top-to-bottom in every export. A two-stop gradient looks
 * plausible from either end, which is why it survived that long — so the
 * agreement is asserted rather than eyeballed.
 */
import { describe, expect, it } from "vitest";
import { gradientEnds } from "../gradient";

const ANGLES = [undefined, 0, 45, 90, 135, 180, 225, 270, 360, -45, Number.NaN];

describe("mobile mirrors packages/video", () => {
  it("puts a gradient's endpoints where the export does", async () => {
    // By path, not package name: mobile installs outside the pnpm workspace.
    const shared = await import(
      "../../../../../packages/video/src/background-svg"
    );
    for (const a of ANGLES) {
      const mine = gradientEnds(a);
      const theirs = shared.gradientEnds(a);
      expect({
        x1: mine.x1.toFixed(3),
        y1: mine.y1.toFixed(3),
        x2: mine.x2.toFixed(3),
        y2: mine.y2.toFixed(3),
      }).toEqual(theirs);
    }
  });

  it("runs the default 180deg from the top down", () => {
    const g = gradientEnds(undefined);
    expect(g.y1).toBeCloseTo(0, 9);
    expect(g.y2).toBeCloseTo(1, 9);
    expect(g.x1).toBeCloseTo(0.5, 9);
  });
});
