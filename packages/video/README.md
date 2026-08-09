# @layera-labs/video

The video engine behind [Orbit](https://github.com/Layera-Labs/orbit). A timeline
document model, the maths for every effect, a `DrawOp[]` draw list for live preview,
and an ffmpeg filtergraph builder that encodes the same project to an MP4.

It is **not** an editor and not a React package. There are no components here, no
canvas, no DOM. It computes what a frame should look like; something else draws it.

```bash
npm i @layera-labs/video@beta
```

> **Beta.** `1.0.0-beta.1`, published under the `beta` tag. The API moves without
> notice until 1.0.0. Nothing in this package needs React.

## The one idea

**Every effect is rendered twice from one model, and the two must agree.**

A filter, a transition, a Ken Burns move, a chroma key, a rounded canvas frame — each
is defined once, then drawn live in the browser and encoded by ffmpeg on the server.
The maths is shared rather than reimplemented, and `dual-render.test.ts` parses the
real filtergraph out of `buildFFmpegArgs` and asserts it agrees with `frameStateAt`.
A preview that lies about the export is a failing test.

Where the two genuinely cannot agree, the divergence is measured against real ffmpeg
and written down. Measured against a decoded MP4: ungraded clips, alpha ramps and
geometry agree to **≤2/255**; colour grading to **≤6/255**, reaching 10 on the `vivid`
preset's saturated colour. It is not byte-identical and this package does not claim
it is.

## Three entries, and the difference matters

| Entry | Modules | Reaches |
|---|---|---|
| `@layera-labs/video` | 31 | Nothing outside itself. Browser-safe |
| `@layera-labs/video/browser` | 31 | Identical to the default — the default is `export * from './browser'` |
| `@layera-labs/video/node` | 34 | The superset. Adds `renderProject`, `rasterizeSVG`, Google font resolution, and with them `@resvg/resvg-js`, `node:child_process`, `node:fs`, `node:os`, `node:path` |

`@layera-labs/video/types` is the type module on its own, for a consumer who wants
`VideoProject` and nothing else.

The default entry's purity is a promise, not a convention: `browser-safety.test.ts`
walks the import graph of **both** the default and `./browser` and fails if a `node:`
builtin ever reaches either. Import `./node` only from Node.

## Build a project and render it

```ts
import { createProject } from '@layera-labs/video/browser';
import { renderProject } from '@layera-labs/video/node';

const project = createProject({
  width: 1080,
  height: 1920,
  tracks: [
    {
      id: 'main',
      kind: 'visual',
      clips: [
        { id: 'c1', type: 'image', src: '/tmp/a.jpg', start: 0, duration: 3 },
        { id: 'c2', type: 'image', src: '/tmp/b.jpg', start: 3, duration: 3,
          transitionIn: { type: 'fade', duration: 0.5 } },
      ],
    },
  ],
});

const result = await renderProject(project, {
  outputPath: '/tmp/out.mp4',
  onFraction: (f) => console.log(`${Math.round(f * 100)}%`),
  thumbnail: { path: '/tmp/out.jpg', atSec: 1 },
});
// → { path, durationSec, bytes, thumbnailPath? }
```

`renderProject` shells out to `ffmpeg` and `ffprobe`. Any build from 5.1 works;
**6.1+ unlocks 8 more transition variants** (Push ×4 and Reveal ×4, whose `cover*` and
`reveal*` xfade tokens do not exist before it). Ask a box what it has with
`ffmpegXfadeTokens()`.

## Preview a frame without rendering

```ts
import { frameStateAt } from '@layera-labs/video/browser';

const ops = frameStateAt(project, 3.25); // DrawOp[] — what is on screen at t=3.25s
```

`frameStateAt` computes everything and draws nothing. That is what lets a canvas 2D
compositor, a Skia compositor and the ffmpeg export all share one answer. If you are
writing a preview, this is the function you want; the drawing is yours.

## What is in the box

Transitions (22 families / 52 variants, of which `previewableTransitions()` offers the
51 that both renderers can do), filter presets modelled on ffmpeg's YUV planes in
BT.601, Ken Burns motion, blur, chroma key, masks, blend modes, per-clip speed,
element fade/slide animation, audio fades and volume curves, real sfnt text metrics
and wrapping, image and shape overlays, canvas frames, karaoke word timing, and SRT
export.

**Not built, deliberately:** speed ramping (ffmpeg cannot smoothly ramp audio tempo,
so there is no faithful preview) and keyframed scale/rotation (ffmpeg cannot animate
scale per frame). Segment/parallel rendering is not built either — one call is one
encode.

`RenderResult` carries `path`, `durationSec`, `bytes` and an optional `thumbnailPath`.
It does not carry `width`, `height`, `fps` or `encodeMs`.

## A note on SVG

`overlayToSVG` and `backgroundToSVG` build markup by hand, and a `VideoProject`
arrives as untrusted JSON. Strings go through `esc`, numbers through `num`, and
colours and font families through `col`/`fontFamily` — the last of those matters
because `esc` is an XML transform the parser undoes, so an escaped `url('/etc/passwd')`
decodes back into a live reference. `rasterizeSVG` refuses any SVG containing
`<image>`, `<use>`, `<script>` or `<foreignObject>`. If you extend the builders, never
interpolate a raw value into markup.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/video.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/video.md)
- [docs/guide/transitions.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/transitions.md)
- [docs/guide/export.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/export.md)

MIT.
