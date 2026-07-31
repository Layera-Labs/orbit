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
  (`motion|cutout|mask|blend|curve|keyframes|filters|transform.ts`) mirrored into
  `apps/mobile/src/preview/`.
- **Rotation + crop** (2026-07-31, `packages/video/src/transform.ts`). `rotation` is
  CLOCKWISE **degrees** about the centre of `rect`; `crop` is a `SourceRect` normalized to
  the media's **own** size — it has to be, because `ffmpeg.ts` never probes the media and
  `frameStateAt` is sync and pure. Order everywhere: decode → **crop** → grade → cover-fit
  into `rect` → effects → **rotate** → composite. There is still exactly ONE cover-fit; it
  just reads from the crop window, so nothing crops twice (`sourceCropPx(nw,nh,undefined,…)`
  === `coverCrop(…)`, asserted). Four things measured against real ffmpeg 8.1.2, not
  reasoned about:
  - `rotate=…:c=none` **needs `format=rgba`** — with no alpha plane the fill is opaque black
    and every rotated clip gets black corners.
  - `ow`/`oh` come from `rotatedBoxPx`, never ffmpeg's `rotw()`/`roth()`, so the preview and
    the test can reproduce the encoder's exact number. It rounds **UP** to even (rounding to
    nearest shaves the corner the rotation just made) and snaps trig noise to zero — without
    that, `cos(π/2)` = 6.1e-17 made a 96px box come out 98.
  - The overlay origin is pulled back by half the growth (`rx-dx`), which pins the turn to
    the rect CENTRE. Values go negative; `overlay` accepts that, but the **blend path's base
    `crop` does not** — it is clamped, or a rotated PiP touching an edge aborts the render.
  - **No supersampling.** It was tried: `scale` 2x → rotate → `scale …:flags=area` gives four
    coverage steps instead of one, but the downscale averages colour against the transparent
    fill's black, so composited over black a red edge measured 16/64/144 where it should be
    64/128/192 — **up to 64/255 too dark on every boundary pixel**. `unpremultiply` does not
    fix it (the framework auto-inserts a matching `auto_premultiply` and the pair cancels);
    `setparams=alpha_mode=premultiplied` would, but only exists in ffmpeg 8 and would fail
    outright on 7.x. So the export's rotated edge is one honest hard pixel and both previews
    antialias — a recorded divergence on the boundary pixel only, far smaller than the
    alternative's error. Do not "improve" this without re-measuring.
- **State**: zustand — `src/store/{editorStore,authStore,aiActions}.ts`. Sheets are driven by
  store `panel` state (`setPanel`); prefs in store `prefs`; export in `exportToPhotos`.
- **Persistence**: expo-file-system v55 class API (`File`/`Directory`/`Paths`), one JSON per
  project under documentDirectory, media copied into `media/`.
