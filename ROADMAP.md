# Orbit — Roadmap

> **Canonical roadmap.** Last updated 2026-06-24. Single source of truth for Orbit's status and direction. Supersedes `orbit-sdk-build-plan.md`, `phases.plan.md`, `PROJECT_STATUS.md` (archived under [`docs/archive/`](docs/archive/)) and `plan.md` (retired). [`ARCHITECTURE_V2.md`](ARCHITECTURE_V2.md) remains the v2 technical spec; [`AGENTS.md`](AGENTS.md) remains the contributor guide.

**Orbit** is an embeddable, white-label **design-canvas editor SDK** — Canva/Polotno-style — for image and (later) video. Images and video live on a canvas as **layers**, with a global **timeline** for animation and audio. The product wedge is an **agentic layer** ("describe → generate + edit"): canvas parity with the incumbents is table stakes; the agent is the reason a business chooses Orbit. Primary targets: **React Native (via WebView), Next.js, and React.**

---

## ⚠️ Direction update — 2026-06-25: pivot toward video

Orbit is pivoting from a design-canvas SDK toward a **focused mobile video editor + AI** — trim, text/captions, music, transitions, plus AI/template flows (lyric/shayari, auto-caption reels), growing toward a fuller NLE over time. Built **native-first** (not WebView): `react-native-skia` real-time preview + **server-side FFmpeg export** as the reliable spine. **iOS first**, Android next. Solo build, with Claude as the developer.

**What carries over:** the headless-model + agent-"apply ops" patterns; the headless renderer (becomes the overlay-frame generator); the server FFmpeg pipeline (was Phase E). **Deprioritized (not deleted):** the v2 design-canvas editor (a possible separate "image/poster" product) and the RN WebView bridge/web-host (canvas-only — not the video path).

**Video milestones:**
- **V1 — Engine (in progress):** [`@orbit/video`](packages/video) — headless timeline model + FFmpeg command-builder + render runner. _Verified 2026-06-25:_ the core pipeline (trim → scale/crop to vertical → audio mix → H.264/AAC MP4 at 1080×1920) renders end-to-end. Text-burn (`drawtext`) needs a **freetype/libass-enabled ffmpeg** (production/Docker) or an image-overlay path — a deployment requirement, not a code gap.
- **V2 — Overlays & captions:** rich animated text/sticker overlays rendered as image frames composited over video (reuses the headless renderer).
- **V3 — Native editor (iOS):** RN UI + react-native-skia preview; device-validated on real hardware.
- **V4 — AI wedge:** describe → timeline ops; auto-captions; templated short-form.

The design-canvas roadmap below remains valid for the image product but is **no longer the primary focus.**

---

## 1. What Orbit is — and is NOT (v1 scope lock)

A single JSON document — pages → layers (`image`, `text`, `shape`, `video`, `audio`) with per-layer transform, animation, and timeline position — is the contract the whole product consumes: the UI renders it, the agent mutates it, the render service rasterizes it. Get the schema right and version it from day one; every shortcut taken now becomes a breaking change for paying clients later.

