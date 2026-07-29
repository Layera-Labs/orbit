import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reconciliation rules, exercised against a fake server.
 *
 * These are the rules that decide whether someone's work survives, and they are
 * duplicated in `apps/web/src/db/sync.ts` because the two clients cannot share
 * code. Two clients reconciling differently against one server is how edits get
 * lost, so the rules are worth pinning down on the side that CAN be tested.
 *
 * Storage, the watermark file and auth are all faked. What is real is the
 * decision sequence: what gets pulled, what gets pushed, and what happens when
 * the server says no.
 */

interface Stored {
  id: string;
  name: string;
  updatedAt: number;
  [k: string]: unknown;
}

const disk = new Map<string, Stored>();

vi.mock("../../storage/projects", () => ({
  listProjects: () => [...disk.values()],
  loadProject: (id: string) => disk.get(id) ?? null,
  saveProject: (p: Stored) => {
    disk.set(p.id, p);
  },
  deleteProject: (id: string) => {
    disk.delete(id);
  },
}));

let markValue = 0;
/** The watermark and the pending-delete list both live in files. */
const files = new Map<string, string>();
vi.mock("expo-file-system", () => {
  class File {
    constructor(
      public dir: unknown,
      public name: string,
    ) {}
    get exists() {
      return this.name === "sync-mark.json" ? markValue > 0 : files.has(this.name);
    }
    textSync() {
      return this.name === "sync-mark.json"
        ? JSON.stringify({ at: markValue })
        : (files.get(this.name) ?? "");
    }
    write(s: string) {
      if (this.name === "sync-mark.json") markValue = (JSON.parse(s) as { at: number }).at;
      else files.set(this.name, s);
    }
    delete() {
      if (this.name === "sync-mark.json") markValue = 0;
      else files.delete(this.name);
    }
    get uri() {
      return `file:///${this.name}`;
    }
  }
  return { File, Directory: class {}, Paths: { document: "/doc", cache: "/cache" } };
});

vi.mock("../session", () => ({ authHeaders: async () => ({}) }));

const { syncNow, syncDelete } = await import("../syncClient");

/** A server that behaves like `PgProjectStore`: last write wins, ties refused. */
function server(initial: Stored[] = []) {
  const rows = new Map<string, Stored & { deleted?: boolean }>();
  for (const r of initial) rows.set(r.id, { ...r });
  let clock = 1_000_000;

  const handler = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = url.replace(/^.*\/v1\//, "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (path.startsWith("projects?")) {
      const since = Number(new URL(url, "http://x").searchParams.get("since") ?? 0);
      return json(200, {
        now: (clock += 1),
        projects: [...rows.values()]
          .filter((r) => r.updatedAt > since)
          .map((r) => ({
            id: r.id,
            kind: "video",
            name: r.name,
            updatedAt: r.updatedAt,
            deleted: !!r.deleted,
          })),
      });
    }

    const id = path.replace(/^projects\//, "");
    const method = init?.method ?? "GET";

    if (method === "GET") {
      const row = rows.get(id);
      if (!row || row.deleted) return json(404, { error: "not found" });
      return json(200, { kind: "video", name: row.name, data: row, updatedAt: row.updatedAt });
    }

    if (method === "PUT") {
      const body = JSON.parse(String(init?.body)) as { name: string; updatedAt: number; data: Stored };
      const existing = rows.get(id);
      // The real rule: strictly newer wins, an equal timestamp is refused.
      if (existing && existing.updatedAt >= body.updatedAt)
        return json(409, {
          current: { kind: "video", name: existing.name, data: existing, updatedAt: existing.updatedAt },
        });
      rows.set(id, { ...body.data, id, name: body.name, updatedAt: body.updatedAt });
      return json(200, { ok: true });
    }

    if (method === "DELETE") {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, deleted: true, updatedAt: (clock += 1) });
      return json(200, { ok: true });
    }
    return json(400, { error: "unexpected" });
  };

  return {
    rows,
    install() {
      globalThis.fetch = ((url: string, init?: RequestInit) =>
        handler(String(url), init)) as unknown as typeof fetch;
    },
  };
}

const doc = (id: string, name: string, updatedAt: number): Stored => ({ id, name, updatedAt });

const PENDING = "sync-pending-deletes.json";

beforeEach(() => {
  disk.clear();
  files.clear();
  markValue = 0;
});

