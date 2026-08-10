# @layera-labs/orbit-react

The React editor for the **v1** Orbit SDK: an `OrbitEditor` component wrapping
`@layera-labs/orbit-core`'s engine, plus hooks for driving that engine yourself.

```bash
npm i @layera-labs/orbit-react@beta
```

> ### The name is misleading, and it is worth two sentences
>
> **This is v1, and v1 is legacy** — maintained, not developed. `@layera-labs/orbit-react` is
> the name a newcomer reaches for first, and it is the *older* editor. The current
> line is v2: `@layera-labs/orbit-model` → `@layera-labs/orbit-render` → `@layera-labs/orbit-providers` →
> [`@layera-labs/orbit-editor`](https://github.com/Layera-Labs/orbit/tree/main/packages/editor#readme).
> Both export a component called `OrbitEditor`; they share no code and do not
> interoperate. If you are starting something new, install `@layera-labs/orbit-editor`.

> **Beta.** `1.0.0-beta.3` under the `beta` tag; the API moves without notice.
>
> **React 18 only.** `react` and `react-dom` are peers at `^18.0.0`.

## Mount it

```tsx
import { OrbitEditor } from '@layera-labs/orbit-react';

export default function Page() {
  return (
    <OrbitEditor
      theme="dark"
      providers={{ photos: myPhotoProvider }}
      callbacks={{
        onExport: (blob, format) => download(blob, format),
        onError: (err) => console.error(err),
      }}
    />
  );
}
```

There is no stylesheet to import. This package emits no CSS — a `./styles.css` export
was promised here for a long time and pointed at a file the build has never produced,
so following the docs got you `ERR_MODULE_NOT_FOUND`. It was removed rather than
stubbed, on the grounds that an empty stylesheet is a worse lie than an absent one.
Styling comes from `@layera-labs/orbit-ui` and its theme variables.

`apiKey` and `backendUrl` are still on `OrbitEditorProps` for source compatibility and
the editor **does not read either**. They existed only so it could build a backend
client of its own; credentials now belong to whoever builds the backend it is handed.

## Backends are injected, and there are two of them

Nothing in this package talks to a server on its own. Two optional props decide what
it can do:

```tsx
<OrbitEditor exportBackend={myExportBackend} aiBackend={myAiBackend} />
```

- **`exportBackend`** — where MP4 and PNG-sequence renders are sent. This is *core
  editing*, not AI: it is what the transitions and filters the editor already applied
  get written into. Omit it and export still works in the browser, as GIF.
- **`aiBackend`** — the AI layer, entirely opt-in. Omit it and the editor has **no AI
  at all**: the canvas AI button and the agentic drawer are not rendered, rather than
  rendered and unable to answer a click.

Both are plain interfaces (`ExportBackend`, `AiBackend`, exported from here). You can
implement them against anything.

## The AI package is an optional peer

`@layera-labs/orbit-agentic` is declared as an optional `peerDependency`, and the hook that
needs it lives behind a subpath so the main entry never names it:

```ts
import { useOrbitAgentic } from '@layera-labs/orbit-react/agentic';

const { generate, runCanvasAgent, results, isGenerating, error } = useOrbitAgentic({
  engine,           // OrbitEngine | null
  backend,          // AiBackend — REQUIRED here, unlike on OrbitEditor
});
```

`backend` is required on this hook on purpose. An optional backend would mean every
call returning `null` for a reason the caller cannot see, and a UI wired to it showing
buttons that do nothing. A host with no AI layer does not call this hook.

`ai-optional.test.ts` walks the main entry's import graph and asserts it names
`@layera-labs/orbit-agentic` in **no import form at all** — not at runtime and not in types
either, since the canvas-agent shapes it needs (`CanvasAgentParams`,
`CanvasAgentResponse`) were moved into `@layera-labs/orbit-shared` for exactly this reason.
A type-only import erases from the bundle but not from the emitted `.d.ts`, so
anchoring them in the AI package left this package's declarations referring to a module
a consumer who declined the AI layer cannot resolve.

What that test proves is the source graph and the manifest. It is not an install
check — nothing here has run `npm install --omit=optional` against a registry, because
there is not one yet.

## Headless

`@layera-labs/orbit-react/headless` re-exports the hooks with no components attached:
`useOrbitEngine`, `useOrbitLayers`, `useOrbitViewport`, `useOrbitHistory`,
`useOrbitTool` and `useEngineBridge`. Use it to build your own UI on the v1 engine.
(The same hooks are on the main entry as well.)

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/getting-started.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/getting-started.md)
- [docs/guide/ai-tools.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/ai-tools.md)

MIT.
