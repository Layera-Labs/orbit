# @layera-labs/core

The canvas engine behind the **v1** Orbit SDK: a scene graph of layers, a
[Fabric.js](http://fabricjs.com) renderer, a viewport controller, undo/redo, drawing
and vector tools, audio, and transitions. Framework-agnostic — it takes a DOM element
and manages the canvas inside it.

```bash
npm i @layera-labs/core@beta
```

> ### Read this before installing
>
> **This is the v1 SDK, and v1 is legacy.** It builds, it is tested, and it is
> feature-complete for what it does, but it is in maintenance: it gets fixes, not
> features. `@layera-labs/core`, `@layera-labs/react`, `@layera-labs/next`,
> `@layera-labs/ui`, `@layera-labs/shared`, `@layera-labs/effects` and
> `@layera-labs/agentic` are all v1.
>
> **The current line is v2**: `@layera-labs/model` (a headless Valtio document store)
> → `@layera-labs/render` (react-konva) → `@layera-labs/providers` →
> [`@layera-labs/editor`](https://github.com/Layera-Labs/orbit/tree/main/packages/editor#readme).
> If you are starting something new, start there. The two lines share no code and do
> not interoperate.

> **Beta.** `1.0.0-beta.1` under the `beta` tag; the API moves without notice.

## Usage

The engine is constructed headless and attached to a container. Nothing happens until
`init`.

```ts
import { OrbitEngine } from '@layera-labs/core';

const engine = new OrbitEngine({ width: 1080, height: 1080, background: '#ffffff' });
engine.init(document.getElementById('canvas')!);

const id = engine.addLayer({
  type: 'text',
  name: 'Headline',
  x: 80, y: 120, width: 600, height: 96,
  rotation: 0, scaleX: 1, scaleY: 1,
  opacity: 1, visible: true, locked: false,
  blendMode: 'normal', effects: [],
  content: {
    type: 'text',
    text: 'Orbit',
    fontFamily: 'Inter', fontSize: 64, fontWeight: 700,
    color: '#111111', alignment: 'left',
  },
});

engine.selectLayer(id);
engine.history.undo();

engine.destroy();   // removes the canvas, observers and listeners
```

`addLayer` takes a full `Layer` minus its `id`, so the shape above is not verbose by
accident — every field is required by `Layer` in `@layera-labs/shared`, which is where
all the v1 types live.

**Call `destroy()`.** The engine installs a `ResizeObserver` and DOM listeners on the
container; dropping the reference without destroying leaks both.

## What it carries

`SceneGraph` (layers, background, canvas border), `ViewportController` (zoom and pan),
`CommandHistory` (an explicit `Command` stack rather than state snapshots),
`FabricRenderer` behind a `Renderer` interface, `DrawController` and `VectorDrawTool`
with a `PathEditor`, `CollaborationManager` (Yjs-based), `AudioManager` and
`AudioMixer`, `TransitionEngine`, and the `video-export` helpers.

`Renderer` being an interface is the useful part of the design: `FabricRenderer` is
the only implementation shipped, but the engine does not name Fabric anywhere else.

## Browser only

Fabric.js needs a DOM. There is no server-side or headless entry point here. For
server-side video rendering, see
[`@layera-labs/video`](https://github.com/Layera-Labs/orbit/tree/main/packages/video#readme),
which is version-independent — it is used by both lines and by neither's UI.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/getting-started.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/getting-started.md)
- [docs/guide/layers.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/layers.md)

Some pages under `docs/guide/` predate the publishing work and describe a registry
install and an API key. The repository README is the accurate one.

MIT.
