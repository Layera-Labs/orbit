import { describe, expect, it } from "vitest";
import { buildFFmpegArgs } from "../ffmpeg";
import { createProject } from "../project";
import { HDR_CONVERT_FILTER, supportsHdr } from "../hdr";
import type { VideoProject } from "../types";

/**
 * HDR10 used to be tags and nothing else, so an export came back with every
 * warm tone blown out to pure red. These tests are mostly about the one thing
 * that distinguishes a correct HDR file from that one: the pixels are actually
 * converted, and the conversion happens BEFORE the encoder is told what they
 * are.
 */

function hdrProject(): VideoProject {
  return {
    ...createProject({ width: 1080, height: 1920, fps: 30 }),
    schemaVersion: 2,
    tracks: [
      {
        id: "base",
        kind: "visual",
        clips: [
          { id: "v0", type: "video", src: "a.mp4", start: 0, duration: 4, trimIn: 0 },
        ],
      },
    ],
  } as VideoProject;
}

const build = (out?: Record<string, unknown>) =>
  buildFFmpegArgs(hdrProject(), {
    outputPath: "out.mp4",
    baseImage: "/tmp/bg.png",
    output: out as never,
  });

describe("supportsHdr", () => {
  it("finds zscale in a real filter listing", () => {
    expect(supportsHdr(" T.. zoompan V->V\n .S. zscale  V->V  Apply resizing\n")).toBe(true);
  });

  it("is false for a build without it", () => {
    // Homebrew's default ffmpeg. `colorspace` is present and is NOT a fallback:
    // its transfer list stops at bt2020-12 and cannot emit PQ.
    expect(supportsHdr(" .S. colorspace V->V\n .S. tonemap V->V\n")).toBe(false);
  });

  it("does not match a filter that merely contains the name", () => {
    expect(supportsHdr(" .S. zscaler V->V\n")).toBe(false);
    expect(supportsHdr(" .S. unzscale V->V\n")).toBe(false);
  });
});

