# Architecture

Orbit is a layered architecture built for performance, extensibility, and white-label flexibility.

## Package Diagram

```
┌─────────────────────────────────────────┐
│           @orbit/react                  │
│    (React wrapper + UI panels)          │
├─────────────────────────────────────────┤
│           @orbit/next                   │
│      (Next.js wrapper)                  │
├─────────────────────────────────────────┤
│           @orbit/core                   │
│  (Canvas engine + renderer + tools)     │
├─────────────────────────────────────────┤
│           @orbit/ui                     │
│     (Themeable UI components)           │
├─────────────────────────────────────────┤
│           @orbit/shared                 │
│      (Types + utilities)                │
├─────────────────────────────────────────┤
│     @orbit/agentic | @orbit/effects     │
│        (AI | WebGL shaders)             │
└─────────────────────────────────────────┘
```

## Core Engine (`@orbit/core`)

The engine is framework-agnostic vanilla TypeScript. It coordinates:

- **SceneGraph** — Hierarchical layer tree with add/remove/update/move
- **CommandHistory** — Full undo/redo with command pattern
- **ViewportController** — Zoom/pan with clamping and event subscriptions
- **FabricRenderer** — Fabric.js v6 canvas renderer (swappable for WebGL)
- **DrawController** — Raster brush/highlighter overlay
- **VectorDrawTool** — Freehand → `fabric.Path` with simplification
- **PathEditor** — Draggable node handles for vector paths
- **AudioManager** — Multi-track playback with sync
- **AudioMixer** — `OfflineAudioContext` mixing for export
- **TransitionEngine** — Time-based opacity/transform overrides
- **CollaborationManager** — Yjs CRDT + WebSocket sync

## React Wrapper (`@orbit/react`)

The React layer provides:

- `OrbitEditor` — Main component with sidebar, canvas, right panel, timeline
- Zustand store with 6 slices (ui, canvas, layer, upload, designs, ai)
- `useEngineBridge` — Auto-syncs engine state → React state
- 12 sidebar panels (Tools, Text, Upload, Assets, Backgrounds, Videos, Shapes, AI, History, Layers, My Designs, Templates)
- Right panel tabs (Properties, Agentic)
- Keyboard shortcuts, toast notifications, drag & drop

## Renderer Abstraction

The renderer interface allows swapping Fabric.js for a WebGL renderer in the future:

```ts
export interface Renderer {
  init(container: HTMLElement, width: number, height: number): void;
  render(scene: SceneGraph): void;
  setViewport(zoom: number, panX: number, panY: number): void;
  // ... video, selection, peer cursors
}
```

## Data Flow

```
User Action → React Component → Engine API → SceneGraph → Renderer → Canvas
                ↓                                              ↑
            Zustand Store ←── useEngineBridge ─── Event Emit ──┘
```

## White-Label Design

- No Orbit logos, watermarks, or branding
- CSS variable theming with 60+ design tokens
- `registerTheme()` API for custom themes
- Inline SVGs (no `lucide-react` dependency)
- Configurable callbacks for all user actions
