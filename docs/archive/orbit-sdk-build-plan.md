> **Archived 2026-06-24** — superseded by [`/ROADMAP.md`](../../ROADMAP.md). Kept for history; the technology choices below (Konva/MobX/NestJS) describe the original intent, not the built system — see the Stack of record in `ROADMAP.md`.

# Orbit SDK — Build Plan

A solo-dev roadmap for an embeddable image + video editor with an agentic layer, targeting **React Native first**, then **Next.js / React.js** for web.

---

## 0. Scope lock (read this before anything else)

**What Orbit is:** a Canva/Polotno-style *design-canvas* editor. Images and video both live on a canvas as **layers**, with a **global timeline** for animation and audio. One headless engine drives every surface (RN, web) and every export.

**What Orbit is NOT in v1** — say no to these on purpose, they're what kills solo builds:
- ❌ A frame-accurate multi-track NLE (CapCut-style footage editing). Different engine entirely.
- ❌ A native mobile render engine. RN gets the editor via an embedded web build, not a Swift/Kotlin port.
- ❌ Real-time multiplayer collaboration.
- ❌ On-device video encoding as the primary export path (flaky in mobile WebViews).

**The wedge:** the agentic layer ("describe → generate + edit like Krea"). Canvas parity with Polotno is table stakes; the agent is the only reason a business picks you over the incumbent. Protect its quality.

---

## 1. Architecture: one engine, many shells

```
                         ┌─────────────────────────────┐
                         │   @layera-labs/orbit-core  (headless TS) │
                         │  - JSON document schema       │
                         │  - store / reactivity (MobX)  │
                         │  - layers, timeline, history  │
                         │  - NO DOM, NO React            │
                         └───────────────┬───────────────┘
                                         │ same schema everywhere
            ┌────────────────────────────┼────────────────────────────┐
            ▼                            ▼                            ▼
  ┌───────────────────┐      ┌────────────────────┐      ┌────────────────────┐
  │ @layera-labs/orbit-web (React)│      │ @layera-labs/orbit-render (Node)│      │ @layera-labs/orbit-agent (Node)│
  │ Konva canvas +    │      │ headless Konva →    │      │ Claude orchestrator│
  │ panels/toolbar/   │      │ PNG/JPG (image)     │      │ + fal/Replicate    │
  │ timeline UI       │      │ frames + ffmpeg →   │      │ + schema-ops tool  │
  └─────────┬─────────┘      │ MP4 (video)         │      │ + credit metering  │
            │                └────────────────────┘      └────────────────────┘
            ▼
  ┌───────────────────┐
  │ @layera-labs/orbit-react-native│  ← WebView loads the @layera-labs/orbit-web build
  │  WebView + JS bridge│     + native file/camera/share
  │  exposes SDK API    │
  └───────────────────┘
```

**The core idea:** `@layera-labs/orbit-core` owns a single JSON document schema. The web UI renders it with Konva, the render service rasterizes the *same* schema in Node for pixel-parity exports, the agent *mutates* the same schema, and React Native simply embeds the web build. You design the schema once; everything else consumes it.

**Why RN gets a WebView, not a native build:** Konva is web/canvas tech. Porting it natively is months of work you don't have. Embedding the web editor in `react-native-webview` reuses 100% of the editor and still lets you ship native chrome (file picker, camera, share sheet) around it. Nailing this embed is also your differentiator — most editor SDKs are weak on mobile/RN.

---

## 2. Tech stack (mapped to what you already run)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | Turborepo | You already run this on Nomi |
| Core store | TypeScript + MobX | Mirrors Polotno's proven reactivity model (Zustand/Valtio are lighter alternatives) |
| Canvas | Konva.js / react-konva | Same engine Polotno uses; lets you render headless in Node too |
| Web UI | React (works in Next.js + plain React) | Your target web frameworks |
| RN shell | Expo + react-native-webview | Your stack; bridge via postMessage/injectedJavaScript |
| Backend | NestJS + Drizzle + Cloudflare R2 | Your stack; R2 for asset + export storage |
| Image render | Headless Konva via `canvas` (node-canvas) | Pixel-parity with the editor |
| Video render | System **ffmpeg** (server-side) | ffmpeg-kit (on-device) is dead; server ffmpeg is your shayari pipeline reused |
| Job queue | BullMQ + Redis | Renders and gen calls are long-running; never block requests |
| Agent | Anthropic API (tool use) | The orchestrator brain (billed per token, separate from your subscription) |
| Generation | fal.ai / Replicate | Images (Flux, nano-banana, Seedream), video (Kling/Veo/Runway), edits (inpaint, bg-remove, upscale) |

