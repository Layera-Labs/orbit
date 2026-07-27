import { describe, expect, it } from "vitest";
import { buildFFmpegArgs } from "../ffmpeg";
import { projectDuration } from "../project";
import type { VideoProject } from "../types";

function multiTrackProject(): VideoProject {
  return {
    id: "p",
    schemaVersion: 2,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: "color", color: "#000000" },
    clips: [],
    overlays: [],
    audio: [],
    tracks: [
      {
        id: "base",
        kind: "visual",
        clips: [
          {
            id: "v0",
            type: "video",
            src: "base.mp4",
            start: 0,
            duration: 6,
            trimIn: 0,
          },
          {
            id: "v1",
            type: "video",
            src: "tail.mp4",
            start: 6,
            duration: 4,
            trimIn: 1,
          },
        ],
      },
      {
        id: "overlay",
        kind: "visual",
        clips: [
          // a picture-in-picture image from t=2 to t=5, top-right quarter
          {
            id: "img",
            type: "image",
            src: "logo.png",
            start: 2,
            duration: 3,
            rect: { x: 0.55, y: 0.05, w: 0.4, h: 0.25 },
          },
        ],
      },
      {
        id: "music",
        kind: "audio",
        clips: [
          { id: "a0", src: "music.mp3", start: 1, duration: 8, volume: 0.8 },
        ],
      },
    ],
  };
}

describe("multi-track ffmpeg builder", () => {
  const project = multiTrackProject();
  const args = buildFFmpegArgs(project, {
    outputPath: "/tmp/out.mp4",
    baseImage: "/tmp/bg.png",
    hasAudio: () => true,
  });
  const graph = args[args.indexOf("-filter_complex") + 1];

  it("computes duration from absolute clip ends", () => {
    expect(projectDuration(project)).toBe(10); // base ends at 10
  });

  it("uses the background base image as a looped input", () => {
    expect(args).toContain("/tmp/bg.png");
    expect(graph).toContain("[0:v]scale=1080:1920");
  });

  it("time-shifts clips to their absolute start and gates with enable", () => {
    expect(graph).toContain("setpts=PTS-STARTPTS+6/TB"); // second base clip starts at 6
    expect(graph).toContain("enable='between(t,2,5)'"); // overlay image window
  });

  it("positions the PiP image at its rect (top-right quarter)", () => {
    // rect x=0.55*1080=594, y=0.05*1920=96 ; size 0.4*1080=432 x 0.25*1920=480
    expect(graph).toContain("overlay=594:96");
    expect(graph).toContain("scale=432:480");
  });

  it("delays positioned audio and mixes clip audio with the music track", () => {
    expect(graph).toContain("adelay=1000:all=1"); // music starts at 1s
    expect(graph).toContain("amix=inputs=");
  });

  it("skips audio for a source reported to have none", () => {
    const noAudio = buildFFmpegArgs(project, {
      outputPath: "/tmp/out.mp4",
      baseImage: "/tmp/bg.png",
      hasAudio: () => false,
    });
    const g = noAudio[noAudio.indexOf("-filter_complex") + 1];
    expect(g).not.toContain("amix");
    expect(g).not.toContain("adelay");
  });

  it("renders local mosaic and magnifier regions instead of global effects", () => {
    const p = multiTrackProject();
    const base = p.tracks?.[0];
    if (!base || base.kind !== "visual")
      throw new Error("missing visual track");
    base.clips[0] = {
      ...base.clips[0],
      mosaic: {
        pattern: "hexagon",
        shape: "rounded",
        cx: 0.5,
        cy: 0.5,
        rx: 0.2,
        ry: 0.2,
        amount: 0.7,
        opacity: 0.85,
      },
      magnifier: {
        shape: "circle",
        cx: 0.7,
        cy: 0.3,
        rx: 0.16,
        ry: 0.16,
        opacity: 1,
        zoom: 2.5,
        borderWidth: 0.012,
        borderColor: "#ffffff",
      },
    };
    const effectArgs = buildFFmpegArgs(p, {
      outputPath: "/tmp/out.mp4",
      baseImage: "/tmp/bg.png",
      hasAudio: () => true,
    });
    const effectGraph = effectArgs[effectArgs.indexOf("-filter_complex") + 1];

    expect(effectGraph).toContain("flags=neighbor");
    expect(effectGraph).toContain("flags=lanczos");
    expect(effectGraph).toContain("colorchannelmixer=aa=0.85");
    expect(effectGraph).toContain("[mgp0_1]");
  });
});

describe("animated text overlays (motion + keyframes)", () => {
  function withCaption(overlay: VideoProject["overlays"][number]): string {
    const p = multiTrackProject();
    p.overlays = [overlay];
    const args = buildFFmpegArgs(p, {
      outputPath: "/tmp/out.mp4",
      baseImage: "/tmp/bg.png",
      overlayImages: { [overlay.id]: "/tmp/cap.png" },
      hasAudio: () => true,
    });
    return args[args.indexOf("-filter_complex") + 1];
  }
  const base = {
    id: "cap",
    type: "text" as const,
    text: "Hi",
    start: 2,
    end: 6,
    x: 0.5,
    y: 0.8,
    fontSize: 64,
    color: "#fff",
  };

  it("zoom/pans the caption layer and re-anchors PTS to the caption start", () => {
    const g = withCaption({
      ...base,
      motion: { type: "zoomIn", intensity: 0.6 },
    });
    expect(g).toContain("zoompan");
    expect(g).toContain("setpts=PTS-STARTPTS+2/TB");
    expect(g).toContain("enable='between(t,2,6)'");
  });

  it("bakes keyframed opacity into the alpha plane", () => {
    const g = withCaption({
      ...base,
      keyframes: [
        { t: 0, opacity: 0, x: 0.5, y: 0.8 },
        { t: 1, opacity: 1, x: 0.5, y: 0.8 },
      ],
    });
    expect(g).toContain("a='clip(");
    expect(g).toContain("geq=");
  });

  it("translates the layer by the delta from the baked anchor for position keyframes", () => {
    const g = withCaption({
      ...base,
      keyframes: [
        { t: 0, opacity: 1, x: 0.5, y: 0.8 },
        { t: 1, opacity: 1, x: 0.2, y: 0.4 },
      ],
    });
    // baked anchor x=0.5*1080=540, y=0.8*1920=1536 subtracted from the kf expression
    expect(g).toContain(")-540");
    expect(g).toContain(")-1536");
  });

  it("keeps a static caption at overlay 0:0 with its time gate", () => {
    const g = withCaption({ ...base });
    expect(g).toContain("overlay=0:0:enable='between(t,2,6)'");
  });

  it("applies static text opacity to the caption alpha channel", () => {
    const g = withCaption({ ...base, opacity: 0.42 });
    expect(g).toContain("colorchannelmixer=aa=0.42");
  });

  it("applies a normalized shape mask to the full-frame caption layer", () => {
    const g = withCaption({
      ...base,
      mask: {
        shape: "rectangle",
        cx: 0.5,
        cy: 0.5,
        rx: 0.25,
        ry: 0.2,
        invert: false,
      },
    });
    expect(g).toContain(
      "a='if(lte(abs(X-540),270)*lte(abs(Y-960),384),alpha(X,Y),0)'",
    );
  });
});
