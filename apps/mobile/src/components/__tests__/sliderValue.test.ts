import { describe, expect, it } from "vitest";
import { defaultStep, parsePercent, quantize } from "../sliderValue";
import { MAX_VOLUME } from "../../model/audio-fade";

/**
 * The numbers behind every slider and every typed percentage.
 *
 * Worth pinning down because the components around them cannot be run
 * off-device: a bad clamp here stores a gain the UI can neither show nor undo,
 * and a rounding that leaves floating-point fuzz breaks the deduplication that
 * keeps a drag from writing the project on every touch event.
 */
describe("quantize", () => {
  it("snaps to the step", () => {
    expect(quantize(1.23, 0, 5, 0.05)).toBe(1.25);
    expect(quantize(1.22, 0, 5, 0.05)).toBe(1.2);
  });

  it("clamps into range", () => {
    expect(quantize(-3, 0, 5, 0.05)).toBe(0);
    expect(quantize(99, 0, 5, 0.05)).toBe(5);
  });

  it("snaps relative to min, not to zero", () => {
    // A speed slider starts at 0.25; a grid laid from zero would put its own
    // minimum between two steps.
    expect(quantize(0.25, 0.25, 4, 0.5)).toBe(0.25);
    expect(quantize(0.8, 0.25, 4, 0.5)).toBe(0.75);
  });

  it("leaves no floating-point fuzz for the dedupe to trip over", () => {
    /*
     * This is the one that matters. `0 + 3 * 0.05` is 0.15000000000000002, so
     * two values a user cannot tell apart compare unequal — and VSlider skips a
     * report only when the new value EQUALS the last one. Without the rounding
     * every touch event gets through and the store is written ~60 times a
     * second, which is what crashed the volume slider.
     */
    expect(quantize(0.15, 0, 5, 0.05)).toBe(0.15);
    for (let i = 0; i <= 100; i++) {
      const v = quantize((i / 100) * MAX_VOLUME, 0, MAX_VOLUME, 0.05);
      expect(quantize(v, 0, MAX_VOLUME, 0.05)).toBe(v);
    }
  });

  it("passes the value through when there is no step", () => {
    expect(quantize(1.234567, 0, 5, 0)).toBe(1.234567);
  });

  it("defaults to a grid fine enough to feel continuous", () => {
    expect(defaultStep(0, 1)).toBe(0.005);
    expect(defaultStep(0, MAX_VOLUME)).toBe(0.025);
  });
});

describe("parsePercent", () => {
  const parse = (t: string) => parsePercent(t, 0, MAX_VOLUME * 100, 5);

  it("reads a plain number as a gain", () => {
    expect(parse("150")).toBe(1.5);
    expect(parse("100")).toBe(1);
    expect(parse("0")).toBe(0);
  });

  it("tolerates the suffix and stray spaces", () => {
    expect(parse(" 150 % ")).toBe(1.5);
  });

  it("holds the stated bounds", () => {
    expect(parse("9999")).toBe(MAX_VOLUME);
    expect(parse("-40")).toBe(0);
  });

  it("snaps to the step", () => {
    expect(parse("142")).toBe(1.4);
    expect(parse("143")).toBe(1.45);
  });

  it("rejects anything that is not a number", () => {
    /*
     * Not a formality: `Number("")` is 0, so coercing an emptied field would
     * silently mute the clip — and a caller cannot tell that apart from someone
     * deliberately typing zero.
     */
    expect(parse("")).toBeNull();
    expect(parse("   ")).toBeNull();
    expect(parse("loud")).toBeNull();
    expect(parse("1,5")).toBeNull();
  });
});
