# Orbit — project context for Claude

Read this first. It exists so the user never has to re-explain the project.

## What Orbit is

Open-source, embeddable, white-label **design-canvas editor SDK** for **image + video**,
with an agentic (AI) layer. Inspired by **Polotno SDK** and **Canva**. Targets React,
Next.js, and React Native.

**Current focus: a native mobile video-editing app (`apps/mobile`), modelled on the VN
Video Editor app.** That is where nearly all active work happens.

Source-of-truth docs: [ROADMAP.md](ROADMAP.md), [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md),
[PROJECT_FEATURE_STATUS_REPORT.md](PROJECT_FEATURE_STATUS_REPORT.md) (audit, 2026-07-26),
[AGENTS.md](AGENTS.md) (repo conventions).

## Repo shape

pnpm + Turbo TypeScript monorepo, Node >= 20, pnpm 10.29.2.

| Path | Role |
|---|---|
| `apps/mobile` | **The video editor app.** Expo SDK 55 / RN 0.83 / React 19 / Skia dev build. |
| `apps/render-service` | Express service: `/v1/upload`, `/v1/render`, AI gen endpoints, auth, billing. |
| `apps/web` | **The web product.** Next 14 / React 18. Image editor + AI studio + video editor. |
| `apps/studio`, `apps/demo`, `apps/demo-next`, `apps/webview-host` | Web demos for the SDK. |
| `packages/video` | **Canonical video engine** — ffmpeg arg builder + `renderProject`, effect math. |
| `packages/video-gen`, `packages/video-ai` | AI providers (ElevenLabs TTS, image/video gen). |
| `packages/model` / `render` / `providers` / `editor` | v2 web SDK: Valtio doc model → react-konva renderer → provider registry → React UI. |
| `packages/core`, `react`, `next`, `ui`, `shared`, `assets`, `effects`, `agentic` | v1 web SDK (legacy, still building). |

## Hard rules (violating these breaks things)

1. **`apps/mobile` is NOT in the pnpm workspace** (`!apps/mobile`). It installs
   **standalone with npm**. Never run `pnpm add`/`pnpm install` inside it — it corrupts
   Metro resolution. Add deps via `npx expo install <pkg>` or edit `package.json` then
   `npm install` **in `apps/mobile`**.
2. Because of that isolation, mobile **cannot import `@orbit/video`**. It **vendors**
   `packages/video/src/{types,project}.ts` into `apps/mobile/src/model/`. **Keep the
   vendored copies in sync with the canonical engine.**
3. **Never use emoji in mobile UI** — they render as tofu in the iOS Simulator. Use
   `src/components/VIcon.tsx` (react-native-svg, 24×24 `d` paths). No `@expo/vector-icons`
   in the design-system screens.
4. Never reference bare `fontWeight`; use `font.{regular…extrabold}` / `mono.*` from
   `src/constants.ts`.

## Mobile editor architecture (`apps/mobile`)

- **Model**: `VideoProject.tracks` — CapCut-style multi-track. Visual tracks stack
  bottom→top by z-order; each clip has an absolute `start` + normalized `rect` (PiP).
  Audio tracks mix. A legacy single-track `clips`/`audio` path still exists; `ensureTracks`
  migrates v1 projects on open. `buildMultiTrackArgs` composites when `tracks` is present.
- **Preview** (`src/components/Preview.tsx`): Skia `<Canvas>`. Base + overlay video decode
  live per-frame via `src/preview/useClipFrame.ts` (Skia.Video + useFrameCallback, seek+retry).
- **Effects are dual-rendered from ONE model** — every clip effect must work in BOTH the
  Skia preview and the ffmpeg/resvg export. Filters=`<ColorMatrix>`/eq; Transitions=
  `<Group opacity>`/xfade; Blur=`<Blur>`/gblur; Motion(Ken Burns)=`<Group transform>`/zoompan;
  Cutout(chroma)=Skia `RuntimeEffect`/`colorkey`. Shared math lives in `packages/video/src/`
  (`motion|cutout|mask|blend|curve|keyframes|filters.ts`) mirrored into `apps/mobile/src/preview/`.
- **State**: zustand — `src/store/{editorStore,authStore,aiActions}.ts`. Sheets are driven by
  store `panel` state (`setPanel`); prefs in store `prefs`; export in `exportToPhotos`.
- **Persistence**: expo-file-system v55 class API (`File`/`Directory`/`Paths`), one JSON per
  project under documentDirectory, media copied into `media/`.
- **Timeline** (`Timeline.tsx`): fixed left gutter of VIcons over 5 lanes — Music · Text ·
  Image · Video (main) · Sound (read-only mirror). Scrub by scrolling under a fixed center
  playhead; scroll locks while a clip is selected so trim-handle pans win.