describe("syncNow", () => {
  it("uploads what this device has", async () => {
    disk.set("a", doc("a", "Alpha", 5));
    server().install();
    expect(await syncNow("http://s")).toMatchObject({ state: "ok", pushed: 1, pulled: 0 });
  });

  it("downloads what it has never seen", async () => {
    server([doc("b", "Beta", 7)]).install();
    const res = await syncNow("http://s");
    expect(res).toMatchObject({ state: "ok", pulled: 1 });
    expect(disk.get("b")?.name).toBe("Beta");
  });

  /*
   * THE bug this file was written for.
   *
   * `since` is still the OLD watermark while the push runs, so a project the
   * pull just wrote looks exactly like a local edit — and gets pushed back at
   * the very timestamp it arrived with. The server refuses an equal timestamp
   * (right, for two real writers), the client reads 409 as "both sides
   * changed", and a first sync duplicates EVERY project as "(this phone)". It
   * compounded: the copy was itself pushed next time, producing names like
   * "Video (this phone) (this phone)".
   */
  it("does not push back what it just pulled", async () => {
    server([doc("x", "Gamma", 7), doc("y", "Delta", 8)]).install();

    const res = await syncNow("http://s");

    expect(res).toMatchObject({ state: "ok", pulled: 2, pushed: 0, conflicts: 0 });
    expect([...disk.values()].map((d) => d.name).sort()).toEqual(["Delta", "Gamma"]);
  });

  /* And it settles: a second pass has nothing to say. */
  it("converges instead of trading the same document forever", async () => {
    server([doc("x", "Gamma", 7)]).install();
    await syncNow("http://s");
    expect(await syncNow("http://s")).toMatchObject({ pulled: 0, pushed: 0, conflicts: 0 });
    expect(disk.size).toBe(1);
  });

  /*
   * A pulled project must keep the SERVER's timestamp. Stamping local time
   * makes the copy we just pulled look newer than the one we pulled it from.
   */
  it("keeps the server's timestamp on a pulled project", async () => {
    server([doc("x", "Gamma", 7)]).install();
    await syncNow("http://s");
    expect(disk.get("x")?.updatedAt).toBe(7);
  });

  /* A real conflict still keeps BOTH — losing an edit silently is the one
     outcome that is not acceptable. */
  it("keeps both copies when both sides really did change", async () => {
    disk.set("x", doc("x", "Mine", 5));
    server([doc("x", "Theirs", 9)]).install();

    // A watermark in the past, so the local copy counts as a local edit.
    markValue = 1;
    const res = await syncNow("http://s");

    expect(res).toMatchObject({ conflicts: 1 });
    const names = [...disk.values()].map((d) => d.name).sort();
    expect(names).toEqual(["Mine (this phone)", "Theirs"]);
  });

  it("reports a guest rather than retrying something that cannot work", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    expect(await syncNow("http://s")).toEqual({ state: "guest" });
  });

  /* The watermark only advances once BOTH halves are done — otherwise a failed
     push looks synced forever. */
  it("does not advance the watermark when the listing fails", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    expect(await syncNow("http://s")).toMatchObject({ state: "failed" });
    expect(markValue).toBe(0);
  });
});

/**
 * A delete has to survive the network being down.
 *
 * An absent tombstone is indistinguishable from a project the server has never
 * been told about, so a delete that never lands is not merely forgotten — the
 * next full pull hands the project straight back.
 */
describe("syncDelete", () => {
  it("remembers a delete the server refused", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await syncDelete("http://s", "gone");
    expect(JSON.parse(files.get(PENDING) ?? "[]")).toEqual(["gone"]);
  });

  /* The old version only caught a THROWN error, so a 500 or an expired session
     answered it successfully and the delete was dropped on the floor. */
  it("remembers one the network never delivered", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await syncDelete("http://s", "gone");
    expect(JSON.parse(files.get(PENDING) ?? "[]")).toEqual(["gone"]);
  });

  it("remembers nothing when it worked", async () => {
    server().install();
    await syncDelete("http://s", "gone");
    expect(files.has(PENDING)).toBe(false);
  });

  it("does not queue the same id twice", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await syncDelete("http://s", "gone");
    await syncDelete("http://s", "gone");
    expect(JSON.parse(files.get(PENDING) ?? "[]")).toEqual(["gone"]);
  });

  /* The whole point: the retry happens BEFORE the listing, so the tombstone
     exists by the time we ask what changed. Otherwise the pull resurrects it. */
  it("retries on the next sync, and the project stays deleted", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await syncDelete("http://s", "zombie");

    const s2 = server([doc("zombie", "Should stay gone", 5)]);
    s2.install();
    const res = await syncNow("http://s");

    expect(res).toMatchObject({ state: "ok" });
    expect(files.get(PENDING)).toBe("[]");
    expect(disk.has("zombie")).toBe(false);
    expect(s2.rows.get("zombie")?.deleted).toBe(true);
  });

  /* Without the retry this is exactly what happened: the pull sees a project it
     has no local copy of, and helpfully downloads it again. */
  it("resurrects it if the tombstone never gets there", async () => {
    const s2 = server([doc("zombie", "Comes back", 5)]);
    s2.install();
    await syncNow("http://s");
    expect(disk.has("zombie")).toBe(true);
  });
});
