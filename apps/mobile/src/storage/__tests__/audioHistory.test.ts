/**
 * The audio library outliving its files.
 *
 * Both of these were reported from a real device and both are the same root
 * cause: iOS renumbers the app's container on every install, and a dev build is
 * reinstalled several times a day. `genHistory.ts` was fixed for this months
 * ago; this file, one over, was not — so the library went on listing music by
 * a path from a previous install.
 *
 * The failure is nasty because it does not surface where it happens. A stale
 * path adds a silent clip; a missing file adds a clip that only fails at the
 * far end of an export, as `this media is no longer on the device: x.wav`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const CURRENT = "file:///app/B/Documents/media";
const OLD = "file:///app/A/Documents/media";

/** Files that exist right now, by uri. */
const disk = vi.hoisted(() => ({ files: new Set<string>(), json: "" }));

vi.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(a: unknown, b?: string) {
      this.uri = b ? `${String(a)}/${b}` : String(a);
    }
    get exists() {
      return this.uri.endsWith("audio-library.json")
        ? disk.json !== ""
        : disk.files.has(this.uri);
    }
    textSync() {
      return disk.json;
    }
    write(s: string) {
      disk.json = s;
    }
  }
  return { File, Directory: class {}, Paths: { document: "file:///app/B/Documents" } };
});

vi.mock("../projects", () => ({
  // The real rule, kept short: rewrite by basename onto the current media dir.
  rebaseMediaUri: (uri: string) => {
    const at = uri.indexOf("/Documents/media/");
    if (!uri.startsWith("file:") || at < 0) return uri;
    const name = uri.slice(at + "/Documents/media/".length);
    return name && !name.includes("/") ? `${CURRENT}/${name}` : uri;
  },
}));

const { loadAudioHistory } = await import("../audioHistory");

const record = (id: string, url: string) => ({
  id,
  name: id,
  url,
  source: "upload" as const,
  createdAt: 1,
});

beforeEach(() => {
  disk.files = new Set();
  disk.json = "";
});

describe("loadAudioHistory", () => {
  it("rebases a path from a previous install", () => {
    disk.files.add(`${CURRENT}/song.wav`);
    disk.json = JSON.stringify([record("a", `${OLD}/song.wav`)]);
    expect(loadAudioHistory().map((r) => r.url)).toEqual([`${CURRENT}/song.wav`]);
  });

  it("drops a record whose file is really gone", () => {
    /*
     * Dropped rather than shown greyed out: a record IS its file, there is
     * nothing to re-download for an upload, and a row that cannot be used is
     * worse than one that is absent — it invites the tap that fails four
     * screens later.
     */
    disk.json = JSON.stringify([
      record("gone", `${OLD}/deleted.wav`),
      record("kept", `${OLD}/song.wav`),
    ]);
    disk.files.add(`${CURRENT}/song.wav`);
    expect(loadAudioHistory().map((r) => r.id)).toEqual(["kept"]);
  });

  it("writes the healed list back, so the work is done once", () => {
    disk.files.add(`${CURRENT}/song.wav`);
    disk.json = JSON.stringify([
      record("a", `${OLD}/song.wav`),
      record("gone", `${OLD}/deleted.wav`),
    ]);
    loadAudioHistory();
    expect(JSON.parse(disk.json)).toEqual([
      { ...record("a", `${CURRENT}/song.wav`) },
    ]);
  });

  it("leaves a remote record alone", () => {
    // Only a local file can be rebased, and only a local file's absence is
    // knowable here. A stock or AI url is the server's problem.
    disk.json = JSON.stringify([record("r", "https://cdn.example/song.mp3")]);
    expect(loadAudioHistory().map((r) => r.url)).toEqual([
      "https://cdn.example/song.mp3",
    ]);
  });

  it("does not rewrite the file when nothing needed healing", () => {
    disk.files.add(`${CURRENT}/song.wav`);
    const clean = JSON.stringify([record("a", `${CURRENT}/song.wav`)]);
    disk.json = clean;
    loadAudioHistory();
    expect(disk.json).toBe(clean);
  });

  it("survives a corrupt file rather than taking the drawer down", () => {
    disk.json = "{not json";
    expect(loadAudioHistory()).toEqual([]);
  });
});