---

## 3. The phases

Each phase ends with something testable in your own mobile app. Ship vertically, not horizontally.

### Phase 0 — Foundations
**Goal:** the monorepo and the schema exist.
- Turborepo with packages: `core`, `web`, `react-native`, `render`, `agent`, plus `demo-app` (your dogfood mobile app) and `demo-web`.
- **Design the JSON document schema first.** Pages → layers (`image`, `text`, `shape`, `video`, `audio`) → per-layer transform, animation keyframes, timeline position. This schema is the contract for the entire product; spend real time here.
- `@layera-labs/orbit-core`: store, layer CRUD, serialization (`toJSON`/`loadJSON`), undo/redo via transactions.
- **Done when:** you can construct a document in code, serialize it, reload it, and undo/redo — with zero UI.
- **Watch-out:** every shortcut you take in the schema now becomes a breaking change for paying clients later. Version the schema from commit one (`schemaVersion` field + migration hooks).

### Phase 1 — Image editor (web)
**Goal:** rough Polotno parity for static design.
- `@layera-labs/orbit-web`: Konva canvas bound to the core store. Select/move/resize/rotate handles, text editing, shapes, image upload, z-order, snapping/guides.
- Side panel + toolbar components, themeable.
- Client-side PNG/JPG export (canvas → blob) for the web fast path.
- **Done when:** you can build a multi-layer poster in the browser and export it.
- **Watch-out:** build the UI as composable components from the start (clients will want to rearrange/replace panels). Don't hardcode a single layout.

### Phase 2 — React Native embedding (delivers the "RN-first" promise)
**Goal:** the image editor runs well *inside* your Expo app.
- `@layera-labs/orbit-react-native`: a component that loads the `@layera-labs/orbit-web` build in `react-native-webview`.
- **JS bridge:** a typed message protocol (RN ↔ WebView) that exposes the public SDK API — `loadDocument`, `export`, `onChange`, `applyOps`, etc. RN devs only ever touch this surface.
- Native integrations RN should own: image/video picker, camera, share sheet, file save.
- **Done when:** you edit a design on a real mid-range Android (test a ₹12–15k phone), not just the simulator.
- **Watch-outs:** touch gestures on a mouse-built canvas need real work (pinch-zoom, finger-sized handles); WebView memory on cheap Android; asset/font loading latency.

