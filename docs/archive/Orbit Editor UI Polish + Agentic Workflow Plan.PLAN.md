> **Archived 2026-06-24** — superseded by [`/ROADMAP.md`](../../ROADMAP.md). Kept for history; a (largely implemented) legacy-v1 UI + agentic implementation plan.

# Orbit Editor UI Polish + Agentic Workflow Plan

## Summary
Redesign the Orbit editor around a centered canvas, a polished floating left tool rail, glass-style left drawers, a Canva-like contextual properties toolbar, and a highlighted Agentic AI entry point. Manual mode keeps direct editing fast; Agentic mode opens a right-side AI drawer that can add and update layers from prompts.

## Key Changes

- Keep the artboard centered by default: center on editor load, container resize, new design, canvas resize, and Fit; still allow intentional user pan/zoom while editing.
- Fix editor shell sizing with definite `100dvh` height and `min-h-0` flex containers so Fabric never measures runaway canvas height.
- Add one shared centered-layer helper used by text, images, videos, shapes, uploads, generated assets, and agentic actions.
- Click-to-add behavior centers new layers on the artboard and selects them; drag/drop still uses the drop point.

- Restyle the left UI:
  - Floating rounded rail with subtle shadow, light theme, tactile active states, and clean icon buttons.
  - Left panel becomes a floating glass drawer with rounded corners, blur, inner border, and drop shadow.
  - Same tool click toggles the drawer; close icon always calls `setLeftDrawerOpen(false)`.
  - Drawer width is constrained and becomes overlay-style on narrow screens.

- Replace the manual right properties sidebar with a contextual top toolbar:
  - No selected layer: show compact canvas/design controls only.
  - Text: text value, font size, font family/weight if available, color, opacity, arrange, position/size popover.
  - Image: crop, adjustments, opacity, blend, arrange, position/size.
  - Video/audio: play, seek, volume, trim, transitions via popovers.
  - Shapes/background layers: fill, stroke, opacity, arrange, position/size.
  - Multi-select: group/ungroup, align, distribute, arrange.
  - Move advanced controls into dropdowns/popovers so the toolbar stays compact.

- Treat clicked background presets as editable layers:
  - Add a full-artboard background layer, send it behind content, select it, and expose its properties.
  - Solid backgrounds use shape layers; image/video background assets use centered full-artboard media layers with fit/cover behavior where supported.
  - Keep existing scene background only as the initial empty canvas fallback.

- Add a highlighted Agentic AI button:
  - Use a prominent floating “AI” pill/button near the top-right canvas area.
  - Clicking it switches to Agentic mode and opens the only right sidebar.
  - Manual tools keep the right sidebar closed unless Agentic is active.

- Build Agentic mode around structured layer actions:
  - Add an internal `AgenticCanvasAction` schema and executor for `addText`, `updateText`, `addImage`, `addVideo`, `addShape`, `addBackgroundLayer`, `updateLayerStyle`, `moveResizeLayer`, and `deleteLayer`.
  - Agentic prompt drawer sends prompt + scene snapshot + selected layer ids + optional canvas/selection image context.
  - Backend returns structured actions; frontend executes them through `OrbitEngine` and shared centered-layer helpers.
  - Existing image-generation/edit endpoints remain available when the prompt requires a generated/edited image asset.

## Interfaces
- No new external UI dependencies.
- Add internal editor state for `mode: 'manual' | 'agentic'` and `agenticDrawerOpen`.
- Add reusable internal UI pieces such as `ContextToolbar`, `ToolbarPopover`, and polished sidebar/drawer variants.
- Add `@layera-labs/agentic` action types and adapter method for canvas-agent actions if the package owns backend contracts; otherwise keep the types internal to `@layera-labs/react`.

## Test Plan
- Unit-test centered placement for text, image, video, shape, and background layers.
- Unit-test agentic action executor for add/update layer actions.
- Verify close/toggle behavior for left drawer.
- Verify contextual toolbar renders correct controls for no selection, text, image, video, shape, background, and multi-select.
- Run `pnpm exec vitest run --passWithNoTests`, `pnpm test`, and `pnpm --filter @layera-labs/demo build`.
- Smoke-check desktop and mobile: centered canvas, left glass drawer, close button, centered add actions, toolbar editing, background layer editing, and Agentic prompt action flow.

## Assumptions
- Default visual direction is light theme, soft glass, rounded corners, subtle shadows, and one blue accent.
- Manual mode has no right properties sidebar; the right sidebar is reserved for Agentic AI.
- Background presets should create editable layers, not only mutate scene background.
- Drag/drop remains position-based; click-to-add is center-based.