- **Timeline** (`Timeline.tsx`): fixed left gutter of VIcons over 5 lanes — Music · Text ·
  Image · Video (main) · Sound (read-only mirror). Scrub by scrolling under a fixed center
  playhead; scroll locks while a clip is selected so trim-handle pans win.
  **Nothing here is animated on purpose** — a `LinearTransition` on the body dragged the
  whole timeline along behind a trim. Trim handles keep the geometry in LOCAL state and
  write the store **once, on release** (the web editor's `useClipDrag` rule): a per-frame
  `apply()` clones the project and re-renders three screens, so the edge trailed the finger.
  The body MOVE deliberately still writes live, because `setClipStart` re-packs the track in
  Quick mode and moves neighbours under linkage — deferring that would replace live feedback
  with a snap.
- **`SelectionActionBar` follows the clip.** Its actions branch by track kind + clip type
  (video / image / audio / caption / sticker); it used to show one set for everything and
  explain the dead ones with an alert. It is positioned from state that already exists —
  scrolling the timeline IS setting the playhead, so the scroll offset is
  `playheadSec * pxPerSec` and the clip's on-screen centre needs no plumbing out of
  `Timeline`. Vertically it clears the timeline ENTIRELY (`top: -(BAR_H + 8)` against the
  timeline's top edge): dropping it on the selected clip's lane would bury three others, and
  the first attempt at "just above" used a flat `-22` against a 56pt bar, so two thirds of it
  still sat on the ruler and the music track. `BAR_H` is a stated constant because the bar is
  absolutely positioned and contributes no height for a percentage to measure against.
- **Export**: upload local media → `POST /v1/upload` (`upload:<id>` token) → resolved project →
  `POST /v1/render` → download MP4 → save to Photos. The server's `resolveSrc` only maps tokens
  to files in its media dir and rejects non-token/non-URL srcs (clients can't point ffmpeg
  at arbitrary paths).
- **The H.264 level is capped at 5.2, and that is what makes an export saveable** (2026-07-31,
  measured against ffmpeg 8.1.2). Left alone x264 picks whatever level its VBV needs, and
  **`bufsize` is the knob that drives it, not the resolution**: 2160×3840 at `-b:v 160M
  -bufsize 320M` emits **Level 6.1**; the same bitrate at `-bufsize 160M` emits 5.1. Apple's
  decoder stops at 5.2, and the way that surfaces is not a playback glitch — `PHPhotoLibrary`
  refuses the asset, so a render that completed end to end dies at the last step with "this
  video couldn't be saved to the Camera Roll album". A device reproduced it every time on
  4K/High while 4K/Low, whose smaller buffer stayed inside 5.1, saved fine. `-level:v 5.2`
  makes x264 warn and clamp the buffer, which is the outcome we want. The other half of the
  fix is `exportMbps`: it was `scale²` off a 40 Mbps 1080p reference (160 Mbps at 4K), and is
  now `scale^1.5` — pixels^0.75, how H.264 actually behaves — off 18, so 4K/High lands at
  ~51 Mbps and the worst case in the UI (4K/High/60) measures Level 5.2 with no warning.
- **Every call to the service is under a JWT** (2026-07-29) — generation, credits, upload
  and render alike. Guest-first survives because signed-out is a **guest token**
  (`POST /v1/auth/guest`), not the absence of one: signed by the server, naming a subject
  the client cannot choose. It replaced `X-Orbit-Account`, a client-supplied header the
  server took at its word — set it to someone else's and you spent their credits. Token
  custody is `src/net/session.ts` on both clients (keychain on mobile, localStorage on
  web), under ONE key for guest and member, with a single shared in-flight bootstrap so
  four callers at launch don't mint four accounts. A 401 retries once **only for a guest**
  (`discardIfGuest`) — a member's expiry is a real sign-in, and silently swapping them onto
  a guest account would detach them from their own credits. `ORBIT_JWT_SECRET` is required
  in production and ephemeral in dev. Render jobs carry their `account`, so
  `GET /v1/render/:id` 404s someone else's job rather than handing over the MP4.
- **Every absolute `file://` we persist goes stale, and `rebaseMediaUri` is the cure.** iOS
  hands the app a fresh container UUID on every install. `projects.ts` has healed project
  JSON for a long time; `genHistory.ts` did NOT, so the Library and Upload grids pointed at
  dead paths and `<Image>` failed *silently* — nothing painted and the tile's own background
  showed through as a blank grey box. `loadHistory` now rebases, drops records whose file is
  really gone, and `MediaTile` has an `onError` fallback so a broken image can never render
  as an unexplained rectangle again. `GenRecord.thumbUri` persists a video's poster; without
  it every tile re-extracted one on every sheet open, forever. The same staleness is why
  `ensurePoster` checks that its file EXISTS rather than just that a poster is set.
- **A src is stored two ways and only one of them loads.** `copyIntoMedia` returns a `file://`
  URI; anything that takes a clip's `src` at face value gets a bare path. `<Image>` and Skia
  both need the URI form and both fail SILENTLY on the bare one. `ensurePoster` fed
  `setPoster` a bare `clip.src` for any project opening on an image, which blanked the poster
  on the export screen, the export sheet, the projects list and Home at once — and, because
  `fileExists` requires the `file:` scheme, made "do we have a poster?" answer NO forever, so
  every call re-derived it and wrote the project to disk again. `toFileUri` (`storage/media.ts`)
  is the one normaliser; `setPoster` applies it so no consumer has to.
- **Preview media is cached across mounts** (`src/preview/{mediaCache,mediaPool}.ts`,
  2026-07-31). Every visual layer is keyed by clip id, so crossing a cut unmounts and
  remounts it — and `useImage` has no cache at all (it re-reads and re-decodes the file on
  every mount, rendering NOTHING until it lands) while `Skia.Video` reopens a decoder. That
  was seconds of blank picture per scrub. Images now sit in a `ByteLru` and decoders are
  leased from a `LeasePool`, and the two are different structures for a reason: an image may
  be drawn by several layers and is never handed back, so eviction may only DROP a reference
  (freeing one that is on screen is a crash) and the bound must be bytes, not entries;
  a decoder is leased to exactly one layer and always returns, so an idle one can be freed —
  and the lease must be exclusive, because two layers sharing a decoder would fight over its
  seek position. Both neighbours of the on-screen clip are prefetched.
- **HDR10 is gated on a capability probe**, not attempted and refused. `/health` reports
  `capabilities.hdr` from `ffmpegSupportsHdr`, mobile caches it per server URL
  (`src/net/capabilities.ts`, fail-CLOSED — an unreachable server hides the toggle rather
  than offering it on a guess), and `ExportSheet` only renders the row when it is true.
  Homebrew's ffmpeg has no `zscale`, so on a dev Mac the toggle is simply absent.
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
  — 200 = the whole app bundles. **Restart Metro with `--clear` after adding a NEW
  file**: its watcher misses newly-created ones, so it happily rebuilds (the byte count
  even changes, from the edits to existing files) while leaving the new module out of the
  graph entirely. The check then passes against a bundle that does not contain the thing
  you are checking. Grep the bundle for a distinctive string from the new file to be sure.
- **RN's `SafeAreaView` OVERWRITES the padding in its own style.** It applies insets by
  writing `padding` onto its native view, so a `paddingHorizontal` declared on the same
  style is silently replaced — and in portrait the left/right insets are ZERO, so the
  gutter becomes 0 and copy runs flush to both rims. `ExportOverlay` shipped exactly that.
  Put the safe area on an outer view that carries nothing but `flex`/background, and the
  gutter on a child.
- **A missing simulator build is not always a code problem.** `expo run:ios` failing with
  `rsync … libskia.xcframework/ios-arm64_arm64e_x86_64-simulator/*: No such file` means
  that slice directory is EMPTY (an interrupted install), not that the project is broken:
  `rm -rf node_modules/@shopify/react-native-skia && npm install` restores it. Note this is
  the one package where the device slice can be present and the simulator slice absent, so
  a working device build proves nothing about the simulator.
- **Simulator**: bundle id `com.orbitvideo.app`; `npx expo run:ios --device <UDID>`.
  It has been renamed twice (`com.anonymous.orbit-video` → `com.galaxy.orbit` 2026-07-27 →
  here 2026-07-30), and each rename makes a **different app** as far as iOS is concerned:
  the old one keeps its own keychain and documents, so delete it rather than wondering why
  a signed-in session vanished. `com.galaxy.orbit` had to go because Apple's identifier
  namespace is global and another team already holds `com.galaxy.*` — it was unregistrable,
  and therefore unshippable, not merely inconvenient.
  **`expo prebuild` will NOT overwrite an existing `ios/`**, so a bundle-id change in
  `app.json` silently does nothing until you `rm -rf ios`. That is how a device build came
  out under the pre-2026-07-27 identity long after the rename.
- **Server URL** resolves in `constants.ts` as `extra.serverUrl` → Expo's dev `hostUri` →
  `localhost:8787`. A dev build on a physical device therefore reaches your Mac
  automatically. Note `hostUri` reflects HOW the dev client connected: launch the
  simulator against `localhost` and it resolves to `127.0.0.1`, which is correct but does
  NOT exercise the device path — relaunch against the LAN IP to test that.
- **`expo run:ios` needs a UTF-8 locale.** Without `LANG`/`LC_ALL` set, CocoaPods
  crashes in its own error reporter with `Unicode Normalization not appropriate for
  ASCII-8BIT`, which reads like a broken CocoaPods install and is not — it prints the
  real cause ("CocoaPods requires your terminal to be using UTF-8") one line above the
  stack. Run `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios`.
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
  exact: it works on YUV planes in limited range, so everything uses **BT.601**
  coefficients, not Rec.709 (709 put `mono` 39/255 off; 601 puts it 3 off).
- **`eq` is modelled where it actually runs, on the YUV planes** (`gradeMatrix` in
  `packages/video/src/filters.ts`, 2026-07-28). Contrast and brightness go over luma,
  saturation over chroma, and because every step either side is affine the whole chain
  collapses into ONE 4×5 colour matrix — which is what both previews apply (web as an SVG
  `feColorMatrix`, mobile as Skia `<ColorMatrix>`; mobile mirrors the function because it
  cannot import the package). It replaced per-channel RGB contrast/saturation, which
  agreed on mid-tones and diverged badly on saturated colour.
- **How far off, measured against a real MP4 (2026-07-28).** Flat-colour clips rendered by
  `frameStateAt` + `renderFrame`, exported through `/v1/render`, frames pulled back with
  ffmpeg and probed at the same timestamps. Ungraded clips and the fade-through-black
  transition agree to **≤2/255** — timing, alpha ramp and geometry are effectively exact.
  The grade now lands **≤6/255 for every preset except `vivid`, which reaches 10** on
  saturated colour; before `gradeMatrix` the same sweep was as bad as **25** (film on a
  saturated red). What is left is a systematic ~2–3% and it is not worth chasing: we are
  handed the decoder's 8-bit RGB and have to reconstruct the chroma ffmpeg graded, so a
  rounding step comes back multiplied by the saturation and again by the chroma→blue gain.
  Assumes BT.601 limited range; nothing in either preview can see the stream's tagging.
  Do not re-assert that the grade is byte-identical; it is not.
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
- **Home's signature is "the bench"** (2026-07-28) — the six start formats drawn to ONE
  scale (`--bench-h` against a 1920 long edge, in `Home.module.css`) standing on one rule,
  so the row is a true proportion chart rather than six equal tiles. The proportions travel
  from JS as `--fw`/`--fh` and the scale stays in CSS, so a breakpoint shrinks frames and
  rule together. Below 680px it becomes a grid of three — NOT `flex-wrap`, which stranded a
  sixth frame on its own row — and the shared rule is dropped, since it would run under the
  first line only.
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
- **Security headers ship from `next.config.mjs`** (2026-07-29) — CSP, nosniff,
  frame-ancestors, Referrer-Policy, Permissions-Policy. `script-src` keeps
  `'unsafe-inline'` deliberately: Next's per-route inline scripts can't be hashed and
  the strict form needs a middleware nonce that makes every page dynamic — not worth it
  while no attacker-controlled HTML can reach the DOM (all three
  `dangerouslySetInnerHTML` sites render static module constants). **`'unsafe-eval'` is
  added in DEV only, and you must not remove it**: without it `next dev`'s eval-based
  chunks are blocked, the server-rendered HTML still arrives so the page LOOKS fine, but
  React never hydrates — no effect runs, no data loads, and the editor sits on an empty
  frame forever. Debugged the hard way once already.
- **`db()` handles `blocked`/`blocking`/`terminated`, and must keep doing so.** Every
  screen awaits that one promise, so a blocked upgrade (two tabs, a deploy that bumps
  `DB_VERSION`) meant they ALL sat in their loading state with no error and no timeout.
  `blocking` makes the old connection step aside; `blocked` rejects with something
  actionable. It also must not cache a rejected promise — that turned one transient
  failure into a permanently dead database for the life of the page.

`packages/video` now has subpath exports: `@orbit/video/browser` (pure, browser-safe) and
`@orbit/video` (adds ffmpeg/resvg/fs). Never import the default entry from a web bundle.

**Hand-built SVG is an injection surface** (2026-07-29). A `VideoProject` arrives as JSON
and is cast, never validated, so every field TypeScript calls a `number` is whatever the
caller sent. `font-size="${o.fontSize}"` carrying `48" /><image href="…">` made resvg read
a file off local disk into the frame — another account's upload came back as render
output. So in `packages/video`: strings go through `esc`, numbers through `num`, **colours
and font families through `col`/`fontFamily`** — and that last part is the subtle one,
because `esc` is an XML transform the parser UNDOES, so `url('/etc/passwd')` looks escaped
and decodes back to a live reference. `rasterizeSVG` then refuses any SVG containing
`<image>`/`<use>`/`<script>`/`<foreignObject>`, since nothing we build emits those.
Never interpolate a raw value into markup here.

## Web SDK commands

```bash
pnpm install && pnpm build      # turbo
pnpm test                       # vitest, tests in src/__tests__/*.test.ts
pnpm typecheck
pnpm --filter @orbit/studio dev # v2 demo
```

## Known gaps / deliberate non-features

- **Not production-ready**, but most of the blockers closed 2026-07-28/29:
  - **Storage has a seam** — `apps/render-service/src/storage.ts`. Local disk (serve
    from `/files`) is still the default; set `ORBIT_S3_BUCKET` + keys and BOTH uploads and
    rendered output go to any S3-compatible bucket instead. SigV4 is hand-rolled (no 2MB
    AWS SDK for one PUT) and pinned to AWS's own published example in `storage.test.ts`.
    A HALF-set config throws rather than falling back to disk. The media dir stays a
    byte-budgeted cache; `ensureLocal` fetches an evicted upload back before a render, so
    eviction stopped being data loss. Output urls are **presigned GETs** (6h) unless
    `ORBIT_S3_PUBLIC_BASE` is set — a private bucket otherwise handed the client 343 bytes
    of AccessDenied XML with a `.mp4` name on it. Outputs are evicted too
    (`ORBIT_MAX_OUTPUT_BYTES`); the directory previously grew until the volume filled.
  - **Renders can be jobs** — `POST /v1/render {async:true}` → 202 `{id}`, poll
    `GET /v1/render/:id`. Both clients use it and fall back if the server answers with a
    url outright. The synchronous path is unchanged for older clients. In-process
    (`jobs.ts`) by default, where `status` goes `queued`→`running` only when a render SLOT
    is actually held, so waiting behind the semaphore is distinguishable from encoding.
  - **The queue can be shared** (`job-queue.ts`) — with `DATABASE_URL` **and** non-local
    storage, jobs go in a Postgres table and every instance is also a worker
    (`ORBIT_WORKER=0` opts out), so adding a machine adds capacity. `FOR UPDATE SKIP
    LOCKED` is what stops two workers rendering (and charging for) the same job; a claim
    heartbeats, so a worker killed mid-encode has its job re-offered rather than stranding
    it in `running`. It **refuses to enable on local disk** and names the missing half:
    a worker would be handed an upload token naming a file only the receiving box has.
    Polling, not LISTEN/NOTIFY — a notification is lost if nobody is listening at that
    instant. Tested against a real Postgres; the suite skips without
    `ORBIT_TEST_DATABASE_URL` rather than passing on a stub.
  - **Deployable** — `Dockerfile` + `compose.yaml` (Postgres + MinIO). Built from the repo
    root because it is a pnpm workspace. Note `Dockerfile.dockerignore`: Docker reads
    `<context>/.dockerignore` and the context is the repo root, so a `.dockerignore` inside
    `apps/render-service/` is silently ignored and `.env` lands in the image.
    `pnpm prune --prod` does NOT work here — it strips the per-package `node_modules` a
    workspace resolves through; install with `--prod --filter` a second time instead.
  - **Shutdown is a real shutdown** (2026-07-29) — `main.ts` owns SIGTERM/SIGINT and
    ACTUALLY EXITS. Installing a listener REPLACES Node's default terminate, so the old
    handler (which only set `stopping = true`, inside the queue block) left the process
    alive until Docker's grace period ran out and SIGKILLed it — stranding whatever was
    mid-encode in `running`, owned by a worker that no longer existed, until the 15-minute
    stale sweep. Now a worker hands its claim back (`PgJobQueue.release`) and
    `killLiveRenders()` stops the encoders, because a signal reaches the SERVICE, not its
    children: ffmpeg is a separate process and survives its parent outside a container.
    `heartbeat`/`finish`/`fail` are all guarded on `claimed_by`, so a superseded worker
    cannot reach back into a job that now belongs to someone else — which is also what
    makes the shutdown ordering safe (release, then kill; the resulting `fail` no-ops).
  - **Observability** — one JSON line per request (no bodies/query: they carry upload
    tokens), and `/health` reports storage kind, queue mode, `renders.{running,queued,
    capacity}`, cluster depth when shared, and job count. `ok` stays true while merely
    busy, so a load balancer will not pull the box that is doing the work.
  - **Cloud project sync** (2026-07-29) — `projects` table + `/v1/projects` CRUD under the
    same JWT. DOCUMENTS ONLY: media travels as the `upload:` tokens a project already
    carries, so a sync is kilobytes not megabytes, and `mediaDurable` is reported because
    on local disk an evicted upload is really gone. Guests are refused (403 `kind:guest`)
    — no password means the identity dies with the app's storage. Conflicts are LWW by the
    client's `updatedAt`, resolved inside one `INSERT … ON CONFLICT … WHERE` so there is no
    read-then-write window, and a stale write gets 409 WITH THE WINNER so the client keeps
    both rather than dropping the edit. Deletes are tombstones; an absent row is
    indistinguishable from one a device has never synced. Both clients reconcile with the
    SAME rules — divergent clients against one server is a data-loss bug waiting to happen.
    **Three rules the first pass got wrong** (fixed 2026-07-29, regression-tested in
    `apps/mobile/src/net/__tests__/syncClient.test.ts` against a fake server reproducing
    the store's LWW semantics; each fix mutation-checked):
      1. **Never push back what the pull just wrote.** `since` is still the OLD watermark
         while the push runs, so a freshly-pulled project looked like a local edit and went
         up at the exact timestamp it came down with. The server refuses an equal timestamp
         — correctly, for two real writers — the client read 409 as "both sides changed",
         and a first sync duplicated EVERY project, compounding into names like
         `Video (this browser) (this browser)`.
      2. **A pulled project keeps the SERVER'S `updatedAt`.** Web's `saveProject` stamped
         `Date.now()` unconditionally, so the copy just pulled looked newer than the one it
         came from and bounced back — two devices trading one unchanged document forever.
         Mobile already preserved it; that divergence is what this note warns about.
      3. **A pull must not overwrite a local edit.** It did, silently, and it ran BEFORE
         the push-side 409 handler written to prevent exactly that, so "keep both" was
         nearly unreachable. `local.updatedAt > since` is what "edited here since the last
         successful sync" means, and it is the only signal that the copy about to be
         replaced is not merely an older download.
    **The copies it already made** are cleaned up from Account → Sync
    (`apps/web/src/db/duplicates.ts`). The rule is narrow on purpose, because being wrong
    deletes someone's work: a project goes only when it carries the machine suffix AND is
    byte-identical to a survivor AND their base names match. Content alone is too loose —
    three projects from one preset are identical while being three different things, and
    their names are all that separate them. The fingerprint sorts keys at every level,
    since a round-tripped project came back from `jsonb` with its key order changed and a
    plain `JSON.stringify` comparison would clean up nothing.
    **A failed delete is remembered and retried** before the next listing, on both clients.
    `syncDelete` used to catch only a THROWN error, so a 500 or an expired session answered
    it successfully; and an absent tombstone is indistinguishable from a project the server
    was never told about, so the next full pull handed it straight back.
  - Still open: purchase config, social login.
- Per-clip audio: the **legacy concat path drops it** (`buildFFmpegArgs` concats with `a=0`,
  `ffmpeg.ts:254`) — only a lone clip's original audio plus `project.audio` mix there. The
  **multi-track path does NOT**: `buildMultiTrackArgs` gives every visual clip's stream its
  own `atrim` → `adelay` → gain chain into the same `amix` as the audio tracks. Both web and
  mobile send `tracks`, so no current client hits the lossy path. Corrected 2026-07-28 — the
  note here read as a live gap for months and was not one.
- Genuinely not built, with reasons: **speed ramping** (ffmpeg can't smoothly ramp audio
  tempo, no faithful preview — constant per-clip speed IS shipped), **keyframe
  scale/rotation** (scale can't animate per-frame in ffmpeg).
- **Captions export as `.srt`** (2026-07-29) — `packages/video/src/srt.ts`, mirrored into
  `apps/mobile/src/model/editor-ops.ts` with `__tests__/srt.test.ts` comparing the two
  OUTPUTS. EVERY text overlay travels, not just the `caption-` prefixed ones: the prefix is
  bookkeeping so a re-transcription knows what it may replace, not a category anyone chose.
  Cues are sorted by TIME (overlays are stored in layer order, which runs backwards), blank
  lines inside text are collapsed (a blank line is what ENDS a cue in SRT — one would shift
  every caption after it), and the timestamp rounds once in integer milliseconds because
  rounding the parts separately prints `00:00:60,000`. Overlaps are left alone: SRT permits
  them and silently retiming someone's captions is worse than a player stacking two lines.
- Story and some editor preferences are incomplete.

## Working style

- Commits: short imperative subjects with a scope, e.g. `mobile: refine AI studio UI`,
  `fix(editor): …`.
- The user hits usage limits fast — be efficient: don't re-read what's already established,
  don't narrate options, act once you have enough to act.
