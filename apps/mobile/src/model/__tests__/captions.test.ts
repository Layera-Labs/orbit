import { describe, expect, it } from "vitest";
import {
  CAPTION_ID_PREFIX,
  captionWordsValid,
  clearAutoCaptions,
  hasAutoCaptions,
  setAutoCaptions,
} from "../editor-ops";
import { textOverlaysOf, type TextOverlay, type VideoProject } from "../types";
// By path, for the same reason the runtime mirror checks below use a path:
// mobile installs outside the workspace and `@orbit/video` does not resolve.
import type { CaptionLine as CanonicalCaptionLine } from "../../../../../packages/video/src/captions";
import type { CaptionLine as WireCaptionLine } from "../../net/genClient";

const project = (overlays: TextOverlay[] = []): VideoProject => ({
  id: "p",
  schemaVersion: 2,
  width: 1080,
  height: 1920,
  fps: 30,
  background: { type: "color", color: "#000000" },
  clips: [],
  overlays,
  audio: [],
  tracks: [],
});

const caption = (text: string, start: number, end: number) => ({ text, start, end });

const hand: TextOverlay = {
  id: "mine",
  type: "text",
  text: "Written by hand",
  start: 0,
  end: 2,
  x: 0.5,
  y: 0.5,
  fontSize: 60,
  color: "#ffffff",
};

describe("setAutoCaptions", () => {
  it("lays the transcript out in time", () => {
    const p = setAutoCaptions(project(), [caption("one", 0, 1), caption("two", 1, 2)]);
    expect(textOverlaysOf(p.overlays).map((o) => [o.text, o.start, o.end])).toEqual([
      ["one", 0, 1],
      ["two", 1, 2],
    ]);
  });

  /* The transcript is relative to the audio; the timeline is not. */
  it("offsets by where the transcribed clip sits", () => {
    const p = setAutoCaptions(project(), [caption("late", 0, 1)], 4.5);
    expect(p.overlays[0].start).toBe(4.5);
    expect(p.overlays[0].end).toBe(5.5);
  });

  /* Running it twice is the NORMAL case — re-record, re-trim, re-caption — and
     appending would stack two transcripts with no way to tell them apart. */
  it("replaces a previous run rather than stacking on it", () => {
    const once = setAutoCaptions(project(), [caption("old", 0, 1), caption("older", 1, 2)]);
    const twice = setAutoCaptions(once, [caption("new", 0, 1)]);
    expect(twice.overlays).toHaveLength(1);
    expect(textOverlaysOf(twice.overlays)[0].text).toBe("new");
  });

  it("leaves a caption someone wrote by hand alone", () => {
    const p = setAutoCaptions(project([hand]), [caption("auto", 0, 1)]);
    expect(p.overlays.map((o) => o.id)).toEqual(["mine", `${CAPTION_ID_PREFIX}0`]);
    expect(clearAutoCaptions(p).overlays).toEqual([hand]);
  });

  /* Over footage of unknown brightness, a caption has to carry its own
     legibility rather than hope the picture behind it is dark. */
  it("gives every caption an outline and sits it low in the frame", () => {
    const [c] = textOverlaysOf(setAutoCaptions(project(), [caption("x", 0, 1)]).overlays);
    expect(c.stroke?.width).toBeGreaterThan(0);
    expect(c.y).toBeGreaterThan(0.7);
  });

  it("puts captions above whatever is already there", () => {
    const p = setAutoCaptions(project([{ ...hand, layer: 7 }]), [caption("x", 0, 1)]);
    expect(p.overlays.find((o) => o.id.startsWith(CAPTION_ID_PREFIX))?.layer).toBe(8);
  });

  it("reports whether there is anything to replace", () => {
    expect(hasAutoCaptions(project([hand]))).toBe(false);
    expect(hasAutoCaptions(setAutoCaptions(project(), [caption("x", 0, 1)]))).toBe(true);
  });

  it("clears to nothing for an empty transcript", () => {
    const once = setAutoCaptions(project(), [caption("x", 0, 1)]);
    expect(setAutoCaptions(once, []).overlays).toEqual([]);
  });
});

