> **Archived 2026-06-24** — superseded by [`/ROADMAP.md`](../../ROADMAP.md). Kept for history; status here reflects the legacy v1 stack only.

# Orbit SDK — Implementation Status & Phase Roadmap

> Updated: 2026-04-24
> Current Phase: Phase 2 (Video + Vector + Multi-User) — COMPLETE

---

## Phase 0: Foundation (COMPLETE)

### Delivered
- [x] Turborepo + pnpm monorepo scaffolding
- [x] Vite build pipeline for all packages
- [x] TypeScript 5.4+ strict mode
- [x] 60+ CSS variable design tokens
- [x] `@orbit/shared` — utilities (`cn`, `generateId`), types, constants
- [x] `@orbit/ui` — 14 components (Button, Input, Sidebar, Tooltip, Dialog, Tabs, Toast, etc.)
- [x] Theme manager with dark/light + runtime switching
- [x] CLI scaffolding foundation (`npx @orbit/ui add`)
- [x] React + Next.js demo apps

---

## Phase 1: Image Editor MVP (100% COMPLETE)

### ✅ COMPLETED FEATURES

#### Core Engine (`@orbit/core`)
- [x] Fabric.js v6 canvas engine with scene graph
- [x] Renderer abstraction layer (swappable for future WebGL)
- [x] Command History pattern (undo/redo with full command stack)
- [x] Viewport controller (zoom/pan)
- [x] Layer system: add, remove, update, move, select
- [x] **Group/Ungroup** layers (fully undoable)
- [x] **Duplicate** layers
- [x] **Copy & Paste** (Ctrl+C/V)
- [x] **Bring Forward / Send Backward / Bring to Front / Send to Back** (all undoable)
- [x] **Align Layers** (left, centerH, right, top, centerV, bottom)
- [x] **Distribute Layers** (horizontal, vertical)
- [x] **Flip** horizontal/vertical
- [x] Canvas resize (`resizeCanvas`)
- [x] Canvas clear (`clearCanvas`)
- [x] Real image loading (async with cache)
- [x] Text rendering with inline editing (double-click)
- [x] 7 shape types: rectangle, circle, triangle, star, polygon, line, arrow
- [x] Background rendering (solid + gradient)
- [x] Watermark overlay (text + image, position, opacity)
- [x] Draw tool (brush/highlighter with overlay canvas)
- [x] Crop tool with aspect ratio presets
- [x] Pointer events for zoom/pan (wheel + alt-drag)
- [x] **Snap-to-grid** on drag
- [x] **Smart guides** (snap to object edges/center while dragging)
- [x] Export PNG/JPG/SVG/PDF with quality + scale
- [x] **Export watermark baking** (watermark included in all exports)
- [x] **JPG white background** (fills transparent areas)

#### React Wrapper (`@orbit/react`)
- [x] `OrbitEditor` main component with full layout
- [x] `OrbitSidebar` rail + drawer (12 panels)
- [x] Zustand store (6 slices: ui, canvas, layer, upload, designs, ai)
- [x] `persist` middleware for localStorage (UI state)
- [x] `useEngineBridge` — auto-syncs engine state → Zustand
- [x] `useOrbitEngine`, `useOrbitLayers`, `useOrbitViewport`, `useOrbitHistory`, `useOrbitTool`
- [x] `useOrbitAgentic` hook (5 AI tools)
- [x] Toast notification system
- [x] Keyboard shortcuts component (14 shortcuts)

#### Left Sidebar Panels (12 total)
- [x] **Tools Panel** — Tool selector
- [x] **Text Panel** — Typography presets, font family/size/weight/color, custom text
- [x] **Upload Panel** — Categorized upload (Images/Videos/Audio) with cloud providers
- [x] **Assets Panel** — Unsplash/Pexels search with debounce, drag & drop to canvas
- [x] **Backgrounds Panel** — Solid colors, gradients, patterns
- [x] **Videos Panel** — Pexels video clip search
- [x] **Shapes Panel** — 7 shapes with fill/stroke color pickers
- [x] **AI Panel** — Manual AI tools: Images (Text→Img, Img→Img), Videos (Text→Vid, Img→Vid), Audio (Text→Audio)
- [x] **History Panel** — Visual command history list
- [x] **Layers Panel** — Drag-drop reorder, inline rename, lock/hide toggles
- [x] **My Designs Panel** — Saved designs with localStorage backend
- [x] **Templates Panel** — 18 preset sizes (social/print/screen)

