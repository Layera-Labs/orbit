> **Archived 2026-06-24** — superseded by [`/ROADMAP.md`](../../ROADMAP.md). Kept for history.

# Project Status

Last checked: 2026-04-30

## Review Scope

Reviewed all 23 Markdown files in the repository, including `plan.md`, `phases.plan.md`, `PERFORMANCE_AUDIT.md`, the UI polish plan, `AGENTS.md`, `README.md`, and all docs under `docs/`. I also spot-checked the source tree for roadmap items and ran the shared Vitest suite.

## Current Summary

Orbit is a pnpm/Turbo TypeScript monorepo for an agentic canvas editor SDK. The current roadmap in `phases.plan.md` marks Phase 0, Phase 1, and Phase 2 complete. Source inspection largely supports that: the repo contains the core canvas engine, React/Next wrappers, shared types, UI components, asset/effects/agentic packages, demo apps, docs, video/audio/vector/collaboration modules, and tests.

`plan.md` still ends with "Implementation In Progress"; treat that as an older planning document. `phases.plan.md` is the more current status source.

## Done

- Foundation: pnpm workspace, Turbo tasks, strict TypeScript, Vite build setup, packages under `packages/*`, and demos under `apps/*`.
- Core editor: Fabric renderer, scene graph, command history, viewport, layer operations, grouping, duplication, alignment, distribution, flip, draw/crop tools, grid/snap, smart guides, watermarks, and PNG/JPG/SVG/PDF export.
- React editor: floating left rail/drawer, toolbar, bottom bar, timeline, rulers, localStorage design backend, autosave support, upload/assets/backgrounds/videos/shapes/history/layers/templates/my-designs panels.
- Agentic workflow: floating AI button/right drawer, `canvas-agent` workflow, structured `AgenticCanvasAction` types, action executor, fallback prompt actions, and image-generation/edit workflows.
- Media Phase 2: video layers/playback, timeline controls, video export helpers, audio tracks, WAV mixing/export, transitions, vector draw tool, node editing, pressure sensitivity, Yjs collaboration, and cursor presence.
- UI package: buttons, inputs, sidebar, tooltip, dialog, dropdown, slider, color picker, loading, tabs, accordion, context menu, toast, and resizable components are exported.
- Documentation: 17 files under `docs/`, covering install, getting started, configuration, architecture, layers, export, audio, video, transitions, collaboration, and API references.
- Tests: `pnpm exec vitest run --config vitest.config.ts --passWithNoTests` passed: 19 files, 212 tests.

## Left / Not Started

- Phase 3 is not implemented: no `VectorBoardsPanel`, `VectorBoardEditor`, `VectorBoardLayers`, `vectorBoardsSlice`, `AppsPanel`, `QRCodeApp`, or `appsSlice` source files were found.
- QR code app is not wired: no direct `qrcode` dependency appears in root/package manifests.
- Testing gaps from the roadmap remain: React Testing Library, Playwright E2E tests, Typedoc API reference generation, and Storybook are not present.
- Product gaps remain from deferred lists: theme marketplace, icons panel, stickers panel, main menu, annotate AI tool, 3D lighting widget, share backend, settings panel, and runtime `setLayerEffect()` behavior.
- Performance follow-ups remain: make Yjs optional or dynamically loaded, memoize heavier panel/layer rows, virtualize `LayersPanel`, add CDN preconnects, add video-cache eviction, and reassess PDF dependency weight.
- UI polish is partially integrated: `CanvasToolbar`, centered layer helpers, editable background layers, and Agentic drawer are in place, but `ContextToolbar` exists without being rendered from `OrbitEditor`.
- `README.md` is still only a placeholder heading and should be expanded or point to `docs/`.

## Documentation Drift

- `phases.plan.md` says 17 test files and 203 tests, but current verification found 19 test files and 212 passing tests.
- The roadmap says 11 docs pages; the `docs/` directory currently has 17 Markdown files.
- Some deferred UI items are stale: `OrbitColorPicker`, `OrbitContextMenu`, and `OrbitResizable` now exist in `@orbit/ui`, though context menu/resizable are not clearly integrated into the editor surface.
- The left-sidebar AI panel listed in the older Phase 1 status has been replaced by the floating Agentic AI button and right drawer.

## Recommended Next Priorities

1. Implement Phase 3: vector board CRUD/editor, persisted store slice, canvas placement, Apps panel, and QR generator.
2. Wire or remove `ContextToolbar`; if the top contextual toolbar is desired, render it and cover text/image/video/shape/background/multi-select states.
3. Add React component tests and one Playwright smoke flow for the editor.
4. Refresh roadmap numbers and expand `README.md` so status, commands, and docs entry points do not conflict.
5. Tackle the high-impact performance items around Yjs loading and large panel rendering.