- **Export**: upload local media → `POST /v1/upload` (`upload:<id>` token) → resolved project →
  `POST /v1/render` → download MP4 → save to Photos. The server's `resolveSrc` only maps tokens
  to files in its media dir and rejects non-token/non-URL srcs (clients can't point ffmpeg
  at arbitrary paths).
- **BYOK stock media**: Orbit is a developer/SDK product, so Unsplash/Pexels use
  **bring-your-own-key**, stored in the OS keychain via `expo-secure-store`, never in the
  bundle and never sent to Orbit's server. `src/content/{keys,stock}.ts`, `KeysSheet`.
- **Content library**: `src/content/{catalog,library,assets}.ts` — Stickers · Emoji ·
  Backgrounds. Bundled OpenMoji/gradient packs in `assets/content/`, CDN fallback via jsDelivr.
  Stickers reuse the overlay-image pipeline, so they're dual-rendered for free.

## Design system ("Vela")

Originally specced from `CapCut-style editing app UI/Vela.dc.html` (the user's mockup).
Tokens in `apps/mobile/src/constants.ts` — `vela` / `theme.vela`, plus `sp` (spacing),
`r` (radii), `elev` (tight directional shadows).

Current palette on `codex/ui-redesign` — **settled deliberately 2026-07-27, don't
re-litigate**: one hue, neutral surfaces, no gradients in chrome.

- `accent`/`action` `#5b4bff` (indigo), `accent2` `#8b83ff` — a lighter step of the SAME
  hue, not a second colour. It was `#933ff2` (purple); the indigo→purple pair was the
  most recognizable machine-made colour move there is.
- Dark surfaces are **neutral**, not blue-charcoal: `editorBg` `#0e0e11`, `sheet`
  `#17171a`, `card` `#1c1c1f`, `toolbar` `#101013`… The old set leaned blue and competed
  with the accent sitting on it.
- **No two-hue gradients in chrome.** `orbitGradient` is gone; `orbitTonal`
  (`[accent, accentDim]`, one hue two values) replaces it and is only for surfaces that
  genuinely need depth. Buttons, avatars and marks are solid fills.
- All 8 project templates are **cool** (slate / indigo / plum / graphite / blue / violet
  / slate-green / neutral). They were warm gold-era leftovers clashing with the chrome.
- Light Home stays `homeBg` `#f7f7fa`.

`OrbitMark` (planet + tilted ring + orbiting dot) is the brand's signature artifact —
nav, header, onboarding, and the AI Studio hero. `animate` sends the dot round the ring
(9s, passes behind the planet on the far side, honours reduced motion); it's **off by
default** and the resting position is the t=0 position, so nothing is gated on motion.

History: gold-on-black `#e3ac3d` before this; teal before that, which the user rejected.

Screens: `EditorScreen` (dark) · `HomeScreen`/`ProjectsScreen` (light) · `DiscoverScreen` ·
`AiStudioScreen` · `MediaLibraryScreen` · `ProfileScreen` · `OnboardingScreen`, with a
floating `BottomNav`. Router lives in `App.tsx` over the store's `screen`.
Editor panels are in `EditorSheets.tsx` plus dedicated sheets (`MosaicSheet`,
`MagnifierSheet`, `StorySheet`, `TtsSheet`, `TextSettingsSheet`, …).

**The user cares a lot about visual feel.** The global anti-slop design law in
`~/.claude/CLAUDE.md` applies to every UI change here — read it before designing.

## Verifying mobile work

- **Cheap check that everything resolves/compiles** (stronger than tsc): start Metro
  (`npx expo start --port 8081`) then
  `curl -s -o /tmp/b.js -w '%{http_code}' 'http://localhost:8081/index.bundle?platform=ios&dev=true'`
  — 200 = the whole app bundles.
- **Simulator**: bundle id `com.galaxy.orbit` (was `com.anonymous.orbit-video` until
  2026-07-27 — an app installed before that is a *different* app and needs reinstalling);
  `npx expo run:ios --device <UDID>`.
- **Server URL** resolves in `constants.ts` as `extra.serverUrl` → Expo's dev `hostUri` →
  `localhost:8787`. A dev build on a physical device therefore reaches your Mac
  automatically. Note `hostUri` reflects HOW the dev client connected: launch the
  simulator against `localhost` and it resolves to `127.0.0.1`, which is correct but does
  NOT exercise the device path — relaunch against the LAN IP to test that.
- **Builds**: `eas.json` has `development` (simulator), `development-device`, `preview`
  (internal, Android APK) and `production` profiles.
  `ios/` is gitignored (CNG; `app.json` is canonical), so **new native modules need a rebuild**.
  Screenshot with `xcrun simctl io <UDID> screenshot out.png` — computer-use screenshots fail
  here (SCContentFilter) and sim taps don't register. To reach a specific screen/sheet, drive
  `useEditor.getState()` from a `// TEMP-VERIFY` mount effect in `App.tsx`, relaunch
  (`simctl terminate` + `launch`), then **`grep -rn TEMP-VERIFY` and revert before committing**.

## The web app (`apps/web`)

Next 14 App Router. **One editor** over the v2 SDK plus a browser video engine.

- **`/design/[id]` is the only editor.** `/image/[id]` and `/video/[id]` are `redirect()`
  stubs so old links still open. The shell is a four-column CSS grid — rail · panel ·
  canvas · inspector — with a full-width strip beneath. **Every cell names its own
  `grid-column`**: the panel is conditionally rendered, and with auto-placement its absence
  slides the canvas into the panel's `auto` track and the inspector into the canvas's `1fr`,
  leaving a dead gulf on the right.
- **Two document kinds, one shell.** `OrbitDocument` and `VideoProject` stay separate —
  merging them would mean rewriting the ffmpeg arg builder and re-proving dual-render.
  `DesignClient` branches into `StillDesign` / `MotionDesign` because each owns a different
  set of hooks; one component with conditionals would call hooks conditionally.
- **The still surface does NOT mount `<OrbitEditor>`.** It renders `Workspace` plus the
  SDK's section `Panel`s inside its own chrome, wrapped in
  `<div className="orbit orbitEmbedded">` — `.orbit` scopes the ~30 `--o-*` variables AND
  the `.o-*` class rules both the panels and the Konva selection chrome depend on, and
  `orbitEmbedded` undoes its `position: absolute` so the grid survives.
- **The timeline is a single sticky-scrolled grid.** Visual tracks render in REVERSE array
  order (array order is z-order, so the last track belongs at the top on screen); caption
  lanes sit above everything because overlays composite last. `useClipDrag` handles move,
  trim and cross-lane in one gesture and commits **once on pointerup** — per-pointermove
  would push sixty history entries per drag.
- **`removeClip` and `applyToClip` deliberately do not re-pack the track.** Packing lays a
  track end-to-end from zero, which destroys every deliberate gap once clips can be dragged.
  Closing a hole is a separate, explicitly-chosen edit: `rippleDeleteClip`, and it ripples
  ONLY the clip's own track so captions and music stay where they were put.
- **Local-effect geometry is shared, not reimplemented.** `regionBoxPx`, `mosaicStepPx`,
  `mosaicBlurSigma`, `magnifierCropPx` and `ROUNDED_R` live in `packages/video/src/layout.ts`
  and are called by BOTH `ffmpeg.ts` and `compose.ts`, so a mosaic or lens lands on the same
  pixels in preview and export. `scratch()` in `compose.ts` is namespaced for the same
  reason a mosaic must not be handed the canvas it is reading from.
- Stickers are image clips on an overlay track with a normalized `rect`, so they are
  dual-rendered for free. House marks are authored as SVG and **rasterized to PNG before
  storage** — ffmpeg cannot read SVG.
- Transitions offer **only Cut and Fade**: `buildMultiTrackArgs` applies them to the first
  visual track only and collapses every other type to a fade, and `frameStateAt` reproduces
  that collapse so the preview is never better than the export.

- **Versions are pinned exactly** — `next 14.2.35` / `react 18.3.1`. Every v2 package peers
  React 18 and `react-konva@18.2.x` is the React-18 line; two React copies is a hard crash
  in Konva's reconciler. Do not bump without migrating `packages/{editor,render}` and
  `react-konva` together.
- **Never alias `react`/`react-dom` in `next.config.mjs`.** Next resolves them through export
  conditions (the server needs the `react-server` build with `React.cache`); an alias bypasses
  the exports map and hydration dies leaving an EMPTY DOCUMENT. Only konva/react-konva/valtio
  are deduped, client-bundle only. `canvas: false` stubs Konva's native Node build.
- **`next dev` and `next build` use different output dirs** (`NEXT_DIST_DIR=.next-dev`).
  Sharing one made `pnpm build` corrupt a running dev server into blank pages.
- **Browser video engine** (`src/video/engine/`): canvas 2D, one rAF loop on a project clock,
  `<video>` elements as decoders, WebAudio for sound. It **computes nothing** — `frameStateAt`
  in `@orbit/video` returns a `DrawOp[]` and the compositor executes it. Each clip is drawn
  into a **scratch canvas** first, because `ctx.filter` and `globalCompositeOperation` apply to
  the whole canvas, not the clip rect. Grades use an SVG `feColorMatrix`, not CSS
  `brightness()`, because ffmpeg's `eq=brightness` ADDS and CSS multiplies.
- **The grade's exactness, measured (2026-07-28).** ffmpeg's filters were probed with
  known RGB bytes rather than reasoned about, and two things came out of it.
  `colortemperature` is a plain **per-channel gain** (ported as `temperatureGains`,
  ffmpeg's `kelvin2rgb`), so it folds into the same matrix and is EXACT — it used to be
  dropped entirely, which made Warm and Cool preview nearly identically. `eq` is NOT
  exact: it works on YUV planes in limited range, so the saturation matrix uses **BT.601**
  coefficients, not Rec.709 (709 put `mono` 39/255 off; 601 puts it 3 off). Residual
  across every preset on mid-tone colours is **≤6/255**, confirmed end-to-end against a
  real canvas. Closing it fully would need the clip's own colour space, which the browser
  does not expose. Do not re-assert that the grade is byte-identical; it is not.
- **Chroma key runs in a WebGL fragment shader** (`engine/cutout.ts`), not `getImageData` —
  a full-frame clip is 2M pixels and a JS loop drops the preview under 30fps. It mirrors
  ffmpeg `colorkey` (`alpha = clamp((diff − similarity)/blend)`, `diff = √(Σd²/3)`, RGB
  untouched, no despill), verified byte-for-byte. The control hides itself where WebGL is
  missing rather than offering an effect the preview would skip.
- **Dual-render is enforced by tests, not comments**:
  `packages/video/src/__tests__/dual-render.test.ts` parses the real filtergraph out of
  `buildFFmpegArgs` and asserts it agrees with `frameStateAt`; `browser-safety.test.ts` walks
  the `browser.ts` import graph for `node:`/`@resvg`. Both were mutation-tested.
- **Media**: projects store `orbit-media:<id>` (IndexedDB blob), swapped to `upload:<token>`
  at export. Tokens are NOT durable (the service evicts oldest-first), so a failed render
  clears them and re-uploads.
- **`/api/orbit/*` proxies only the credit-metered endpoints** so the account id lives in an
  httpOnly cookie. Upload and render go direct — they are too long/large for a function.
- Design system "The Instrument" — see `src/styles/tokens.css` and `src/brand/Plate.tsx`.
  Warm graphite, one clay accent for LIVE state only, Gambarino (Fontshare) + system-ui.
  Deliberately NOT mobile's Vela.
- **Light is the DEFAULT theme** (added 2026-07-28). The light palette sits on bare
  `:root`; dark is `:root[data-theme='dark']`, opt-in and stored, applied before paint
  by a script in `layout.tsx`. Not a `prefers-color-scheme` media query — light is the
  product's default, not merely what a light-set OS gets. The light surface is a **warm
  stone at hue ~20**, pulled toward the clay accent: NOT the cool UI-kit gray and NOT
  cream, both of which the design law names. `color-scheme` is declared in CSS, never
  written onto `<html>` (an inline style the server didn't render warns at hydration).
  Anything constant across themes — a dark scrim over a photograph and its text — uses
  `--w-scrim`/`--w-on-scrim`, which do not flip.
- **The SDK skin must match the theme selectors explicitly.** `@orbit/editor` ships a
  `.orbit[data-theme='light']` block re-declaring ~25 `--o-*` vars, which outranks a
  plain `.orbit`. `orbit-editor-skin.css` therefore declares on
  `.orbit, .orbit[data-theme='light'], .orbit[data-theme='dark']` — drop that and the
  embedded editor silently reverts to the stock palette in light mode.
- **Never import a value into a server component from a `'use client'` module.** It
  arrives as a client reference proxy, not the value. `THEME_KEY` did, and
  `JSON.stringify` inlined `{}` into the pre-paint script, so the stored theme never
  came back — with no error anywhere. Shared constants live in plain modules
  (`store/themeKey.ts`).

`packages/video` now has subpath exports: `@orbit/video/browser` (pure, browser-safe) and
`@orbit/video` (adds ffmpeg/resvg/fs). Never import the default entry from a web bundle.

## Web SDK commands

```bash
pnpm install && pnpm build      # turbo
pnpm test                       # vitest, tests in src/__tests__/*.test.ts
pnpm typecheck
pnpm --filter @orbit/studio dev # v2 demo
```

## Known gaps / deliberate non-features

- **Not production-ready**: needs durable media/output storage, an async render queue,
  deployment + observability, purchase config, social login, cloud project sync.
- Multi-clip projects drop each clip's *own* audio (concat uses `a=0`); only single-clip
  original audio + separate `project.audio` tracks mix.
- Genuinely not built, with reasons: **speed ramping** (ffmpeg can't smoothly ramp audio
  tempo, no faithful preview — constant per-clip speed IS shipped), **keyframe
  scale/rotation** (scale can't animate per-frame in ffmpeg).
- Story, auto-caption/SRT, and some editor preferences are incomplete.

## Working style

- Commits: short imperative subjects with a scope, e.g. `mobile: refine AI studio UI`,
  `fix(editor): …`.
- The user hits usage limits fast — be efficient: don't re-read what's already established,
  don't narrate options, act once you have enough to act.
