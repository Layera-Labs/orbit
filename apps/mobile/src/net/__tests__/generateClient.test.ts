import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the generate route's answers mean to the app.
 *
 * The reason this is worth pinning is that four of the five failure codes lead
 * to genuinely different screens — a retry, a sign-in, a top-up, or an
 * explanation with no button at all — and they arrive as bare HTTP statuses
 * that all look alike at the call site. Getting 503 wrong in particular is the
 * difference between "this server cannot do that" and a retry loop against a
 * box that will answer the same way forever, which is the state every fresh
 * deployment is in.
 */
vi.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: {} }));
vi.mock("expo-media-library", () => ({}));
vi.mock("../../storage/media", () => ({ fileExists: () => true }));

const guest = vi.hoisted(() => ({ discarded: false }));
vi.mock("../session", () => ({
  authHeaders: async () => ({ authorization: "Bearer t" }),
  discardIfGuest: async () => guest.discarded,
}));

const {
  GEN_STEPS,
  fetchGeneration,
  frameSizeFor,
  isSettled,
  pollDelay,
  startGeneration,
  stepIndex,
  stepLabel,
} = await import("../generateClient");
const { GenError } = await import("../genClient");

type Reply = { status: number; body: unknown };
let replies: Reply[] = [];
let calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  replies = [];
  calls = [];
  guest.discarded = false;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected fetch: ${url}`);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    } as Response;
  });
});

const started = (id = "gen_1"): Reply => ({ status: 202, body: { id, status: "queued" } });

describe("asking for a video", () => {
  it("sends the topic and comes back with a job id", async () => {
    replies.push(started("gen_abc"));
    const id = await startGeneration("http://x/", {
      topic: "why cats purr",
      aspect: "9:16",
      notes: "keep it warm",
    });
    expect(id).toBe("gen_abc");
    // The trailing slash is stripped, or the path doubles it.
    expect(calls[0].url).toBe("http://x/v1/generate");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      topic: "why cats purr",
      aspect: "9:16",
      notes: "keep it warm",
    });
  });

  /* An empty optional field is absent, not "". The server trims and would take
   * an empty string as notes, which reaches the model's prompt. */
  it("omits notes when there are none", async () => {
    replies.push(started());
    await startGeneration("http://x", { topic: "t", aspect: "1:1" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ topic: "t", aspect: "1:1" });
  });

  it("names a server that cannot generate, rather than calling it a failure", async () => {
    replies.push({
      status: 503,
      body: { error: "generation is not configured", kind: "generation-unconfigured" },
    });
    await expect(
      startGeneration("http://x", { topic: "t", aspect: "9:16" }),
    ).rejects.toMatchObject({ kind: "not-configured" });
  });

  it("names an account that cannot afford it", async () => {
    replies.push({ status: 402, body: { error: "not enough credits" } });
    await expect(
      startGeneration("http://x", { topic: "t", aspect: "9:16" }),
    ).rejects.toMatchObject({ kind: "out-of-credits" });
  });

  it("asks for a sign-in when the token is refused and cannot be replaced", async () => {
    replies.push({ status: 401, body: {} });
    await expect(
      startGeneration("http://x", { topic: "t", aspect: "9:16" }),
    ).rejects.toMatchObject({ kind: "unauthenticated" });
  });

  /*
   * A guest's token can be replaced without involving the user, and is — once.
   * A member's cannot: silently swapping them onto a fresh anonymous account
   * would detach them from the credits they paid for.
   */
  it("mints a new guest token and retries, exactly once", async () => {
    guest.discarded = true;
    replies.push({ status: 401, body: {} }, started("gen_2"));
    await expect(
      startGeneration("http://x", { topic: "t", aspect: "9:16" }),
    ).resolves.toBe("gen_2");
    expect(calls).toHaveLength(2);

    calls = [];
    replies.push({ status: 401, body: {} }, { status: 401, body: {} });
    await expect(
      startGeneration("http://x", { topic: "t", aspect: "9:16" }),
    ).rejects.toMatchObject({ kind: "unauthenticated" });
    expect(calls).toHaveLength(2);
  });

  it("reports an unreachable server as such, not as a rejected request", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Network request failed");
    });
    await expect(
      startGeneration("http://x", { topic: "t", aspect: "9:16" }),
    ).rejects.toMatchObject({ kind: "no-server" });
  });
});

describe("watching a job", () => {
  it("passes a running job through with its step", async () => {
    replies.push({
      status: 200,
      body: { id: "g", status: "running", step: "speak", createdAt: 1 },
    });
    const job = await fetchGeneration("http://x", "g");
    expect(job.status).toBe("running");
    expect(job.step).toBe("speak");
    expect(isSettled(job)).toBe(false);
  });

  /*
   * The service returns a path on local disk and a presigned URL on S3, and one
   * build talks to both. Resolved here so nothing downstream has to remember —
   * a relative url handed to the downloader fails with a message about a
   * malformed URL rather than about the server it came from.
   */
  it("makes a disk-served result url absolute", async () => {
    replies.push({
      status: 200,
      body: {
        id: "g",
        status: "done",
        result: { url: "/files/out.mp4", durationSec: 31 },
        createdAt: 1,
      },
    });
    const job = await fetchGeneration("http://x/", "g");
    expect(job.result?.url).toBe("http://x/files/out.mp4");
  });

  it("leaves a bucket url alone", async () => {
    replies.push({
      status: 200,
      body: { id: "g", status: "done", result: { url: "https://s3/o.mp4" }, createdAt: 1 },
    });
    const job = await fetchGeneration("http://x", "g");
    expect(job.result?.url).toBe("https://s3/o.mp4");
  });

  /*
   * 404 is "no such job for this account" — the same answer for one that
   * expired and one belonging to somebody else, which is right to tell a
   * stranger and unhelpful to tell the owner. It is named because the recovery
   * differs from every other failure: there is nothing left to wait for.
   */
  it("names a job the server will never answer for again", async () => {
    replies.push({ status: 404, body: {} });
    await expect(fetchGeneration("http://x", "g")).rejects.toThrow(
      /no longer on the server/,
    );
  });

  it("escapes the id into the path", async () => {
    replies.push({ status: 200, body: { id: "g", status: "queued", createdAt: 1 } });
    await fetchGeneration("http://x", "a/../b");
    expect(calls[0].url).toBe("http://x/v1/generate/a%2F..%2Fb");
  });

  it("treats both terminal statuses as settled", async () => {
    const base = { id: "g", createdAt: 1 } as const;
    expect(isSettled({ ...base, status: "done" })).toBe(true);
    expect(isSettled({ ...base, status: "error" })).toBe(true);
    expect(isSettled({ ...base, status: "queued" })).toBe(false);
    expect(isSettled({ ...base, status: "running" })).toBe(false);
  });
});

describe("saying where a job has got to", () => {
  it("orders the steps the way the pipeline runs them", () => {
    expect(GEN_STEPS.map((s) => s.key)).toEqual([
      "plan",
      "speak",
      "align",
      "visuals",
      "compose",
      "render",
    ]);
  });

  /*
   * A step name this build has never seen belongs to a NEWER server, which is
   * an ordinary thing for a self-hosted product. It falls off the end of the
   * lane and shows its own name rather than blanking the line.
   */
  it("survives a step from a server newer than this app", () => {
    expect(stepIndex("music")).toBe(-1);
    expect(stepLabel("music")).toBe("music");
  });

  it("has something to say before the first step is reported", () => {
    expect(stepLabel(undefined)).toBe("Starting");
  });

  /* Minutes of work behind a rate-limited read route: quick at first, because a
   * misconfigured server fails almost immediately, then well backed off. */
  it("backs off to a ceiling", () => {
    expect(pollDelay(0)).toBe(1000);
    expect(pollDelay(1)).toBeGreaterThan(pollDelay(0));
    expect(pollDelay(20)).toBe(4000);
  });
});

describe("the frame a video comes out in", () => {
  it("is portrait by default and matches each ratio", () => {
    expect(frameSizeFor("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(frameSizeFor("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(frameSizeFor("16:9")).toEqual({ width: 1920, height: 1080 });
  });
});

/* The one thing the module cannot get wrong quietly: sharing a vocabulary with
 * the other client, so a screen showing "out of credits" need not know which
 * of the two produced it. */
it("throws the same error type genClient throws", async () => {
  replies.push({ status: 402, body: {} });
  await expect(
    startGeneration("http://x", { topic: "t", aspect: "9:16" }),
  ).rejects.toBeInstanceOf(GenError);
});