**Orbit is NOT, in v1:**
- ❌ A frame-accurate, multi-track NLE (CapCut-style footage editing) — a different engine entirely.
- ❌ A native mobile render engine — RN gets the editor via an embedded web build, not a Swift/Kotlin port.
- ❌ Real-time multiplayer as a *core selling point* (collaboration exists in v1, but it isn't the wedge).
- ❌ On-device video encoding as the primary export path — server-side ffmpeg is the path of record.

---

## 2. Architecture: the v1 → v2 transition

Orbit currently contains **two editor stacks**. This is deliberate and temporary.

**v1 — shipping, maintenance-only**
- `@orbit/core` — Fabric.js v6 engine, observer-based scene-graph, command-pattern history, viewport controller.
- `@orbit/react` — Zustand store (6 slices) + `useEngineBridge` imperative sync + the full panel/toolbar/timeline UI.
- `@orbit/next` — SSR-safe wrapper (dynamic import, `ssr: false`).
- Feature-complete through image + video + audio + vector + collaboration.

**v2 — the committed future** (see [`ARCHITECTURE_V2.md`](ARCHITECTURE_V2.md))
- `@orbit/model` — headless **Valtio** document model (`Document → Page → Element`), `toJSON`/`loadJSON`, `applyAction`, transactional history (a whole drag = one undo), `migrateSceneGraphToDocument`. Runs in Node, no DOM.
- `@orbit/render` — **react-konva** renderer; the canvas is a pure function of the model (each element binds its own snapshot, so dragging one element re-renders only that node).
- `@orbit/editor` — thin React UI, no bridge (`useStore`/`useSelectedElement`, pluggable SidePanel sections).
- `@orbit/providers` — pluggable Template/Photo/Video/Font/Background/Asset providers + registry + zero-config built-ins.
- Dependency graph (acyclic): `model → render → editor`; `model → providers → editor`.

**Why v2 wins — the Fabric → Konva decision.** Orbit is an embeddable **React** SDK. Fabric is imperative and must be glued to React with a bridge — and that bridge was the root cause of v1's jank (three stores, a deep-clone per mutation, a 400 ms long-press hack). `react-konva` makes the canvas declarative, deleting that entire class of problem; its per-node redraw also survives cheap-Android WebViews (which matters for RN-first), and the headless Valtio model gives the agent a clean `applyAction` surface. Polotno — the product we benchmark against — is itself built on Konva. Fabric's only real edges (built-in inline text editing, native SVG export) are already solved in v2 or low-priority. v1 is the more *finished* product today — that's a scheduling lead, not an architectural one.

**Cutover (definition of done for the transition).** When v2 reaches feature parity (video/audio/AI/collab/effects/SVG export), **delete `@orbit/core` and the old `@orbit/react`, and rename `@orbit/editor` → `@orbit/react`.** `migrateSceneGraphToDocument` preserves existing saved designs. Until then v1 keeps shipping; all *new* forward work lands on v2.

---

## 3. Current state (capability matrix)

Keyed by capability to retire the conflicting "Phase N" numbering of the archived docs.
Legend: ✅ done · ◐ partial / placeholder · ❌ not yet.

| Capability | v1 (Fabric / Zustand) | v2 (react-konva / Valtio) |
|---|:---:|:---:|
| Image core (select / move / resize / rotate) | ✅ | ✅ |
| Text + inline editing | ✅ | ✅ |
| Shapes | ✅ (7 types) | ✅ (shape + line) |
| Layers / groups / lock / visibility | ✅ | ✅ |
| Multi-page | ✅ | ✅ |
| Transforms / align / distribute | ✅ | ✅ |
| Smart guides / snapping | ✅ | ✅ |
| Export PNG / JPG / PDF | ✅ | ✅ (+ JSON) |
| Export SVG | ✅ | ✅ |
| Video layers / playback | ✅ | ◐ (placeholder) |
| Global timeline | ✅ | ❌ |
| Audio tracks / WAV export | ✅ | ❌ (mixer needs re-homing) |
| Transitions | ✅ (8 types) | ❌ |
| Vector draw / node editing | ✅ | ❌ |
| Pressure sensitivity (stylus) | ✅ | ❌ |
| Collaboration (Yjs) | ✅ | ❌ (deferred) |
| WebGL effects | ✅ (adjustments) | ❌ (Konva filters planned) |
| Pluggable providers | ◐ (asset stubs) | ✅ (registry + built-ins) |
| Agentic actions | ◐ (action types + executor; backend stub) | ◐ (`applyAction` + action schema; no backend) |
| Headless model (Node) | ❌ (DOM-bound) | ✅ |
| Server render | ❌ | ◐ (model is headless; raster path TBD) |
| Billing / credit ledger | ❌ | ❌ |
| React Native | ❌ | ◐ (bridge + web-host done; RN shell + native pending) |

**Tests:** 22 files (core 16, react 2, render 2, model 1, shared 1); 244 cases green. **Docs:** 17 markdown files (API reference + guides) under `docs/`, plus the retired planning docs under `docs/archive/`. **Demos:** `apps/demo` (Vite/React, v1), `apps/demo-next` (Next.js, v1), `apps/studio` (v2 stack).

---

## 4. Forward roadmap

Forward phases are **lettered** to avoid colliding with the retired Phase-N numbering of the archived docs. Sequencing honors three rules: **RN-first**, **billing ships before generation**, and **protect the agent (the wedge)**. All forward work targets **v2**.

- **A — Harden the v2 image core.** Close static-design gaps (notably **SVG export**), finish align/distribute, run a perf pass. Goal: v2 is a drop-in replacement for v1's image use.
  - _Landed 2026-06-25:_ headless SVG export (`exportPageToSVG` in `@orbit/render`, wired into the Export menu); align-to-selection + distribute surfaced in the selection toolbar (model logic already existed); renderer perf fix — `ElementNode` is now memoized so pan/zoom and drag-time smart-guide updates no longer re-render every element.
- **B — React Native embed (the RN-first deliverable), on v2.** New `@orbit/react-native` loads the v2 web build in `react-native-webview`; a **typed JS bridge** exposes the public SDK API (`loadDocument`, `export`, `onChange`, `applyOps`); native chrome (image/video picker, camera, share sheet, file save) lives RN-side. Verified on a real mid-range Android, not just the simulator.
  - _Landed 2026-06-25:_ the typed **bridge core** (`@orbit/react-native`: protocol, host bridge driving an `OrbitStore`, client API, in-memory + RN/WebView transports — 7 end-to-end tests) **and the WebView web-host** (`apps/webview-host`: mounts the v2 editor + installs the bridge, bundles to one self-contained HTML via `vite-plugin-singlefile`). Browser-verified end-to-end: a simulated native `applyOps` command drove the live editor and SVG export returned through the bridge. **Remaining:** the thin RN `<WebView>` shell (template in `packages/react-native/README.md`), native pickers/camera/share, and on-device Android verification.
- **C — Server render + billing spine.** Headless raster of the v2 model (`@orbit/model` is already DOM-free; konva-node raster path) → PNG/JPG; queue with BullMQ, store in R2, return signed URLs. **License keys + credit ledger + usage metering — ships before any generation.**
- **D — Agentic system (the wedge), on v2 `applyAction`.** `@orbit/agent` service using the Anthropic API with tool use: `apply_document_ops` (validated against the v2 schema), `generate_image` / `generate_video` and `edit_image` via fal/Replicate (results to R2, inserted as layers), and `clarify` (ask, don't hallucinate). **Every generative call debits the ledger from Phase C.**
- **E — Video into v2 + server video export.** Re-home video layers / timeline / audio mixer / transitions from `@orbit/core` into v2; build server video export (animate the schema over time → konva-node frames → composite over decoded source video → encode + mux audio with ffmpeg). Start narrow: one video layer + text animation, then add complexity.
- **F — v2 cutover.** Bring collaboration (Yjs on the Valtio doc) and effects (Konva filters) to parity → delete `@orbit/core` + old `@orbit/react`, rename `@orbit/editor` → `@orbit/react`. The migration adapter preserves saved designs.
- **G — SDK packaging + sellable v1 + design partner.** Clean public API across RN / Next / React; white-label theming + layout slots; license validation, semver, **schema migration hooks** (the `schemaVersion` field exists in the v2 model; no migration registry yet), changelog; docs site with per-framework quickstarts; land one design-partner business; pricing = license tier + usage-based credits for the agentic layer.

**Deferred / optional (not on the critical path to sellable v1):** vector boards + QR-code "Apps" panel (the archived `phases.plan.md` Phase 3 — re-scope onto v2 if still wanted); theme marketplace; icons / stickers panels; canvas context menu; settings panel.

---

## 5. Risks (ranked)

1. **v2 parity drag / running two stacks.** The cutover stalls and you maintain v1 and v2 indefinitely. Mitigate: keep the cutover checklist (§2) explicit; freeze new features on v1.
2. **Server video export (Phase E).** Most likely to overrun. De-risk by starting narrow (one video layer + text animation).
3. **Agent op reliability (Phase D).** The differentiator lives or dies here — invest in op validation, retries, and guardrails.
4. **Mobile WebView UX (Phase B).** Touch gestures (pinch-zoom, finger-sized handles) and performance on cheap Android.
5. **Generative unit economics.** Free users burning gen credits. The ledger must ship before generation (C before D).
6. **Schema churn.** Breaking changes for clients. Add `schemaVersion` + migration hooks to the v2 `toJSON` from the start.

---

## 6. Document map

| Doc | Role |
|---|---|
| `ROADMAP.md` (this file) | Canonical roadmap — status + direction |
| `ARCHITECTURE_V2.md` | v2 technical spec (model / render / editor / providers) |
| `AGENTS.md` | Contributor guide (structure, commands, style) |
| `PERFORMANCE_AUDIT.md` | Legacy-v1 bundle-size & memory audit (reference) |
| `docs/` | API reference + guides (17 markdown files) |
| `docs/archive/` | Retired planning docs: `orbit-sdk-build-plan.md`, `phases.plan.md`, `PROJECT_STATUS.md`, `Orbit Editor UI Polish + Agentic Workflow Plan.PLAN.md` |

---

## 7. Stack of record

Corrects the technology choices in the archived `orbit-sdk-build-plan.md`, which described intent, not the built system.

| Layer | Choice |
|---|---|
| Canvas | **react-konva** (v2) · Fabric.js v6 (legacy v1) |
| Model / reactivity | **Valtio** (v2) · Zustand + observer scene-graph (legacy v1) |
| Monorepo | Turborepo + pnpm |
| Web UI | React (+ Next.js SSR-safe wrapper) |
| RN shell | Expo + react-native-webview (planned, Phase B) |
| Backend (planned) | NestJS |
| Job queue | BullMQ + Redis |
| Storage | Cloudflare R2 |
| Image render | Headless model → konva-node raster (planned, Phase C) |
| Video render | Server-side **ffmpeg** (planned, Phase E) |
| Agent brain | Anthropic API (tool use) |
| Generation | fal.ai / Replicate |
