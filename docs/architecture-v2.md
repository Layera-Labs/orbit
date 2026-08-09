# Orbit v2 — Rebuilt Architecture

A from-scratch rebuild of the Orbit canvas-editor SDK on a **single reactive
document model**, replacing the legacy dual/triple-store + imperative Fabric
renderer that caused the jank. Built green-field **in parallel** with the old
`@layera-labs/core`/`@layera-labs/react` packages so nothing breaks before cutover.

## Why the rebuild

The old editor kept state in three places — a `SceneGraph` (deep-cloned on
every mutation), a Zustand store, and a local `pages[]` in `OrbitEditor` — glued
by a bidirectional bridge, with a 1495-line imperative `FabricRenderer` (and a
400 ms long-press-to-drag hack). The fix is architectural: **one model, derived
declaratively by both the renderer and the UI.**

## Packages (new)

| Package | Role |
|---|---|
| `@layera-labs/model` | Headless **Valtio** document model. `Document → Page → Element` (discriminated union). Mutations, selection, **transactional history** (a whole drag = one undo), `toJSON`/`loadJSON`, `applyAction`, `fromPolotnoJSON`, `migrateSceneGraphToDocument`. No DOM — runs in Node. |
| `@layera-labs/render` | **react-konva** renderer. The canvas is a pure function of the model; each element binds to its own `useSnapshot`, so dragging one element re-renders only that node. Transformer, snapping/smart-guides, zoom-to-cursor, marquee, inline text editing, raster export. `OrbitRenderer` interface is the seam for a future WebGL/web3 renderer. |
| `@layera-labs/providers` | Pluggable provider interfaces — `Template`/`Photo`/`Video`/`Font`/`Background`/`Asset` — plus `ProviderRegistry` and zero-config built-ins (Picsum, preset backgrounds, Google Fonts, demo templates). Also the web3 seams: `StorageProvider`, `PublishTarget`, `AssetRef.uri`. |
| `@layera-labs/editor` | React UI. Thin store bindings (`useStore`/`useEditorState`/`useSelectedElement`), pluggable **SidePanel sections** (Templates/Elements/Text/Photos/Background/Fonts/Layers — provider-backed ones auto-hide), Toolbar, Pages bar, Properties, Export menu. No bridge. |
| `examples/studio` | New demo app exercising the full stack. |

Dependency graph (acyclic): `model → render → editor`; `model → providers → editor`.

## Consuming the SDK

```tsx
import { OrbitEditor, createStore } from '@layera-labs/editor';
import {
  DemoTemplateProvider, PicsumPhotoProvider,
  PresetBackgroundProvider, GoogleFontProvider,
} from '@layera-labs/providers';

const store = createStore({ width: 1080, height: 1080 });

<OrbitEditor
  store={store}
  providers={{
    templates: new MyTemplateProvider(),   // implement TemplateProvider
    photos: new UnsplashPhotoProvider(key), // implement PhotoProvider
    backgrounds: new PresetBackgroundProvider(),
    fonts: new GoogleFontProvider(),
  }}
  sections={[...DEFAULT_SECTIONS, myCustomSection]} // defineSection({...})
/>
```

Headless (e.g. server-side thumbnails): `import { createStore } from '@layera-labs/model'` — mutate and `toJSON()` with no React/DOM.

## Status

**Done & verified (Phases 0–5 core):**
- Smooth canvas core: select / drag (no long-press) / transform / zoom / marquee / smart-guides; single-element re-renders.
- All element types: text (inline edit), image, svg, shape, line, group, (video/audio placeholders).
- Layers (reorder/lock/visibility/group/ungroup), multi-page, properties panel.
- Pluggable providers + sections; templates load via `loadJSON`; photos search.
- Export: PNG / JPG / PDF / JSON (verified in-browser).
- Gradient backgrounds; transactional undo/redo; keyboard shortcuts.
- Migration from legacy SceneGraph; Polotno-template import.
- 14 unit tests (model 10, render 4) green; all packages build.

**Web3 seams (interfaces only, as planned):** `StorageProvider` (HTTP now → IPFS later), `PublishTarget` (callback now → mint later), `AssetRef.uri`. Adding web3 is additive — no model/renderer/UI change.

**Deferred (honest):**
- Live AI generation — `model.applyAction` foundation + action schema are in; the backend wiring (image/video/audio generation) is not.
- Video/audio playback + timeline — render as placeholders; the legacy audio mixer / video-export pipeline still needs re-homing from `@layera-labs/core`.
- Real-time collaboration (Yjs on the Valtio doc).
- WebGL effects (`@layera-labs/effects`) re-attached as Konva filters; true SVG export.

**Cutover:** when the deferred items reach parity, delete `@layera-labs/core` and the
old `@layera-labs/react`, and rename `@layera-labs/editor` → `@layera-labs/react`. The
`migrateSceneGraphToDocument` adapter preserves existing saved designs.
