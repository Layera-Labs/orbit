/**
 * A colour per timeline lane, and the one place it is decided.
 *
 * The editor's palette is otherwise a single indigo over neutral surfaces, and
 * that stands — it is the BRAND. This is different: on the timeline, colour is
 * the only thing that says which lane you are looking at, and which lane the
 * floating HUD belongs to. Five hues on the chrome would be a paint box; five
 * hues used as a legend is a legend.
 *
 * It lives in its own module because the strip and the bar that floats over it
 * must not be able to disagree. `Timeline` and `SelectionActionBar` both read
 * `laneFor` — neither owns a colour of its own.
 *
 * **`onKey` is the part that cannot be skipped.** The five keys do not have one
 * ink between them: white reads on the purple, green and blue, and is nearly
 * illegible on the yellow and the orange, which need near-black instead. That
 * is not a preference, it is a measurement, and `__tests__/laneColors.test.ts`
 * holds every pair to a contrast ratio so a later tweak to a hue cannot quietly
 * take the label with it.
 *
 * The bodies are the same hue several steps down, dark enough that a mark drawn
 * on them stays readable. Main and sticker clips are covered by their filmstrip,
 * so their body is only ever a fallback — their hue arrives as the selection
 * border and the trim handles, which is where lengthening and shortening a clip
 * actually happens.
 */

/** The lane kinds the timeline renders. Mirrors `Timeline`'s `RowKind`. */
export type TrackKind = "audio" | "text" | "visual" | "sound";

export type LaneKey = "music" | "text" | "sticker" | "main" | "sound";

export interface LaneColors {
  /** Identity: selection border, trim handles, gutter icon, HUD, collapsed bars. */
  key: string;
  /** Clip body, for the lanes with no media of their own to show. */
  body: string;
  /** Marks drawn ON the body — waveform bars, the caption's label. */
  mark: string;
  /** Ink that reads on `key`. Measured, not assumed — see the test. */
  onKey: string;
}

export const LANES: Record<LaneKey, LaneColors> = {
  music: { key: "#8659d8", body: "#3a2168", mark: "#c4a6ff", onKey: "#ffffff" },
  text: { key: "#2b7d4e", body: "#1e6340", mark: "#ffffff", onKey: "#ffffff" },
  sticker: { key: "#2f74bd", body: "#1d4a72", mark: "#a9d4ff", onKey: "#ffffff" },
  main: { key: "#e8b53c", body: "#4d3a10", mark: "#ffd77a", onKey: "#1a1305" },
  sound: { key: "#f0873f", body: "#4a2510", mark: "#ff9f5e", onKey: "#1c0f05" },
};

/**
 * Which lane a row belongs to.
 *
 * The split that matters is `visual`: the main track holds the images and video
 * that make the film, and every other visual track is a sticker or a PiP laid
 * over it. They are two different lanes on screen and two different colours.
 */
export function laneFor(kind: TrackKind, isMain: boolean): LaneKey {
  if (kind === "audio") return "music";
  if (kind === "text") return "text";
  if (kind === "sound") return "sound";
  return isMain ? "main" : "sticker";
}

export function laneColors(kind: TrackKind, isMain: boolean): LaneColors {
  return LANES[laneFor(kind, isMain)];
}
