# @layera-labs/effects

WebGL image effects for the **v1** Orbit editor: a brightness / contrast / saturation /
temperature adjustment renderer, a multi-light normal-mapped lighting shader, and the
GLSL source for both.

```bash
npm i @layera-labs/effects@beta
```

> **Beta.** `1.0.0-beta.1` under the `beta` tag; the API moves without notice.
>
> **v1 line, which is legacy.** It exists because `@layera-labs/core` uses it.

## These are not the video engine's filters

Worth being clear about, because the names overlap and the difference matters.

The colour grading in
[`@layera-labs/video`](https://github.com/Layera-Labs/orbit/tree/main/packages/video#readme)
is modelled on ffmpeg's `eq` filter as it actually runs — on the YUV planes, in BT.601
limited range — so that a browser preview and a server-side MP4 export agree to within
a few units out of 255. That agreement is enforced by tests that parse the real
filtergraph.

**Nothing in this package participates in that.** These shaders are a straightforward
RGB treatment: brightness adds, contrast pivots around 0.5, saturation mixes toward a
Rec.601 luma, temperature pushes red up and blue down. They are for adjusting a still
image on a canvas. They are not dual-rendered, they have no ffmpeg counterpart, and
applying them to a frame will not reproduce what an export produces.

## Adjustments

```ts
import { AdjustmentRenderer, DEFAULT_ADJUSTMENTS } from '@layera-labs/effects';

const renderer = new AdjustmentRenderer(image.width, image.height);
renderer.loadImage(image);                       // HTMLImageElement | HTMLCanvasElement | ImageBitmap

const pixels = renderer.render({ ...DEFAULT_ADJUSTMENTS, contrast: 1.2, temperature: 0.05 });
const dataUrl = renderer.renderToDataURL({ ...DEFAULT_ADJUSTMENTS, saturation: 0 }, 'image/png');

renderer.destroy();
```

`render` returns `ImageData`. `setSize` reshapes the offscreen canvas; `destroy`
releases the GL context, textures and buffers, and you should call it — a WebGL
context is a scarce resource and browsers cap how many a page may hold.

## Lighting

`LightingShader` composites up to four coloured point lights against a normal map.
`lightingVertexShader` and `lightingFragmentShader` are exported as strings if you
want to compile them into your own pipeline rather than use the class.

## Browser only

Both classes construct a canvas and ask it for a `webgl` context in their
constructors. There is no software fallback and no Node path. Feature-detect before
constructing, and hide the control rather than offering an effect you cannot apply —
that is what the editor does.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/layers.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/layers.md)

MIT.