### Phase 3 — Server render service + the billing spine
**Goal:** consistent server exports, and the meter exists before anything costs money.
- `@layera-labs/orbit-render` on NestJS: run the **same Konva renderer headless in Node** (via `canvas`) to rasterize a document to PNG/JPG. This guarantees server output matches the editor.
- Queue exports with BullMQ; store results in R2; return signed URLs.
- **Billing/license spine (start now, not later):**
  - License keys per SDK customer (gate the editor like Polotno's key).
  - A **credit ledger** keyed to license + end user. Every future generative call debits it.
  - Usage metering + simple dashboard.
- **Done when:** your app requests a server export and gets back an R2 URL, and a test credit debit works.

### Phase 4 — Video editor (the hard backend phase)
**Goal:** video-as-layers, timeline, audio, and a reliable export.
- Editor side: video layers on canvas, trim (in/out), the **global timeline** for animation timing, audio tracks (`addAudio` with start/end/volume/delay), entry animations (fade/slide/scale).
- Client preview: play the timeline in the WebView (canvas animation + `<video>` sync). Preview only — do **not** depend on it for final output.
- **Server video export (the genuinely hard part):** animate the schema over time → render canvas frames in Node → composite over decoded source video → encode + mux audio with **ffmpeg**. Reuse your shayari kinetic-typography ffmpeg experience here.
- **Done when:** a templated lyric/shayari video with text animation + a video layer + audio exports correctly server-side from the mobile app.
- **Watch-out:** this is the phase most likely to overrun. Start with single-video-layer + text/animation export, then add complexity. Don't aim for arbitrary compositing on day one.

### Phase 5 — Agentic system (the wedge)
**Goal:** natural-language create-and-edit, built as a standalone service portable into both the app and the SDK.
- `@layera-labs/orbit-agent` on NestJS, Claude API with tool use. Core tools:
  - `apply_document_ops` — the killer tool. Claude reads the current Orbit JSON and emits **structured edit operations** (add layer, set property, reorder, animate). This is how "make this more festive" becomes real canvas edits. Validate every op against the schema before applying.
  - `generate_image` / `generate_video` — call fal/Replicate, store result in R2, insert as a layer.
  - `edit_image` — inpaint, background removal, upscale via fal/Replicate.
  - `clarify` — ask the user when the request is ambiguous (don't hallucinate edits).
- Stream results to the client; apply ops optimistically.
- **Every generative tool call debits the credit ledger from Phase 3.**
- **Done when:** in your app, "generate a Diwali poster with my photo and add glowing text in Punjabi" produces an editable document, and credits decrement.
- **Watch-outs:** the agent's reliability *is* the product — invest in op validation, retries, and guardrails. Split cost tiers: cheap features (captions, TTS, bg-remove) can be freemium; image/video generation is paid/metered, never free.

### Phase 6 — SDK packaging (developer experience)
**Goal:** something a stranger can integrate without talking to you.
- Clean public API surface for all three targets: `@layera-labs/orbit-react-native`, and web usage in Next.js (SSR-safe, dynamic import for the canvas) and plain React.
- White-label theming (colors, fonts, layout slots), event hooks, controlled/uncontrolled modes.
- License key validation, semantic versioning, schema migrations, changelog.
- Docs site: quickstart per framework, API reference, live playground, recipes.
- **Done when:** you can integrate Orbit into a fresh Next.js app from the docs alone, with no source access.

### Phase 7 — Sellable v1 + design partner
**Goal:** revenue and real-world API stress.
- Define a thin **sellable v1**: core editor + 1–2 agentic flows that genuinely wow.
- Get **one design-partner business** integrating while it's still rough (free/cheap for brutal feedback). Your own app structurally can't surface the weird auth/theming/version-pinning needs a real client hits.
- Pricing model: license tier + usage-based credits for the agentic layer (mirror how fal/Anthropic bill you, with margin).

---

## 4. Critical path & sequencing notes

- **Schema → image editor → RN embed → render service → video → agent → package.** Don't reorder the schema or the billing spine; everything depends on them.
- **Dogfood through the public API only.** The moment your app reaches into Orbit internals to "just make it work," you bake in assumptions that break real integrations. Force your app through the same surface a paying client gets, and the API designs itself.
- **Build the agent as its own service from day one** so it drops into both the mobile app and the SDK unchanged.
- **Two bills to plan for:** Anthropic API (the agent brain, per token) and fal/Replicate (the generation, per call). Your Claude *subscription* covers building, not runtime inference.
- **Don't wait for "perfect" to sell.** Define sellable v1 narrowly and get a design partner in early; perfectionism on the whole surface is the trap.

---

## 5. Biggest risks, ranked

1. **Server video export** (Phase 4) — most likely to overrun. De-risk by starting narrow (one video layer + text animation).
2. **Agent op reliability** (Phase 5) — your differentiator lives or dies here. Validate ops hard.
3. **Mobile WebView UX** (Phase 2) — gestures + performance on cheap Android.
4. **Generative unit economics** — free users burning gen credits. The ledger must ship before generation does (Phase 3 before Phase 5).
5. **Schema churn** — breaking changes for clients. Version from the start.
