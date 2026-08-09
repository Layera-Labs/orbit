# @layera-labs/agentic

The **optional** AI layer for the v1 Orbit SDK: an HTTP client implementing image,
video and audio generation, inpaint/outpaint, relighting, and a canvas agent that
returns edits as declarative actions.

```bash
npm i @layera-labs/agentic@beta
```

## If you only want an editor, you can stop reading

This package is not required to edit anything. `@layera-labs/agentic` is declared as an
**optional `peerDependency`** of `@layera-labs/react`, and omitting it costs you
nothing but the AI features:

- The editor's main entry never names this package. `ai-optional.test.ts` in
  `@layera-labs/react` walks its import graph and asserts that — in **no import form at
  all**, not at runtime and not in types, which is why the canvas-agent shapes live in
  `@layera-labs/shared` instead.
- The hook that does need it sits behind a subpath, `@layera-labs/react/agentic`.
- Omit `aiBackend` on `<OrbitEditor>` and the AI button and agentic drawer are **not
  rendered**, rather than rendered and unable to answer a click.

Editing, exporting and the whole v2 stack (`@layera-labs/editor` and friends) work with
this package absent from the tree entirely.

> **Beta.** `1.0.0-beta.2` under the `beta` tag; the API moves without notice.
>
> **v1 line, which is legacy.** There is no v2 equivalent yet; the v2 editor has no AI
> layer at all.

## What it actually is

Two interfaces and one class that implements both.

```ts
import { OrbitBackendAdapter } from '@layera-labs/agentic';

const backend = new OrbitBackendAdapter(apiKey, 'https://your-service.example.com');

const asset = await backend.generateImage({ prompt: 'a paper crane on slate' });

const { actions, message } = await backend.runCanvasAgent({
  prompt: 'make the headline warmer and move it up',
  scene: engine.scene.getState(),
  selectedLayerIds: ['layer-1'],
});
```

`runCanvasAgent` is the interesting one: it returns `AgenticCanvasAction[]` — a closed
set of `addText`, `updateText`, `addImage`, `addVideo`, `addShape`,
`addBackgroundLayer`, `updateLayerStyle`, `moveResizeLayer`, `deleteLayer` — not prose
and not code. The host applies them. An agent that can only emit actions from a fixed
list cannot do something the editor has no way to undo.

## You have to run the backend

`OrbitBackendAdapter` is an HTTP client and nothing more. It posts to endpoints that
you host; there is no Layera-operated service behind a default URL, and the
`ORBIT_BACKEND_URL` constant in `@layera-labs/shared` points at a host that is not
running. The render service in this repository (`services/render`) implements the
generation endpoints, or you can implement `AiBackend` yourself against any provider —
the interface is the contract, not this class.

The API key is passed to the constructor and travels in the client. Do not put a
provider key there; put your own service's token, and let the service hold the
provider credentials.

## `ExportBackend` is here by accident, and is on its way out

This package also exports an `ExportBackend` interface and `OrbitBackendAdapter`
implements it. That is history, not design: one HTTP client happened to grow both
halves, which is what made the AI package reachable from plain editing in the first
place.

Export is core editing — it is what the transitions and filters an editor already
applied get written into — and `@layera-labs/react` now declares its own
`ExportBackend` and takes one injected. Prefer the copy in `@layera-labs/react`. The
`AIBackendAdapter` type (`AiBackend & ExportBackend`) is kept only so existing code
compiles; it is the thing being dismantled, not the target.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/ai-tools.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/ai-tools.md)
- [docs/guide/ai-go-live.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/ai-go-live.md)

MIT.
