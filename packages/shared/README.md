# @layera-labs/shared

The type vocabulary and small utilities that the **v1** Orbit packages agree on:
`Layer`, `SceneGraph`, `OrbitConfig`, the export and AI request/response shapes, plus
`cn`, id generation, colour and number helpers, and a table of constants.

Almost nobody installs this on purpose. It arrives as a dependency of
`@layera-labs/core`, `@layera-labs/react`, `@layera-labs/ui`, `@layera-labs/effects` and
`@layera-labs/agentic`. Install it directly when you are writing something that has to
name those types — your own `AiBackend`, your own asset provider, your own panel.

```bash
npm i @layera-labs/shared@beta
```

> **Beta.** `1.0.0-beta.1` under the `beta` tag; the API moves without notice.
>
> **v1 line, which is legacy.** The v2 stack has its own document types in
> [`@layera-labs/model`](https://github.com/Layera-Labs/orbit/tree/main/packages/model#readme)
> and does not use this package. `Layer` here and `Element` there are different
> models of the same idea; there is no conversion helper in this direction
> (`migrateSceneGraphToDocument` in `@layera-labs/model` goes the other way).

## Why the AI types live here and not in the AI package

This is the one non-obvious thing in the package, and it is load-bearing.

`AgenticCanvasAction`, `CanvasAgentParams` and `CanvasAgentResponse` are declared here
rather than in `@layera-labs/agentic`, alongside `GenerateParams` and `ExportJob`.
The reason: `@layera-labs/react` has to **name** them — `AiBackend.runCanvasAgent` is
part of `OrbitEditorProps` — while `@layera-labs/agentic` is an *optional* peer of that
package.

A type-only import erases from the bundle but not from the emitted `.d.ts`. So
anchoring these shapes in the AI package left `@layera-labs/react`'s declarations
referring to a module that a consumer who declined the AI layer cannot resolve: a
clean runtime install with a broken `tsc`. Both packages depend on this one
unconditionally, so this is the only place both can point at.

Every member is expressed in terms this package already owns (`ShapeContent`,
`BlendMode`, `SceneGraph`), which is what makes it a relocation rather than a
duplication.

## Utilities

```ts
import { cn, generateId, clamp, downloadBlob, hexToRgba } from '@layera-labs/shared';

cn('px-2', isActive && 'bg-orbit-accent');   // clsx + tailwind-merge
```

`cn` is the class merger every `@layera-labs/ui` component uses. The rest are grouped
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

Two of these are stale and you should not read them as configuration:
`ORBIT_VERSION` still says `"0.0.1"` while the package is `1.0.0-beta.1`, and
`ORBIT_BACKEND_URL` / `API_ENDPOINTS` point at a hosted service that is not running.
The v1 editor no longer reads a backend URL from anywhere — backends are injected into
`@layera-labs/react` as objects. These constants survive as defaults nothing consults.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/configuration.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/configuration.md)

MIT.