#### Right Panel (2 tabs)
- [x] **Properties Tab** — Context-aware inspector:
  - X/Y/W/H number inputs
  - Rotation slider (-180° to +180°)
  - Opacity slider (0-100%)
  - Skew X/Y sliders (-60° to +60°)
  - Blend mode selector (14 modes)
  - Arrange buttons (forward/backward/front/back)
  - Align buttons (L/CH/R/T/CV/B)
  - Distribute buttons (H/V)
  - Group/Ungroup buttons
  - Flip H/V buttons
  - Text controls (textarea, font size, color picker)
- [x] **Agentic Tab** — Unified AI prompt:
  - Model selector (GPT-4o, Gemini, Flux)
  - Tool grid (Generate, AI Edit, Change Region, Crop & Expand, Change Lighting)
  - Context toggles (Use full canvas / Use selected image)
  - Prompt textarea
  - Generate button
  - Result preview with "Add to Canvas"

#### Top Toolbar
- [x] **New Design** dropdown with 18 presets
- [x] **Tool selector** (Select, Draw, Crop)
- [x] Design name display
- [x] **Save** button
- [x] **Publish** button
- [x] **Export** dropdown (quality: Low/Med/High/Max, scale: 1×/1.5×/2×/3×, PNG/JPG/SVG/PDF)
- [x] **Undo / Redo** buttons
- [x] **Clear** button with confirmation

#### Bottom Bar
- [x] **Grid** toggle (on/off)
- [x] **Grid type** toggle (dots/lines)
- [x] **Snap** toggle
- [x] **Rulers** toggle
- [x] Zoom controls (- / % / +)
- [x] Fit / 100% buttons

#### Canvas
- [x] Dot grid / line grid overlay
- [x] **Ruler overlays** (horizontal + vertical, pixel ticks, zoom-aware)
- [x] Background rendering (solid + gradient)

#### State & Persistence
- [x] Auto-save on every canvas change (5s debounce)
- [x] Design UUID generation
- [x] Design ID in URL (`?design=uuid`)
- [x] localStorage design backend (default)
- [x] Custom `DesignBackend` interface
- [x] Zustand store with 6 slices + `persist` middleware

#### Upload System
- [x] Cloud upload providers: S3 (presigned URL), Cloudinary, Supabase, Custom
- [x] Upload drag & drop
- [x] Categorized assets (Images/Videos/Audios)

#### AI / Agentic (`@orbit/agentic`)
- [x] `OrbitBackendAdapter` with 7 endpoints:
  - `generateImage` → `POST /v1/generate`
  - `inpaint` → `POST /v1/inpaint`
  - `outpaint` → `POST /v1/outpaint`
  - `adjustLighting` → `POST /v1/lighting`
  - `imageToImage` → `POST /v1/image-to-image`
  - `generateVideo` → `POST /v1/generate-video`
  - `generateAudio` → `POST /v1/generate-audio`
- [x] System prompts injected per endpoint
- [x] Model selector (GPT-4o, Gemini Pro, Flux 2 Klein, Flux Inpaint)

#### WebGL Effects (`@orbit/effects`)
- [x] `AdjustmentRenderer` class
- [x] Brightness, Contrast, Saturation, Temperature shaders
- [x] Applied to image layers via `engine.applyAdjustments()`

#### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z / Ctrl/Cmd + Y | Redo |
| Ctrl/Cmd + D | Duplicate selected |
| Ctrl/Cmd + C | Copy selected |
| Ctrl/Cmd + V | Paste |
| Delete / Backspace | Remove selected |
| Ctrl/Cmd + ] | Bring forward |
| Ctrl/Cmd + Shift + ] | Bring to front |
| Ctrl/Cmd + [ | Send backward |
| Ctrl/Cmd + Shift + [ | Send to back |
| Ctrl/Cmd + G | Group selected |
| Ctrl/Cmd + Shift + G | Ungroup selected |
| V | Select tool |
| B | Brush tool |
| T | Text tool |
| R | Shape tool |

#### Extra Features (Not in Original Plan)
- [x] **Copy & Paste** (clipboard in engine)
- [x] **Duplicate** layer (Ctrl+D)
- [x] **Group/Ungroup** (Ctrl+G)
- [x] **Align & Distribute**
- [x] **Flip H/V**
- [x] **Lock/Hide/Rename** layers
- [x] **Templates preset gallery** (18 sizes)
- [x] **Export quality + scale UI**
- [x] **Grid + snap-to-grid**
- [x] **Rulers**
- [x] **Clear canvas**
- [x] **Drag & drop assets to canvas** (at drop position)
- [x] **Engine bridge hook** (auto-sync)
- [x] **Smart guides** (snap to object edges/center while dragging)
- [x] **SVG export** (with proper Blob generation)
- [x] **PDF export** (via jspdf)
- [x] **JPG white background** (fills transparent areas on export)
- [x] **Skew transform** (skewX/skewY sliders in Properties panel)
- [x] **OrbitSlider** — Replaced all 10 native `<input type="range">` across Properties, AI, Adjustments, Text, Draw panels
- [x] **OrbitDialog** — Replaced `window.confirm()` in Toolbar (Clear canvas confirmation)
- [x] **OrbitLoading** — Replaced all "Loading..." text with spinner/dots variants
- [x] **OrbitDropdown** — Replaced all 5 native `<select>` across Properties, Text, Agentic, AI, My Designs panels
- [x] **`registerTheme()` API** — Already existed in ThemeManager, confirmed functional

---

### ✅ RECENTLY COMPLETED (Phase 1)

| Feature | Date Completed | Notes |
|---------|---------------|-------|
| **Export watermark baking** | 2026-04-23 | Watermark now positioned relative to design canvas dimensions; included in PNG/JPG/SVG exports |
| **JPG white background** | 2026-04-23 | Transparent areas filled with white during JPG export |
| **SVG export** | 2026-04-23 | Added to export dropdown; proper Blob generation |
| **PDF export** | 2026-04-23 | Added to export dropdown; uses jspdf |
| **Multi-select engine support** | 2026-04-23 | Already supported via `selectLayer(string[])` + `ActiveSelection`; bulk ops work |
| **Smart guides** | 2026-04-23 | Snap to object edges/center with blue guide lines during drag |
| **Skew transform** | 2026-04-23 | Skew X/Y sliders (-60° to +60°) in Properties panel; synced to Fabric.js renderer |
| **Video export (GIF/MP4/PNG-sequence)** | 2026-04-23 | Client-side GIF (5s/15fps), MP4/PNG-sequence via backend FFmpeg; `VideoExportModal` with trim/resolution/fps controls |
| **Audio tracks** | 2026-04-23 | `AudioManager` with multi-track mixing, trim, volume, mute, loop; auto-syncs with video playback; `audio` layer type |
| **Transitions** | 2026-04-23 | 8 transition types (fade, slide 4 directions, zoom in/out) with 4 easing curves; in/out per video/audio layer; applied during playback + export |
| **Pressure sensitivity** | 2026-04-23 | Apple Pencil/stylus support via PointerEvents; pressure varies strokeWidth in real-time for raster brush; pressure influences vector path simplification + strokeWidth |
| **Performance audit** | 2026-04-24 | Memory leaks fixed; React.memo on heavy components; sourcemaps excluded from npm publish (~75% size reduction); `sideEffects: false` on all packages; bundle analysis documented |
| **SDK v2.0 API stabilization** | 2026-04-24 | Internal commands removed from public API; stale types synced; `OrbitEditorProps` exported; `SYSTEM_PROMPTS` internalized; `TransitionEngine` + `TransitionState` added to public API |

### Deferred / Future Features

These were considered out of scope for the initial MVP and can be added in future iterations:

#### Medium Impact
| Feature | Notes |
|---------|-------|
| **Icons panel** (SVG library search) | No icon provider implemented |
| **Stickers panel** (graphics/illustrations) | No sticker provider implemented |
| **OrbitContextMenu** (right-click on canvas) | Would need custom context menu component |
| **Main Menu toolbar** (File, Edit, View, Insert, Format, Help) | Plan says configurable but not wired up |
| **Annotate AI tool** (draw annotations + prompt) | Could reuse draw tool, not wired to AI |
| **3D lighting orb widget** | Complex UI, simplified to basic lighting adapter |

#### Low Impact
| Feature | Notes |
|---------|-------|
| **Size panel** (dedicated canvas resize UI) | Exists in Templates + New dropdown |
| **OrbitColorPicker** component | Using native `<input type="color">` |
| **OrbitResizable** (drag-to-resize panels) | Panels have fixed widths |
| **`@dnd-kit/core`** | Using native HTML5 drag & drop |
| **`lucide-react`** icons | Using inline SVGs |
| **`setLayerEffect()`** API | Effects array exists but no runtime effect system |
| **Share button** | No sharing backend |
| **Settings** | No settings panel |

---

## Phase 2: Video + Vector + Multi-User (100% COMPLETE)

### Planned Features
| Feature | Status | Notes |
|---------|--------|-------|
| Video engine | ✅ Implemented | HTML5 video rendering via Fabric.Image, playback loop, video cache |
| Timeline component | ✅ Implemented | Play/pause all, seek scrubber, time display, video layer indicators |
| Video layer controls | ✅ Implemented | Play/pause, mute, volume, seek in Properties panel |
| Audio tracks | ✅ Implemented | `AudioManager` with multi-track mixing, trim, volume, mute, loop; auto-syncs with video playback; `audio` layer type with `AudioContent`; Timeline audio track indicators |
| Transitions | ✅ Implemented | 8 types (fade, slide 4 directions, zoom in/out) with 4 easing curves; in/out per layer; applied during playback + export frame capture |
| Video export (GIF/MP4/PNG-sequence) | ✅ Implemented | Client-side GIF (5s/15fps cap), MP4/PNG-sequence via backend FFmpeg; `VideoExportModal` with trim/resolution/fps controls; `VideoFrameCapture` + `PreviewRecorder` + `ExportJobPoller` |
| Audio export (WAV) | ✅ Implemented | `AudioMixer` using Web Audio API `OfflineAudioContext`; fetches, decodes, trims, loops, and mixes all audio layers client-side; outputs WAV Blob; export button in Timeline |
| Vector draw tool (Bézier) | ✅ Implemented | Freehand → `fabric.Path` with distance-based simplification; stroke/color/opacity/simplify controls |
| Node editing | ✅ Implemented | Draggable node handles on path; `modified` event updates pathData; add/remove node support; 'E' keyboard shortcut; "Edit Nodes" button in Properties panel |
| Pressure sensitivity | ✅ Implemented | `PointerEvent.pressure` varies strokeWidth in real-time; stylus auto-detected via `pointerType`; vector path simplification + strokeWidth adjusted by pressure; toggle in DrawOptionsPanel |
| Multi-user sync (WebSockets + Yjs) | ✅ Implemented | Yjs `Y.Doc` CRDT sync via WebSocket; auto-reconnect; heartbeat |
| Cursor presence | ✅ Implemented | Mouse position tracking; colored cursor dots with name labels; 30s stale cleanup |
| Performance audit | ✅ Implemented | Memory leaks fixed (engine.destroy → audioManager + transitions); React.memo on PropertiesPanel/Timeline/VideoExportModal; sourcemaps excluded from npm publish (~75% size reduction); bundle analysis documented |
| SDK v2.0 | ✅ Implemented | Internal commands removed from public API; `sideEffects: false` on all packages for tree-shaking; `OrbitEditorProps` exported; stale `EngineConfig`/`ToolType` types synced; `SYSTEM_PROMPTS` removed from public agentic API; `TransitionEngine` + `TransitionState` exported |

### Deferred to Future Phase
| Feature | Status | Notes |
|---------|--------|-------|
| Custom theme marketplace | ❌ Not started | `registerTheme()` works; marketplace UI deferred |

---

## Testing & Documentation (COMPLETE)

| Item | Status | Notes |
|------|--------|-------|
| Vitest unit tests | ✅ Complete | **203 tests**, 17 test files, 100% passing |
| VitePress documentation | ✅ Complete | 11 docs pages, VitePress 1.6.3, builds successfully |
| React Testing Library | ❌ Not started | Could add for React component testing |
| Playwright E2E tests | ❌ Not started | Could add for full user flow testing |
| API reference (typedoc) | ❌ Not started | Could auto-generate from TS declarations |
| Component storybook | ❌ Not started | Could add for UI component isolation |

---

## Package Summary

| Package | Status | Lines of Code (est.) |
|---------|--------|---------------------|
| `@orbit/shared` | ✅ Stable | ~1,500 |
| `@orbit/core` | ✅ Stable | ~3,500 |
| `@orbit/ui` | ✅ Stable | ~2,000 |
| `@orbit/react` | ✅ Stable | ~5,000 |
| `@orbit/next` | ✅ Stable | ~200 |
| `@orbit/agentic` | ✅ Stable | ~400 |
| `@orbit/effects` | ✅ Stable | ~300 |
| `@orbit/assets` | ✅ Stable | ~400 |
| `examples/demo` | ✅ Stable | ~100 |
| `examples/demo-next` | ✅ Stable | ~100 |

**Total:** ~13,500 lines of TypeScript

---

## Current Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Foundation | ✅ 100% Complete | Monorepo, build pipeline, UI components, themes |
| Phase 1: Image Editor MVP | ✅ 100% Complete | All core features + extras (groups, align, smart guides, export, AI, etc.) |
| Phase 2: Video + Vector + Multi-User | ✅ 100% Complete | Video engine, audio tracks, transitions, vector tools, collaboration |
| Testing | ✅ Complete | 203 unit tests, 17 test files, coverage reporting configured |
| Documentation | ✅ Complete | VitePress docs site with 11 pages |
| Build | ✅ Passing | All 10 packages build successfully |
| Demos | ✅ Ready | Both `examples/demo` (Vite/React) and `examples/demo-next` (Next.js) build and run |

---

## Running the Demos

### React Demo (Vite)
```bash
cd examples/demo
pnpm dev
# Opens at http://localhost:5173
```

### Next.js Demo
```bash
cd examples/demo-next
pnpm dev
# Opens at http://localhost:3000
```

---

## Phase 3: Vector Drawing Board + Apps (QR Code)

> **Status:** Planned  
> **Goal:** Reusable vector asset creation + mini app utilities sidebar

---

### 3.1 Vector Drawing Board

**Overview:** A dedicated "Vectors" sidebar panel where users create, edit, and manage reusable vector boards in a modal editor. Boards are persisted via the same `DesignBackend` interface and can be dragged/placed onto the main artboard as `fabric.Group` layers.

**UI (matching screenshots):**

| Screen | Elements |
|--------|----------|
| **Vectors Panel** | Thumbnail list of boards, name + subtitle ("Click to edit · drag preview to place"), trash icon per board, "+ New vector board" CTA |
| **Board Editor Modal** | Title ("Vector board N"), close X, left Layers sidebar, top toolbar (Select, Pen, Line, Rect, Circle, stroke width, Clear layer, Clear all, Save dropdown), gridded canvas, bottom zoom bar (- / 1:1 / Fit / + / 100%) |

**Core Components:**
- `VectorBoardsPanel.tsx` — Sidebar rail panel (list + create/delete)
- `VectorBoardEditor.tsx` — Fullscreen modal overlay with internal mini-canvas
- `VectorBoardLayers.tsx` — Left layer list inside the modal (eye, name, expand, reorder, delete, add)
- `vectorBoardsSlice.ts` — Zustand slice for CRUD + localStorage persistence

**Engine reuse:**
- Leverages existing `VectorDrawTool` and `PathEditor` from Phase 2 for drawing + node editing
- Uses a secondary small `OrbitEngine` instance (or direct Fabric.js canvas) scoped to the modal
- Each board saved as `VectorBoard` type with `layers: VectorBoardLayer[]`

**Placement flow:**
1. User drags board thumbnail to main canvas → creates `fabric.Group` containing all board paths
2. Or clicks board in list → "Add to canvas" button
3. Board placed as a standard layer, fully selectable/transformable

**Data model:**
```ts
interface VectorBoard {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: VectorBoardLayer[];
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

interface VectorBoardLayer {
  id: string;
  name: string;
  visible: boolean;
  paths: Array<{
    type: 'path' | 'rect' | 'circle' | 'line';
    data: string | object;
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
  }>;
}
```

---

### 3.2 Apps Panel — QR Code Generator

**Overview:** New "Apps" sidebar panel housing embeddable utilities. First app: URL → QR code image layer.

**UI (matching screenshots):**

| Screen | Elements |
|--------|----------|
| **Apps List** | "QR code" row with icon + description ("Encode a URL and place it on the artboard.") |
| **QR Detail View** | Back arrow, "QR code" title, close X, URL input, "Customize" accordion (color, bg, margin, error correction), live preview canvas, "Add to canvas" button (disabled until valid URL) |

**Core Components:**
- `AppsPanel.tsx` — Sidebar rail panel (app directory)
- `QRCodeApp.tsx` — Sub-panel with form + live preview
- `appsSlice.ts` — Zustand slice for form state (non-persisted)

**Dependency:** `qrcode` npm package (canvas-based, client-side generation)

**Flow:**
1. User enters URL → `qrcode.toDataURL()` generates live preview
2. Customize accordion expands to show: foreground color, background color, margin, error correction level (L/M/Q/H)
3. "Add to canvas" → generates final PNG data URL → `createImageLayer()` → adds to main canvas

---

### 3.3 Integration Changes

**`OrbitEditor.tsx`:**
- Add `vectors` and `apps` to `PANEL_REGISTRY`
- Import and render `VectorBoardsPanel`, `AppsPanel`
- Add `VectorBoardEditor` modal trigger controlled by Zustand
- Provide `onAddVectorBoard` callback to place boards on main canvas

**Store (`packages/react/src/store/index.ts`):**
- Add `VectorBoardsSlice` (persisted)
- Add `AppsSlice` (non-persisted)
- Update `partialize` to include `vectorBoards`

**Icons needed (inline SVG):**
- `vectors`: Pen/path icon
- `apps`: 2×2 grid icon

---

### 3.4 Deferred / Future Apps
- Barcode generator
- Lorem ipsum text generator
- Color palette extractor
- Chart/graph generator

---

## Current Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Foundation | ✅ 100% Complete | Monorepo, build pipeline, UI components, themes |
| Phase 1: Image Editor MVP | ✅ 100% Complete | All core features + extras (groups, align, smart guides, export, AI, etc.) |
| Phase 2: Video + Vector + Multi-User | ✅ 100% Complete | Video engine, audio tracks, transitions, vector tools, collaboration |
| Phase 3: Vector Board + Apps | 📋 Planned | Vector drawing board modal + QR code app |
| Testing | ✅ Complete | 203 unit tests, 17 test files, coverage reporting configured |
| Documentation | ✅ Complete | VitePress docs site with 11 pages |
| Build | ✅ Passing | All 10 packages build successfully |
| Demos | ✅ Ready | Both `examples/demo` (Vite/React) and `examples/demo-next` (Next.js) build and run |

---

*Document Version: 1.2*
*Last Updated: 2026-04-27*
