import { afterEach, describe, expect, it, vi } from "vitest";
import { envNumber } from "../server.js";

const KEY = "ORBIT_TEST_ENV_NUMBER";

afterEach(() => {
  delete process.env[KEY];
  vi.restoreAllMocks();
});

describe("envNumber", () => {
  it("treats an EMPTY string as unset — the bug that deleted every upload", () => {
    /*
     * `docker compose` writes optional variables as `X: ${X:-}`, which sets the
     * empty string rather than leaving it unset. The old
     * `Number(process.env.X ?? fallback)` skipped its fallback (?? only fires on
     * null/undefined) and `Number("")` is 0 — so the media budget became zero
     * bytes and eviction deleted each upload the moment it landed.
     */
    process.env[KEY] = "";
    expect(envNumber(KEY, 5_000)).toBe(5_000);
  });

  it("treats whitespace as unset too", () => {
    process.env[KEY] = "   ";
    expect(envNumber(KEY, 42)).toBe(42);
  });

  it("uses a real value when given one", () => {
    process.env[KEY] = "1234";
    expect(envNumber(KEY, 42)).toBe(1234);
  });

  it("falls back when unset", () => {
    expect(envNumber(KEY, 42)).toBe(42);
  });

  it("refuses garbage, and says so rather than failing silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[KEY] = "lots";
    expect(envNumber(KEY, 42)).toBe(42);
    expect(warn).toHaveBeenCalled();
  });

  it("refuses zero and negatives for a limit, budget or interval", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[KEY] = "0";
    expect(envNumber(KEY, 42)).toBe(42);
    process.env[KEY] = "-1";
    expect(envNumber(KEY, 42)).toBe(42);
  });

  it("ALLOWS zero where zero is a real choice, like a credit cost", () => {
    // ORBIT_RENDER_COST=0 means "export is unmetered", which is the
    // guest-first default — it must not be overridden by the fallback.
    process.env[KEY] = "0";
    expect(envNumber(KEY, 5, 0)).toBe(0);
  });

  it("still refuses a negative cost", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[KEY] = "-3";
    expect(envNumber(KEY, 5, 0)).toBe(5);
  });
});