/*
 * The mirror, checked.
 *
 * `setAutoCaptions` exists TWICE — here in `editor-ops.ts`, and in
 * `packages/video/src/captions.ts` which the web app imports — because mobile
 * installs outside the pnpm workspace and cannot import the package. A mirrored
 * implementation nothing compares is a copy waiting to drift: the two would
 * quietly start placing captions at different heights, or with different
 * outlines, and the same project would look different in the two apps.
 *
 * So compare the OUTPUT, not the source. Anything that changes in one and not
 * the other fails here.
 */
describe('mobile mirrors packages/video', () => {
  it('produces identical overlays for the same transcript', async () => {
    // By path, not by package name: mobile installs outside the workspace, so
    // `@orbit/video` is not resolvable from here. That is the very reason this
    // file is duplicated, and the reason this test exists.
    const shared = await import('../../../../../packages/video/src/captions');
    const lines = [caption('one', 0, 1), caption('two', 1.5, 2.25)];

    for (const [w, h] of [
      [1080, 1920],
      [1920, 1080],
      [3840, 2160],
    ]) {
      const p = { ...project([hand]), width: w, height: h };
      expect(setAutoCaptions(p, lines, 3.5).overlays).toEqual(
        shared.setAutoCaptions(p as never, lines, 3.5).overlays,
      );
    }
  });

  it('agrees on the id prefix, so each can find the other run', () => {
    // Not cosmetic: a project captioned on the phone must be re-captionable on
    // the web, and that only works if both recognise the same ids.
    expect(CAPTION_ID_PREFIX).toBe('caption-');
  });

  /*
   * Word timings are resolved onto the TIMELINE — the transcript is relative to
   * the clip, and `setAutoCaptions` is the only place that knows where the clip
   * sits. So the two copies have to agree on the shift as well as on the field,
   * or the same transcript lands with the words in different places on the two
   * apps and only a word-level effect would ever show it.
   */
  it('resolves word timings identically', async () => {
    const shared = await import('../../../../../packages/video/src/captions');
    const lines = [
      {
        text: 'one two',
        start: 0,
        end: 1,
        words: [
          { text: 'one', start: 0, end: 0.4 },
          { text: 'two', start: 0.5, end: 1 },
        ],
      },
    ];
    for (const offset of [0, 3.5, 60]) {
      expect(setAutoCaptions(project(), lines, offset).overlays).toEqual(
        shared.setAutoCaptions(project() as never, lines, offset).overlays,
      );
    }
  });

  it('agrees that a retyped caption is no longer described by its words', async () => {
    const shared = await import('../../../../../packages/video/src/captions');
    const good = { text: 'one two', words: [{ text: 'one', start: 0, end: 1 }, { text: 'two', start: 1, end: 2 }] };
    const stale = { ...good, text: 'one three' };
    for (const o of [good, stale, { text: 'x' }]) {
      expect(captionWordsValid(o)).toBe(shared.captionWordsValid(o));
    }
    expect(captionWordsValid(good)).toBe(true);
    expect(captionWordsValid(stale)).toBe(false);
  });
});

/*
 * The wire shape, checked by the COMPILER.
 *
 * `CaptionLine` is declared in `net/genClient.ts` as well, because mobile
 * cannot resolve the package. Nothing at runtime can catch that copy drifting —
 * the field simply goes missing from a response nobody inspects — so the check
 * is an assignment tsc has to accept. Vitest strips types, so this passing
 * proves nothing on its own; `npx tsc` in `apps/mobile` is what enforces it.
 */
describe('the wire type mirrors the package', () => {
  it('accepts what the service actually sends', () => {
    const fromServer: CanonicalCaptionLine = {
      text: 'one two',
      start: 0,
      end: 1,
      words: [
        { text: 'one', start: 0, end: 0.4 },
        { text: 'two', start: 0.5, end: 1 },
      ],
    };
    // The assignment IS the assertion: a field the package gains and this copy
    // does not makes tsc reject this line.
    const asMobileReadsIt: WireCaptionLine = fromServer;
    expect(asMobileReadsIt.words).toHaveLength(2);
    // And `setAutoCaptions` must take it, or a response is parseable and still
    // unusable.
    expect(setAutoCaptions(project(), [asMobileReadsIt]).overlays).toHaveLength(1);
  });
});
