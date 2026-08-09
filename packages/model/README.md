# @layera-labs/model

The document model for the Orbit canvas editor: a reactive store holding pages,
elements, selection, viewport and history. Headless — no React, no canvas, no DOM.

This is **v2**, the current line. `@layera-labs/model`, `@layera-labs/render`,
`@layera-labs/providers` and `@layera-labs/editor` are one stack. The older
`@layera-labs/core` / `@layera-labs/react` packages are v1 legacy; see the note at the
bottom before you pick.

```bash
npm i @layera-labs/model@beta
```

> **Beta.** `1.0.0-beta.1` under the `beta` tag; the API moves without notice. The
> package itself has no React dependency, but the stack it belongs to is **React 18
> only** — see [`@layera-labs/render`](https://github.com/Layera-Labs/orbit/tree/main/packages/render#readme)
> for why.

## The store

`createStore()` returns an `OrbitStore` whose `state` is a [Valtio](https://valtio.dev)
proxy. Mutations are ordinary property writes; the renderer and the UI re-read from a
snapshot. Every public method records an undo step.

```ts
import { createStore, snapshot } from '@layera-labs/model';

const store = createStore({ width: 1080, height: 1080 });

const id = store.addElement({
  type: 'text',
  text: 'Orbit',
  x: 80,
  y: 120,
  fontSize: 64,
});

store.updateElement(id, { fill: '#c25b3a' });
store.select([id]);

store.undo();          // back to the black text
store.canRedo;         // true

const doc = store.toJSON();   // a plain Document. A template IS this shape
store.loadJSON(doc);          // replaces the document, resets history and selection
```

### Transactions are how you avoid a hundred undo steps

A drag that fires sixty pointer moves should be one entry in the history, not sixty.
`transaction` coalesces everything inside it into a single undo step:

```ts
store.transaction(() => {
  for (const id of ids) store.updateElement(id, { x: nextX(id), y: nextY(id) });
});
```

### Two ways to observe

```ts
const off = store.subscribe(() => draw(snapshot(store.state)));  // any change
const offSel = store.on('selectionChange', (s) => inspect(s.selection));
```

`subscribe` is the low-level Valtio hook and fires on everything. `on` is the
imperative event API for SDK consumers and names what changed. In React, bind with
Valtio's `useSnapshot(store.state)` rather than either.

## What else it does

Pages (`addPage`, `duplicatePage`, `reorderPages`, `renamePage`, `resizePage`,
`setBackground`), z-order (`bringToFront`, `sendBackward`, `moveElement`), grouping
(`group`, `ungroup` — `getElement` searches into groups), alignment and distribution
(`alignToPage`, `alignSelection`, `distribute`), and `applyAction`, which applies one
or more declarative `CanvasAction`s atomically. `applyAction` is the seam an AI layer
writes through, so an agent's edit is one undoable step like any other.

`fromPolotnoJSON` imports a [Polotno](https://polotno.com) document.
`migrateSceneGraphToDocument` converts a v1 `SceneGraph` from `@layera-labs/shared`.

## What it does not do

It does not render. It does not know what a Konva node is, or what a font file is, or
how to search for a photo. Those are `@layera-labs/render` and
`@layera-labs/providers`. It also has nothing to do with video — the video timeline is
a different document kind entirely, in
[`@layera-labs/video`](https://github.com/Layera-Labs/orbit/tree/main/packages/video#readme),
and merging the two was considered and rejected.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/architecture-v2.md](https://github.com/Layera-Labs/orbit/blob/main/docs/architecture-v2.md) — the v2 spec

MIT.
