import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Upload-token caching, and recovery when the server no longer has the files.
 *
 * A token names a file in ONE server's media dir, and that dir is a cache with
 * a byte budget — so a token is not durable. Eviction, a redeploy onto a fresh
 * volume, or pointing the app at a different server all leave the client
 * holding tokens that name nothing.
 *
 * Both failures below shipped and were found on a real device. The cache was
 * keyed by local URI alone, so tokens leaked between servers; and it was never
 * invalidated, so once the server dropped a file EVERY export failed
 * identically and the only fix was restarting the app. This is exactly the
 * path that is miserable to trigger by hand, so it is pinned here.
 */
vi.mock("../session", () => ({
  authHeaders: async () => ({ authorization: "Bearer t" }),
  discardIfGuest: async () => false,
}));
vi.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: {} }));
vi.mock("expo-media-library", () => ({}));
// Files are present by default; one test flips this to exercise the check that
// a project can outlive its media.
const disk = vi.hoisted(() => ({ present: true }));
vi.mock("../../storage/media", () => ({ fileExists: () => disk.present }));

const { exportProject } = await import("../renderClient");

const project = {
  id: "p",
  schemaVersion: 2,
  width: 64,
  height: 64,
  fps: 30,
  background: { type: "color", color: "#000" },
  clips: [],
  overlays: [],
  audio: [],
  tracks: [
    {
      id: "t",
      kind: "visual",
      clips: [{ id: "c0", src: "file:///local/a.png", start: 0, duration: 1, trimIn: 0 }],
    },
  ],
} as never;

/** Requests seen, so a test can assert what was re-uploaded and what was not. */
let calls: string[] = [];
/** How many more times /v1/render should answer "your media is gone". */
let staleRenders = 0;
let uploadSeq = 0;

beforeEach(() => {
  calls = [];
  staleRenders = 0;
  uploadSeq = 0;
  disk.present = true;
  vi.stubGlobal("FormData", class { append() {} } as never);
  /*
   * Uploads go over XHR, not fetch — that is the only way to get upload
   * progress in React Native, and progress is what tells a slow upload from a
   * dead one. So the stub has to be an XHR, not another fetch route.
   */
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      status = 200;
      responseText = "";
      upload: { onprogress?: (e: unknown) => void } = {};
      onload?: () => void;
      onerror?: () => void;
      ontimeout?: () => void;
      open(_method: string, url: string) {
        calls.push(url);
      }
      setRequestHeader() {}
      abort() {}
      send() {
        this.responseText = JSON.stringify({ id: `upload:u_${++uploadSeq}.png` });
        // Real progress events, so the fraction wiring is actually exercised
        // rather than merely compiled.
        setTimeout(() => {
          for (const loaded of [25, 60, 100]) {
            this.upload.onprogress?.({ loaded, total: 100, lengthComputable: true });
          }
          this.onload?.();
        }, 0);
      }
    } as never,
  );
  vi.stubGlobal("fetch", async (url: string, init?: { body?: unknown }) => {
    calls.push(url);
    if (url.endsWith("/v1/render")) {
      const sent = JSON.parse(String(init?.body)) as {
        project: { tracks: { clips: { src: string }[] }[] };
      };
      const token = sent.project.tracks[0].clips[0].src;
      if (staleRenders > 0) {
        staleRenders -= 1;
        return {
          ok: false,
          status: 409,
          json: async () => ({
            code: "missing_uploads",
            missing: [token],
            error: "gone",
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ url: `/files/out-${token}.mp4` }) };
    }
    throw new Error(`unexpected ${url}`);
  });
});

const uploads = () => calls.filter((u) => u.endsWith("/v1/upload")).length;

/*
 * A DISTINCT server per test, deliberately. `uploadCache` is module-level and
 * therefore shared across tests in this file — which is exactly the production
 * behaviour, since it lives for the life of the app. Reusing one host here made
 * the assertions depend on test ORDER: a token cached by an earlier test meant
 * a later one uploaded once instead of twice and failed for the wrong reason.
 */
describe("upload token caching", () => {
  it("re-uploads and retries when the server says the media is gone", async () => {
    staleRenders = 1;
    const url = await exportProject("https://retry.test", project);
    expect(uploads()).toBe(2); // the first token, then a fresh one
    expect(url).toContain("upload:u_2.png"); // the render that succeeded used it
  });

  it("gives up after ONE retry rather than looping forever", async () => {
    // A second failure is a real one. Retrying past this would re-upload every
    // file on every attempt against a server that will never accept them.
    staleRenders = 99;
    await expect(exportProject("https://giveup.test", project)).rejects.toThrow();
    expect(uploads()).toBe(2);
  });

  it("reuses a token for the same file on the same server", async () => {
    await exportProject("https://reuse.test", project);
    const first = uploads();
    await exportProject("https://reuse.test", project);
    expect(uploads()).toBe(first); // no second upload
  });

  it("does NOT reuse a token across servers", async () => {
    // A token means nothing on a server that did not mint it, so sharing the
    // cache sent dev-Mac tokens to production, which could only ever fail.
    await exportProject("https://one.test", project);
    const first = uploads();
    await exportProject("https://two.test", project);
    expect(uploads()).toBe(first + 1);
  });

  it("reports bytes as they go, so a big file moves the bar", async () => {
    // Without this the bar showed only the file COUNT, so one large video
    // froze it for minutes and read as a hang. The fraction spans the whole
    // stage rather than the single file, or it would restart at zero on each.
    const seen: number[] = [];
    await exportProject("https://bytes.test", project, (p) => {
      if (p.stage === "uploading" && p.fraction !== undefined) seen.push(p.fraction);
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    // Monotonic: a bar that goes backwards is worse than one that does not move.
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("aborts an upload that stops moving, instead of waiting forever", async () => {
    /*
     * The reported symptom: "Sending your media 10 of 10" with a frozen bar
     * and nothing ever arriving at the server. There was no timeout anywhere
     * in the path, so the only way out was force-quitting the app.
     *
     * The watchdog measures time since the last BYTE, not total elapsed time —
     * a large upload over a slow link must be left alone.
     */
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal(
      "XMLHttpRequest",
      class {
        status = 0;
        responseText = "";
        upload: { onprogress?: (e: unknown) => void } = {};
        onload?: () => void;
        onerror?: () => void;
        open() {}
        setRequestHeader() {}
        abort() {
          aborted = true;
        }
        send() {
          // Sends nothing, reports nothing, never completes.
        }
      } as never,
    );
    const failing = exportProject("https://stall.test", project);
    const settled = expect(failing).rejects.toThrow(/stopped responding/);
    await vi.advanceTimersByTimeAsync(60_000);
    await settled;
    expect(aborted).toBe(true); // the request is actually torn down, not leaked
    vi.useRealTimers();
  });

  it("fails with something actionable when the file is gone from the device", async () => {
    // A project outlives its media: the Photos entry is deleted, or a reinstall
    // renumbers the container. iOS returns an EMPTY BODY for a missing file, so
    // without this check the upload posts nothing and succeeds, and the failure
    // surfaces much later as ffmpeg refusing a zero-byte input.
    disk.present = false;
    await expect(exportProject("https://gone.test", project)).rejects.toThrow(
      /no longer on the device/,
    );
    expect(uploads()).toBe(0); // refused before any request went out
  });

  it("treats a trailing slash as the same server, not a second one", async () => {
    await exportProject("https://slash.test", project);
    const first = uploads();
    await exportProject("https://slash.test/", project);
    expect(uploads()).toBe(first);
  });
});