describe("HDR10 args", () => {
  it("converts the pixels, not just the tags", () => {
    const s = build({ hdr: true }).join(" ");
    expect(s).toContain(HDR_CONVERT_FILTER);
    expect(s).toContain("t=smpte2084"); // the PQ transfer, applied not asserted
    expect(s).toContain("p=bt2020"); // and the gamut actually mapped
    expect(s).toContain("format=yuv420p10le");
  });

  /*
   * Both halves of this were found by running the filter against Debian's
   * ffmpeg rather than reasoning about it. Frames reaching the end of our graph
   * are tagged `unspecified`, and zimg will not guess — the conventional
   * linearize-then-convert chain dies with "no path between colorspaces". A
   * regression here does not produce slightly-wrong colour, it produces an
   * export that fails outright, so it is worth pinning.
   */
  it("states its input colour properties, in a single hop", () => {
    const s = build({ hdr: true }).join(" ");
    expect(s).toContain("tin=bt709");
    expect(s).toContain("pin=bt709");
    expect(s).toContain("min=bt709");
    expect(s).toContain("rin=tv");
    expect(s).not.toContain("t=linear"); // the chain that cannot run
    expect(s).not.toContain("gbrpf32le");
    expect(HDR_CONVERT_FILTER.match(/zscale/g)).toHaveLength(1);
  });

  /* SDR white is 100 nits. Drop this and the picture comes out dim. */
  it("pins SDR white to the reference luminance", () => {
    expect(build({ hdr: true }).join(" ")).toContain("npl=100");
  });

  it("puts the conversion in the filtergraph, ahead of the encoder flags", () => {
    const args = build({ hdr: true });
    const graph = args.indexOf("-filter_complex");
    const encoder = args.indexOf("-color_trc");
    expect(graph).toBeGreaterThanOrEqual(0);
    expect(encoder).toBeGreaterThan(graph);
    // The conversion lives INSIDE the filtergraph argument, not among the flags.
    expect(args[graph + 1]).toContain("zscale");
  });

  it("encodes 10-bit HEVC tagged to match what the filter produced", () => {
    const s = build({ hdr: true }).join(" ");
    expect(s).toContain("-c:v libx265");
    expect(s).toContain("-pix_fmt yuv420p10le");
    expect(s).toContain("-color_primaries bt2020");
    expect(s).toContain("-color_trc smpte2084");
    expect(s).toContain("-colorspace bt2020nc");
    expect(s).toContain("-tag:v hvc1"); // otherwise Apple players won't touch it
  });

  /*
   * The luminance claim has to match what we actually produced. `npl=100` maps
   * SDR white to 100 nits, so `L(1000000,1)` — 100 nits, in 0.0001 units — is
   * true. The usual L(10000000,1) would promise a 1000-nit peak that is not
   * there, and a display would tone-map for highlights that never arrive.
   */
  it("declares a mastering display it can honour, and invents no max-cll", () => {
    const s = build({ hdr: true }).join(" ");
    expect(s).toContain("master-display=");
    expect(s).toContain("L(1000000,1)");
    expect(s).not.toContain("L(10000000,1)");
    expect(s).not.toContain("max-cll"); // unmeasured, so unstated
  });

  it("scales before converting, never after", () => {
    const graph = build({ hdr: true, width: 720, height: 1280 })[
      build({ hdr: true, width: 720, height: 1280 }).indexOf("-filter_complex") + 1
    ];
    const scale = graph.indexOf("scale=720:1280");
    const convert = graph.indexOf("zscale=tin=bt709");
    expect(scale).toBeGreaterThanOrEqual(0);
    expect(convert).toBeGreaterThan(scale);
  });

  it("leaves an SDR export completely untouched", () => {
    const s = build({ width: 720, height: 1280 }).join(" ");
    expect(s).not.toContain("zscale");
    expect(s).not.toContain("smpte2084");
    expect(s).not.toContain("bt2020");
    expect(s).toContain("-c:v libx264");
    expect(s).toContain("-pix_fmt yuv420p");
  });

  it("has no HDR anything when no output settings are given at all", () => {
    const s = buildFFmpegArgs(hdrProject(), {
      outputPath: "out.mp4",
      baseImage: "/tmp/bg.png",
    }).join(" ");
    expect(s).not.toContain("zscale");
    expect(s).toContain("-c:v libx264");
  });
});

/*
 * The legacy single-track path reads NONE of the output settings — not the
 * resolution, not the fps, not audio-only, not HDR. Silently returning a file
 * that ignores what was asked for is the same class of failure as the mistagged
 * HDR: an answer that looks like an answer.
 */
describe("legacy projects and export settings", () => {
  const legacy = () =>
    createProject({
      width: 1080,
      height: 1920,
      clips: [{ id: "c", type: "video", src: "a.mp4", start: 0, duration: 3 }],
    });

  it("refuses HDR rather than quietly exporting SDR", () => {
    expect(() =>
      buildFFmpegArgs(legacy(), { outputPath: "o.mp4", output: { hdr: true } }),
    ).toThrow(/multi-track/);
  });

  it("refuses the other settings it would also drop", () => {
    expect(() =>
      buildFFmpegArgs(legacy(), {
        outputPath: "o.mp4",
        output: { width: 3840, height: 2160 },
      }),
    ).toThrow(/multi-track/);
    expect(() =>
      buildFFmpegArgs(legacy(), { outputPath: "o.mp4", output: { audioOnly: true } }),
    ).toThrow(/multi-track/);
  });

  it("still renders when nothing was asked for", () => {
    expect(() => buildFFmpegArgs(legacy(), { outputPath: "o.mp4" })).not.toThrow();
    // An empty object is not a request, and must not be treated as one.
    expect(() =>
      buildFFmpegArgs(legacy(), { outputPath: "o.mp4", output: {} }),
    ).not.toThrow();
  });
});
