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
- **Simulator**: bundle id `com.anonymous.orbit-video`; `npx expo run:ios --device <UDID>`.
  `ios/` is gitignored (CNG; `app.json` is canonical), so **new native modules need a rebuild**.
  Screenshot with `xcrun simctl io <UDID> screenshot out.png` — computer-use screenshots fail
  here (SCContentFilter) and sim taps don't register. To reach a specific screen/sheet, drive
  `useEditor.getState()` from a `// TEMP-VERIFY` mount effect in `App.tsx`, relaunch
  (`simctl terminate` + `launch`), then **`grep -rn TEMP-VERIFY` and revert before committing**.

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
