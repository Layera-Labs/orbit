# @layera-labs/render

The canvas renderer for the Orbit v2 SDK. It turns a `@layera-labs/model` document
into [react-konva](https://konvajs.org/docs/react/) nodes, and adds the interaction
that has to live next to the canvas: selection, transform handles, snapping.

The rule it is built on: **the canvas is a pure function of the model.** Nothing here
owns state. Every gesture ends in a store method, and the next frame is whatever the
store now says.

This is **v2**, the current line, alongside `@layera-labs/model`,
`@layera-labs/providers` and `@layera-labs/editor`. It is not the same thing as
`@layera-labs/core`, which is the v1 fabric.js engine.

```bash
npm i @layera-labs/render@beta konva react-konva
```

> **Beta.** `1.0.0-beta.1` under the `beta` tag; the API moves without notice.

## React 18 only, and this is the package that makes it non-negotiable

`konva`, `react-konva`, `react` and `react-dom` are **peer** dependencies, and the
peer range is `react ^18.2.0` with `react-konva ^18.2.10`.

`react-konva@18.2.x` is the React-18 line. Installing it beside React 19 gives you two
React copies in one tree, and Konva's custom reconciler does not survive that — it is
a hard crash, not a warning. React 19 was actually attempted across the workspace
(`react-konva@19` plus three source lines, after which the full suite passes), but the
suite does not mount the reconciler, so that is not evidence yet. Until an editor has
run on it, the answer is React 18.

Install `konva` and `react-konva` yourself, at matching versions. This package does
not bundle them.

## Usage

```tsx
import { createStore } from '@layera-labs/model';
import { Workspace } from '@layera-labs/render';

const store = createStore({ width: 1080, height: 1080 });

export function Canvas() {
  return <Workspace store={store} />;
}
```

`Workspace` also takes a `backdrop` colour and a `stageApiRef`, which receives the
live `Konva.Stage` — that is how you get at the stage for hit-testing or for the
export helpers below.

## Export, and snapping, without the editor

Rasterising and SVG export live here rather than in the UI package, because both need
the stage:

```ts
import { exportStageToDataURL, dataURLToBlob, exportPageToSVG } from '@layera-labs/render';

const page = store.activePage;
const { zoom, x, y } = store.state.viewport;

const png = exportStageToDataURL(stage, {
  pageWidth: page.width,
  pageHeight: page.height,
  zoom,
  panX: x,
  panY: y,
  format: 'png',
});
const blob = dataURLToBlob(png);

const svg = exportPageToSVG(page);
```

`exportStageToDataURL` is synchronous and takes the page geometry explicitly, because
it exports at the page's **native** resolution regardless of the current on-screen
zoom — it needs to know what the zoom it is undoing was.

`computeSnap` is the alignment maths on its own, if you are driving a drag yourself.
`useImage` is the loader the image nodes use.

Most consumers should not reach for this directly.
[`@layera-labs/editor`](https://github.com/Layera-Labs/orbit/tree/main/packages/editor#readme)
mounts it inside a full editor shell with panels, a toolbar and export. Use this
package when you want the canvas and none of that chrome — a viewer, a thumbnail
surface, your own layout around someone else's document.

## The selection chrome needs the `.orbit` scope

The transform handles, guides and hover outlines are styled by `.o-*` class rules
scoped under `.orbit`, which also declares the `--o-*` custom properties they read.
If you mount this package without `@layera-labs/editor`, wrap it in
`<div className="orbit">` and include `@layera-labs/editor/styles.css`, or the chrome
renders unstyled.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/architecture-v2.md](https://github.com/Layera-Labs/orbit/blob/main/docs/architecture-v2.md)

MIT.
