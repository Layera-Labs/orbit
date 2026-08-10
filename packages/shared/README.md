# @layera-labs/orbit-shared

The type vocabulary and small utilities that the **v1** Orbit packages agree on:
`Layer`, `SceneGraph`, `OrbitConfig`, the export and AI request/response shapes, plus
`cn`, id generation, colour and number helpers, and a table of constants.

Almost nobody installs this on purpose. It arrives as a dependency of
`@layera-labs/orbit-core`, `@layera-labs/orbit-react`, `@layera-labs/orbit-ui`, `@layera-labs/orbit-effects` and
`@layera-labs/orbit-agentic`. Install it directly when you are writing something that has to
name those types — your own `AiBackend`, your own asset provider, your own panel.

```bash
npm i @layera-labs/orbit-shared@beta
```

> **Beta.** `1.0.0-beta.3` under the `beta` tag; the API moves without notice.
>
> **v1 line, which is legacy.** The v2 stack has its own document types in
> [`@layera-labs/orbit-model`](https://github.com/Layera-Labs/orbit/tree/main/packages/model#readme)
> and does not use this package. `Layer` here and `Element` there are different
> models of the same idea; there is no conversion helper in this direction
> (`migrateSceneGraphToDocument` in `@layera-labs/orbit-model` goes the other way).

## Why the AI types live here and not in the AI package

This is the one non-obvious thing in the package, and it is load-bearing.

`AgenticCanvasAction`, `CanvasAgentParams` and `CanvasAgentResponse` are declared here
rather than in `@layera-labs/orbit-agentic`, alongside `GenerateParams` and `ExportJob`.
The reason: `@layera-labs/orbit-react` has to **name** them — `AiBackend.runCanvasAgent` is
part of `OrbitEditorProps` — while `@layera-labs/orbit-agentic` is an *optional* peer of that
package.

A type-only import erases from the bundle but not from the emitted `.d.ts`. So
anchoring these shapes in the AI package left `@layera-labs/orbit-react`'s declarations
referring to a module that a consumer who declined the AI layer cannot resolve: a
clean runtime install with a broken `tsc`. Both packages depend on this one
unconditionally, so this is the only place both can point at.

Every member is expressed in terms this package already owns (`ShapeContent`,
`BlendMode`, `SceneGraph`), which is what makes it a relocation rather than a
duplication.

## Utilities

```ts
import { cn, generateId, clamp, downloadBlob, hexToRgba } from '@layera-labs/orbit-shared';

cn('px-2', isActive && 'bg-orbit-accent');   // clsx + tailwind-merge
```

`cn` is the class merger every `@layera-labs/orbit-ui` component uses. The rest are grouped
as `utils/{cn,id,numbers,performance,files,colors}` and all re-exported flat:
`generateId` / `generateLayerId` / `generateAssetId`; `clamp`, `lerp`, `mapRange`,
`roundTo`, `toDegrees`, `toRadians`; `debounce`, `throttle`, `rafThrottle`;
`downloadBlob`, `dataUrlToBlob`, `blobToDataUrl`, `fileToDataUrl`; `hexToRgba`,
`rgbaToHex`, `interpolateColor`, `isValidHex`, `getContrastColor`.

Several of these touch the DOM (`downloadBlob`, `fileToDataUrl`, `rafThrottle`), so
the package is not safe to import wholesale on a server.

## Constants

`SOCIAL_PRESETS`, `ASPECT_RATIOS`, `KEYBOARD_SHORTCUTS`, `BLEND_MODES`,
`EXPORT_QUALITY`, `EXPORT_SCALE`, `DEFAULT_FEATURE_FLAGS`, `TOOL_CONFIG`,
`AI_MODELS`, and canvas/zoom defaults.

`ORBIT_VERSION` is also exported, and as of `1.0.0-beta.3` it is **generated from this
package's `package.json`** at the front of the build rather than typed by hand. It had
been typed by hand, and it said `"0.0.1"` in a package published at `1.0.0-beta.3` —
two orders of release out of date, because a constant kept in step with a manifest by
remembering to is not a constant. A test fails the suite if the generated copy falls
behind the manifest, so the two cannot disagree again.

`ORBIT_BACKEND_URL` has been **removed**. It defaulted to `https://api.orbit.ai`, a host
nobody operates, and nothing in the SDK ever read it — so its only effect was to imply
that a hosted Layera backend exists and that this is its address. A default aimed at a
dead host is worse than none: it converts "you have not configured a backend" into a
connection error thrown from inside a `fetch`, at request time, naming a domain the
caller has never heard of. There is no Layera-operated backend. The URL of yours is now
a required argument to `@layera-labs/orbit-agentic`'s `OrbitBackendAdapter`, which throws at
construction if it is missing.

`API_ENDPOINTS` stays, because it is not an address: it is the set of route shapes
(`/v1/generate`, `/v1/inpaint`, …) that adapter posts to, relative to whatever base URL
you give it — which is to say, what you implement if you are writing the service.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/configuration.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/configuration.md)

MIT.
