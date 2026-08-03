# Orbit — project context for Claude

Read this first. It exists so the user never has to re-explain the project.

## What Orbit is

Open-source, embeddable, white-label **design-canvas editor SDK** for **image + video**,
with an agentic (AI) layer. Inspired by **Polotno SDK** and **Canva**. Targets React,
Next.js, and React Native.

**Current focus: a native mobile video-editing app (`apps/mobile`), modelled on the VN
Video Editor app.** That is where nearly all active work happens.

**One brand, settled 2026-07-31: Layera Labs is the org, Orbit is the product.**
`github.com/Layera-Labs/orbit`. The SDK is Orbit SDK and the app is Orbit — not two
names. Naming the SDK **Galaxy was considered and rejected**: Apple's identifier
namespace is global and another team holds `com.galaxy.*` (see the bundle-id note
below, which cost a rename), Samsung owns the mark in exactly this space, and the
codebase is `@orbit/*` down to storage keys, `ORBIT_JWT_SECRET`, the `.orbit` CSS
scope and the bundle id. Don't re-open it.

Source-of-truth docs: [docs/roadmap.md](docs/roadmap.md),
[docs/architecture-v2.md](docs/architecture-v2.md),
[docs/feature-status.md](docs/feature-status.md) (audit, 2026-07-26),
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
- **A caption's `x` positions it, and on mobile it did NOT** (fixed 2026-08-02). The
  preview's caption layer spanned the full width and centred its text, so `o.x` moved
  nothing on screen — while `overlay-svg.ts` has always anchored the text at
  `width * o.x`. Dragging a caption sideways therefore appeared to do nothing AND moved
  it in the exported file, and a caption placed off-centre anywhere else came back
  centred here. The offset goes on an INNER view, because the outer one carries the
  Ken-Burns `transformOrigin` expressed in its own box — translate that box and the zoom
  pivots about the wrong point. Verified on device with three captions at
  `x = 0.12/0.5/0.88` and the three alignments; each lands on its anchor.
  **`y` is the caption's TOP**, so it is clamped against the layer's MEASURED height
  (`onLayout` into a ref): clamping the anchor to 1, as it used to, let you drag the text
  until only its first pixel row was on the canvas and then off it entirely. A PiP clamps
  against its `rect`; a caption has no box in the model, since its height depends on the
  font, the string and where it wraps.
- **Nothing that moves under a finger writes the store per frame** (2026-08-02). The
  trim handles were fixed for this long ago; the CLIP MOVE and every preview drag were
  not, and each one called `apply` on every pointer event — which clones the project,
  re-renders the preview, the timeline and the editor chrome, and queues a save and a
  sync. The dragged thing trailed the finger by several frames, so you kept moving to
  catch it up and pushed a caption off the canvas. All of them now hold the geometry in
  LOCAL state and write once on release: `Timeline`'s `moveGeom` beside `leftGeom`/
  `rightGeom`, and `Preview`'s `textAt`/`rectAt`/`effectAt` feeding `liveText` and `live`
  (which grew `mosaic`/`magnifier` so a dragged region rides there too). One write is
  also one undo step. The clip move's live neighbour re-packing is the price — Quick mode
  now settles them once, on release, which is the right side of that trade.
  **A `simctl` touch path cannot drive the timeline's `bodyPan`** — `blocksExternalGesture`
  inside the horizontal ScrollView needs real UIKit touch arbitration. Verified by A/B:
  the OLD handler does not move the clip under the same synthetic path either, so a null
  result there is the harness and not the code. The preview drags DO respond to it.
- **`SelectionActionBar` follows the clip.** Its actions branch by track kind + clip type
  (video / image / audio / caption / sticker); it used to show one set for everything and
  explain the dead ones with an alert. It is positioned from state that already exists —
  scrolling the timeline IS setting the playhead, so the scroll offset is
  `playheadSec * pxPerSec` and the clip's on-screen centre needs no plumbing out of
  `Timeline`. Vertically it sits **ABOVE its own lane, always** (2026-08-01). It used to drop
  below when it could not fit above, which is exactly what happened on the MUSIC
  lane — the top one, where `laneTop - BAR_H` goes negative against a `RULER_H` of
  22 — so the bar for a music clip appeared on the text lane and read as belonging
  to it. Asked for four times now. It is clamped to 0 rather than allowed
  negative, which would put it over the transport's play and undo buttons; on the
  top lane that means it overlaps the ruler and the first few pixels of the lane's
  own strip, which is a deliberate trade against appearing over a different lane. It is rendered
  INSIDE the timeline's vertical scroller, from `selLane` (`RULER_H` plus each lane and its
  `LANE_GAP`), so it travels with the lanes; positioning it from `EditorScreen` would mean
  plumbing that scroll offset back out. It previously cleared the WHOLE timeline, which put
  the bar for a clip on the fourth lane at the very top of the screen with nothing tying the
  two together — the user asked for it on its lane three times. `BAR_H` is a stated constant
  because the bar is absolutely positioned and contributes no height for a percentage to
  measure against, and `ITEM_H` is stated separately: the slot sits INSIDE the padding, so
  the old `height: BAR_H - 2` double-counted it and the bar ran 8pt taller than the number
  placing it.
- **A clip's level has ONE writer, because a curve overrides `volume`** (2026-07-31).
  `clipGainAt` and `ffmpeg.ts` both read `volumeCurve` INSTEAD of `volume` when one is
  set — deliberate, and the reason `withFades` writes the plateau into both. But the
  Volume panel wrote `volume` alone, so on any clip carrying a fade it moved a number no
  renderer reads: set a fade, drag Volume to 200%, and the export came back at 100% with
  nothing to say why. Both controls go through `withVolume` (`model/audio-fade.ts`) now,
  which moves a recognised fade's plateau, SCALES a hand-drawn curve (flattening someone's
  duck to obey a slider would destroy work to honour it), and drops a curve that is silent
  throughout. Measured after the fix against ffmpeg 8.1.2: a faded clip at 200% renders
  **+6.00 dB** over the same clip at 100%. `setClipVolumeCurve` clamps points to the same ceiling as
  `setClipVolume` — unclamped, a curve point was the one way to store a gain the UI could
  neither show nor undo. **`MAX_VOLUME` (`model/audio-fade.ts`) is that ceiling and the
  ONLY place it is written**: both ops, all three volume sliders and the waveform's scale
  read it. It is **5 (500%) since 2026-08-01**, up from 2, because quiet source material
  needs more than +6 dB. ffmpeg's `volume` multiplies and lets the result hard-clip, which
  is the honest behaviour and means the top of the range is a tool for quiet audio.
  The waveform's height scale became a **square root** in the same change: linear at a
  ceiling of 5 would put unity at a fifth of the lane and draw ordinary audio — nearly all
  audio — as a stripe along the bottom. Sqrt keeps unity at ~45%, puts 2x at ~63%, and
  still lets 5x reach the top; it also lifts very small gains, so a fade's last bar no
  longer lands on `FLOOR_H`.
- **A slider must not write the store on every touch event** (2026-08-01). Dragging the
  volume slider threw "Maximum update depth exceeded" and the knob trailed the finger —
  one cause, two symptoms. Three parts, all in `VSlider`/`sliderValue.ts`, and each is
  load-bearing: values are QUANTIZED and an unchanged one is not reported (default grid
  1/200 of the range; volume passes `step={0.05}` for 5% snapping) — and `quantize`
  rounds off float fuzz, because `0 + 3*0.05` is `0.15000000000000002` and the dedupe
  compares with `===`, so without it nothing is ever deduplicated; reports are coalesced
  to **one per frame** with a guaranteed flush on release, so a fast swipe crossing every
  bucket still cannot storm; and the knob is drawn from the FINGER while it is down, not
  from `value`, which is what removes the round-trip lag. The gesture object is also built
  ONCE behind a config ref — inline, `GestureDetector` re-attached on every render and a
  handler that sets state re-rendered into another new gesture.
  The other half of that crash was in the store: **every `applyClip*` action re-selected
  its clip with a FRESH object** (`set({ selected: { trackId, clipId } })`), so `selected`
  changed identity on every gesture frame and every consumer re-rendered and every
  `useEffect` keyed on it re-ran, for a value that had not changed. `reselect(set, get, …)`
  is now the single writer and no-ops when the same clip is already selected.
- **The volume slider shows its scale and detents onto 100%.** `ticks` draws a mark every
  N value units (volume: every 50%) and `defaultValue` draws a taller one at the level the
  control normally sits at — and the finger SNAPS onto it within `DETENT_PX` (6), so the
  mark is something you can aim at rather than a decoration. The radius is deliberately
  small: at 5% steps on a ~300pt track a step is ~3pt, and a greedy detent would make 90%
  unreachable. `tickValues` refuses to draw more than `MAX_TICKS` (40) — past that a scale
  stops saying where you are and becomes texture — and carries an epsilon, because
  `5 / 0.5` is `9.999999999999998` and a plain floor drops the mark on 500%.
- **Apply-to-all exists twice, and they are separate actions on purpose.**
  `applySoundToAll` (Sound lane) takes only video clips and carries mute;
  `applyAudioVolumeToAll` (`AudioClipSheet`) takes every clip on ONE audio track and moves
  the level only. Both go through `withVolume`, so a clip carrying a fade has its plateau
  moved rather than being flattened. Both name their scope and their count in a
  confirmation — a project can hold more than one audio track, and relevelling one the
  user was not looking at is how a mix gets lost.
- **The percentage beside a volume slider is a typed field** (`PercentField`). 0–500% in
  5% steps, and it commits on blur, on Done **and on unmount** — a number pad has no
  return key, so tapping the sheet's ✓ or the backdrop tears the field down without ever
  blurring it, and without that flush a typed number is silently discarded. It never
  commits per keystroke: "1" on the way to "150" is a real value that would drop the clip
  to 1% and rescale a fade's curve to match. `parsePercent` REFUSES an empty or
  unparseable field rather than coercing — `Number("")` is 0, and reading a cleared field
  as "mute" is not helpfulness.
- **Mute is a flag, and the Sound lane is now a control.** `clip.muted` is what both
  previews and the export read; muting used to write `volume: 0` and unmute used to
  write 1, so a clip you had at 40% came back at 100% with the number gone.
  `ops.setClipMuted` sets the flag and leaves the level alone. Tapping a block on the
  Sound lane selects the main clip it mirrors and opens `SoundVolumeSheet` — mute,
  volume, and an Apply-to-all that names its scope (that track's clips with their own
  sound; music and voiceover keep their own controls). NOTE: an RN `Switch` does not
  respond to `simctl`-injected taps, so verify a toggle by driving the store from a
  `TEMP-VERIFY` hook and screenshotting the result, not by tapping it.
- **The preview's audio is a real Web Audio graph, for gain above 1** (2026-08-01).
  It used to be `expo-audio`, whose `player.volume` is a **0–1 property that saturates
  in the native player** — so a clip at 200% (or 500%, once `MAX_VOLUME` moved) sounded
  exactly like 100% here while ffmpeg rendered the real boost. `react-native-audio-api`
  gives a `GainNode` whose `gain` is unbounded, so `audioGraph.ts` no longer clamps.
  **It is a native module: `app.json` registers its config plugin and a rebuild is
  required.**
  The swap forced a different shape and this is the part to understand before touching
  it. An `expo-audio` player can SEEK, so the old graph held one open per clip and
  re-positioned it every tick. A Web Audio `AudioBufferSourceNode` **cannot** — it is
  one-shot, started once with an offset and a duration and immovable after. So the graph
  **ARMS**: on play, and again whenever the playhead jumps further than
  `REARM_TOLERANCE_SEC` (0.25s) from where the running sources would have carried it.
  That tolerance is deliberately generous — re-arming stops and recreates every source,
  which clicks, so frame jitter must never trigger it. The arithmetic lives in
  `preview/audioSchedule.ts` and is unit-tested there, because nothing about the graph
  itself can be tested off-device. Decoded buffers are cached by uri across voices AND
  mounts; a decode failure caches as `null` so it is not retried every sync.
  `expo-audio` is still used elsewhere (recording), so it stays installed.
- **Export**: upload local media → `POST /v1/upload` (`upload:<id>` token) → resolved project →
  `POST /v1/render` → download MP4 → save to Photos. The server's `resolveSrc` only maps tokens
  to files in its media dir and rejects non-token/non-URL srcs (clients can't point ffmpeg
  at arbitrary paths).
- **An `upload:` token is NOT durable, and both ends now say so** (2026-08-01). The media dir is
  a cache with a byte budget, so eviction, a redeploy onto a fresh volume or simply changing the
  render server all leave a client holding tokens that name nothing. `/v1/render` checks every
  token BEFORE taking a render slot and answers **409 `{code:'missing_uploads', missing:[…]}`**
  — after `ensureLocal`, so with a bucket behind the cache "missing" means genuinely
  unrecoverable. Left to ffmpeg this arrived as `No such file or directory` out of a half-built
  filtergraph, which a client cannot act on. Mobile's `uploadCache` is keyed by **server AND
  file** (it was file only, so dev-Mac tokens got sent to production) and `exportProject` retries
  **exactly once** on that 409, having forgotten the named tokens, so the second pass re-uploads
  only what went missing. One retry, because a second failure is real and must surface.
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
- **`ensureTracks` used to return early and strand the legacy `audio` array** (fixed
  2026-08-02). `if (p.tracks?.length) return p` — so a project that had tracks AND a
  non-empty `project.audio` kept its music somewhere NOTHING reads: `previewAudioOf`
  walks tracks only, and `buildFFmpegArgs` routes to the multi-track builder the moment
  `tracks` is defined. Silent in the preview, absent from the export, no lane on the
  timeline. `adoptLegacyAudio` folds those clips onto the audio track and EMPTIES the
  array — which the v1 migration itself failed to do, so it copied the music into a
  track and left the original behind, which is one of the two ways a project reaches
  that state. The fold is keyed on clip ID for exactly that reason: appending blindly
  would give every already-migrated project its music twice, at the same moment, summed
  (`amix` does not normalise).
- **The audio library heals like the gen library, and it did not used to** (2026-08-02).
  `audioHistory.ts` returned its records verbatim — no rebase, no existence check — one
  file over from `genHistory.ts`, which has both. Two reports came out of that single
  gap, and neither surfaced where it happened: a stale container path added a SILENT
  clip (the project's own rebase heals it on the next open, so the track came back after
  an app restart, which reads as "sometimes it just does not play"), and a file a
  reinstall had really deleted stayed listed as available until the far end of an export
  said `this media is no longer on the device: x.wav`. A dead record is DROPPED rather
  than greyed out: a record is its file, an upload has nothing to re-download, and a row
  that cannot be used invites the tap that fails four screens later.
- **A failed audio decode is retried, and is no longer sticky for the life of the
  process** (2026-08-02). `audioGraph` cached a failure as `null` forever, reasoning that
  a file which will not decode now will not decode on the next tick. True of a corrupt
  file, false of an absent one — and absent is the case that happens. Retrying is cheap
  because `sync` is driven by EDITS, not by the tick; `MAX_DECODE_ATTEMPTS` is what bounds
  the genuinely corrupt file. It also `console.warn`s now: a silent track with the
  transport running and the waveform scrolling over it is the hardest thing here to
  report, because nothing admitted it had happened.
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
- **The canvas frame is a MAT, and the shape is the whole design** (2026-07-31).
  `CanvasFrame` on the project — one required `color`, a `width` band and an optional
  `radius`/`opacity`, all fractions of `min(W,H)`. It renders as one rectangle with a
  rounded-rect hole punched out, filled even-odd, because every renderer has a
  first-class primitive for exactly that: an `evenodd` path in SVG (export + web) and
  `<DiffRect>` in Skia (mobile). `color` is REQUIRED because an opaque MP4's corner
  wedges must be filled with something; filling from the background does not survive —
  a gradient would have to be duplicated and kept in sync, and an image cannot be
  embedded at all since `assertNoExternalRefs` forbids `<image>`. The UI seeds the
  colour from a solid background instead, so the common case still looks like corners
  revealing the background. **Rounding the corners rounds the CARD** (2026-07-31):
  `outerRadiusPx` is concentric — radius plus band — and the wedges outside it are
  painted by `frameOuterPaint`, which reduces any background to a colour or the same
  gradient the base layer uses (`gradientEnds` is shared, so the corners cannot drift
  from the page behind them). It is 0 when `radius` is 0, so a frame authored before
  this still renders exactly as it did. A PHOTO background resolves to BLACK in all
  three renderers — no rasterized SVG can carry a photograph, and reproducing it would
  mean a masked second overlay of the base in ffmpeg plus a clip in two preview
  compositors; leaving the outer edge square instead was considered and fixes nothing
  for the person who asked for a rounded card. The web needed no change: it draws the
  same SVG. **Three placement rules in `ffmpeg.ts`, all of which look
  nearly right when broken**: the input is appended LAST (indices come from `idx++`, so
  inserting earlier repoints every clip at the wrong file); the overlay goes after the
  last caption; and it goes BEFORE the output tail, or `scale` quarters the band's
  thickness at 4K and `HDR_CONVERT_FILTER` leaves its Rec.709 colours tagged PQ BT.2020
  without conversion. Radius is clamped once in `canvasFramePx` — SVG, `ctx.roundRect`
  and Skia's `RRectXY` all resolve an over-large one differently. `even()` is
  deliberately NOT used: that is for H.264 chroma subsampling on scale/crop dims.
  On mobile the mat is its OWN `<Canvas>` layered after the captions, because captions
  are RN `<Text>` outside the Skia canvas and would otherwise cover a frame the export
  draws over them.
- **Mobile's gradient BACKGROUND was drawn at the wrong angle** (fixed 2026-07-31).
  `BackgroundFill` built its line from `cos`/`sin` of the raw angle while the export
  and the web use `dx=sin, dy=-cos` in normalized coords, so the default 180deg ran
  RIGHT-TO-LEFT in the preview and top-to-bottom in every export. A two-stop gradient
  looks plausible from either end, which is why it survived. `src/preview/gradient.ts`
  mirrors `gradientEnds`; `__tests__/gradient.test.ts` compares the two.
- **Element animation is fade and slide, and deliberately nothing else**
  (`packages/video/src/element-anim.ts`, 2026-07-31). `animateIn`/`animateOut` on every
  visual clip AND every text overlay. Built in the `curve.ts`/`keyframes.ts` shape — a
  JS sampler plus the same function as an ffmpeg expression — and the fade is NOT a
  second ramp: `animWindows` returns a `ClipFade` and `elementFadeAt` delegates to
  `fadeFactorAt`, so it is provably the transition's curve on a different window.
  **No scale**: ffmpeg cannot animate it per frame, and an option that only worked in
  the preview is the drift this repo refuses. Three things learned the hard way:
  `hasFade(anim)` must join the `yuva420p` condition at `ffmpeg.ts`, because that
  format is otherwise chosen from the TRANSITION fade alone and `fade=alpha=1` on a
  stream with no alpha plane does NOTHING; `slideExpr` must `clip(…,0,1)` its progress,
  since an `if`-window leaves the ramp unbounded below `start` where it exceeds full
  travel (caught by the numeric agreement test, which is a bar `keyframes.ts` has never
  been held to); and slide is REFUSED on a blended clip in all three renderers, because
  the blend path crops the base region under a fixed-size box. `TextOverlay.animation`
  is absorbed by `resolveAnim` rather than migrated — stored documents are never
  rewritten, and a legacy `'fade'` still produces a byte-identical graph.
- **A transition is an OVERLAP, and the export is an `xfade` chain**
  (`packages/video/src/xfade.ts`, 2026-08-02). A transitioned clip starts `overlap`
  seconds before the one before it ends, so the project gets **shorter** by the sum of
  its transitions — the one-time `migrateTransitionOverlap` (`schemaVersion: 3`, mirrored
  on both clients, run on open) moves the main track and then moves every caption, music
  cue and PiP by the shift accumulated at ITS OWN start. **Geometry is authoritative for
  timing, `transitionIn` for intent**: `requestedOverlap` is the only thing that turns a
  stored duration into a `start`, and `resolveTransitions` reads `prevEnd - nextStart`
  back out, so a clip dragged after the fact cannot leave the export doing something the
  timeline does not show. Both clamp to `MAX_OVERLAP_FRAC` (half the shorter clip).
  The model's `TransitionType` values are **ffmpeg `xfade` tokens verbatim** — no house
  vocabulary to keep in step — and `TRANSITIONS` is the one catalogue, read by both
  pickers. `dissolve`/`wind`/`slice`/`distance`/`fadegrays` are deliberately absent: no
  exact canvas-2D and Skia reproduction, so offering them would break the no-drift rule.
  Four things measured against ffmpeg 8.1.2, not reasoned about:
  - **A `fade` needs no `xfade` filter at all.** With the clips overlapping, drawing B
    over A at alpha `p` IS `p*B + (1-p)*A` — measured at `127 0 127` between red and blue
    at p=0.5. So `isAlphaOnly` keeps fades on the ordinary per-clip path, `planMainRuns`
    builds runs only for the geometric families, and every project that predates them
    emits a **byte-identical** filtergraph. It is also what lets a blended clip keep its
    transition, since a blend reads the canvas under it and a run has no such canvas.
  - **The incoming clip must NOT be alpha-ramped inside a run.** `xfade` is doing the
    work; ramping as well hands it a half-transparent picture. Measured **252/255** away
    from the transition asked for, on every geometric family at once, from a graph that
    reads as obviously correct.
  - **`offset` comes from the clip's own start, never from an accumulator.** Summing
    `dur - overlap` is equal only while the resolver's clamp does not bite, and diverges
    silently when it does. Taking it from geometry is also exactly what `frameStateAt`
    uses.
  - **A run is padded onto a transparent full-canvas frame, in rgba.** `xfade` demands
    two streams of identical size and a clip is only as big as its `rect`; `pad=` is
    cheaper and rejects the negative offsets rotation and keyframes produce. rgba rather
    than `yuva444p` (which ffmpeg would silently insert anyway) because the blending
    families then mix in the space both previews mix in. No `shortest` on the pad
    overlay — the pad is the main input and defines the length, so a source that runs out
    early cannot shorten the stream every later `offset` addresses.
  `__tests__/xfade-probe.test.ts` (gated on `ORBIT_FFMPEG_PROBE=1`) probes all 35 tokens
  with **coordinate-ramp inputs** — A is `(x*4, y*4, 64)`, B is `(64, x*4, y*4)`, so every
  output pixel names its own source and a translate, a scale and a clip are directly
  readable; flat colours cannot tell `slideleft` from `revealleft` at all. It writes
  `fixtures/xfade-probe.json`, which an always-on test asserts against with no ffmpeg.
  **The fixture is a claim about ONE ffmpeg**, and the render server does not run that
  one: its image installs Debian's, so `node:20-bookworm-slim` gives **5.1**, by
  construction and not by neglect. `packages/video/scripts/xfade-verify.mjs` is the
  answer — dependency-free, runs inside the service's own container, re-measures the bare
  filter and diffs it against the fixture. Run it after any base-image change:
  `scripts/orbit-render verify`.
  Recorded there: the real filtergraph agrees with the bare filter to a **mean under 4**
  everywhere, with a **max of ~108 on the sliding families** — that is what compositing a
  hard edge in 4:2:0 costs on the one boundary column, the same price every other layer
  in this engine already pays, and it is why the assertion is on the mean.
  **`XfState` is the preview's half**, and it is per-SIDE: each clip's `DrawOp` carries
  its own already-resolved geometry (`op.xf`), so no compositor ever needs to know about
  the other clip. The transition's ALPHA is folded into `op.alpha` rather than duplicated,
  so the presence of `op.xf` is itself the answer to "does anything special happen here" —
  a fade arrives with no `xf` at all. **Wipe×4, Slide×4, Push×4 and Reveal×4 have landed**
  (2026-08-02) — sixteen variants verified against ffmpeg pixel for pixel, because none of
  them resamples and so none has a tolerance to hide in. `clip` is a rectangle in the units
  of whatever canvas `xfadeStateAt` was handed, so `frameStateAt` resolves it in PROJECT
  pixels and the Skia preview in its own on-screen size, and each surface's edge lands on a
  real pixel. `dx`/`dy` are a whole-CANVAS travel, not a nudge to the clip's box — the
  export slides the padded full-canvas frame, so a picture-in-picture travels as far as a
  full-frame clip does. **Translate after clipping, never before**: the region is the part
  of the canvas this side owns and the travel is the picture moving inside it; one
  transform carrying both drags the window along and reads as a cut. Web applies it on the OUTER context around the
  blit and mobile on the outer `<Group>` — the seam rotation already uses — because a wipe
  cuts the FRAME, not the clip: a picture-in-picture straddling the split is half gone,
  which is what the export does. **Both sides are clipped**, not just the incoming one, or
  the outgoing clip fills the holes a masked or picture-in-picture incoming clip leaves.
  Four measured details: `z` is an integer truncation and a WIPE keeps the outgoing clip on
  `<= z` while the sliding families keep it on `< z` — **the two split one pixel apart**,
  which is exactly the sort of thing the probe exists to settle and memory gets wrong; the
  window is half-open, so at `p = 1` the outgoing side is gone rather than keeping the
  boundary column for a frame; each set is two rules on two axes rather than four cases
  (`p * L` with the incoming clip low, `(1 - p) * L` with the outgoing one low); and slide,
  push and reveal share one region split and differ only in which picture travels, so they
  are one function with three answers. Reveal's region is what makes it work — the incoming
  clip holds still and its clip is what keeps the outgoing one visible ON TOP, since the
  compositor always draws the incoming one over.
  One deliberate non-reproduction: at `p = 0` ffmpeg's guard on the shifted index is `> 0`
  rather than `>= 0`, so the leading row or column takes a wrapped value for one frame in
  the variants where the outgoing clip travels. `xfade-probe.test.ts` names and skips it
  rather than porting a modulo wrap whose only effect is that stray line.
  **Sixteen of thirty-five families are still export-only** and preview as a cut — a
  preview running BEHIND the file, the tolerable direction, and unreachable from the
  pickers, which are built from `previewableTransitions()`.
  **The picker's tiles are the transitions themselves**, laid out by `xfadeStateAt` at
  `p = 0.42` rather than drawn as glyphs — so a tile cannot depict something the renderer
  does not do, and a family that lands in the renderer gets a correct tile for free.
  Found on the device rather than on paper: the four directional families split the frame
  at the SAME place at the same instant, so on flat fills their tiles are identical, and a
  dot at each picture's centre does not save it either (the arriving picture is still
  mostly off-frame that early, and its dot with it). A **diagonal corner to corner** is
  always partly visible wherever its picture sits and reads out both halves at once: wipe
  is one unbroken line, push restarts at the seam, slide is displaced AND restarts, reveal
  is displaced on the left and still reaches the far corner. The Cut tile draws no base
  fill, so the sheet shows through its seam — with one, it was a wipe tile.
  **`cover*` and `reveal*` do not exist before ffmpeg 6.1** — checked against the enum and
  the `AV_OPT_TYPE_CONST` table in `libavfilter/vf_xfade.c` at `n5.1.4`/`n5.1.6` (45 tokens,
  neither family present) and `n6.1` (both present). The render server's image installs
  Debian bookworm's **5.1.9**, so Push×4 and Reveal×4 — 8 of the 19 the pickers offer — name
  a token that build cannot parse, and the filtergraph fails to BUILD rather than rendering
  something slightly wrong. Nothing else we emit needs more than 5.1. Confirmed on the box
  with `ffmpeg -h filter=xfade`, which is also the cheapest way to ask: 45 constants ending
  at `fadeslow` is 5.1, 57 ending at `revealdown` is 6.1+.
- **Some transitions are AUTHORED — ours, not ffmpeg's** (2026-08-03). Shake×8, Flash×2
  (Blink/Light), Zoom×4 and Blur×2 name no `xfade` token at all: they are performed by the clips
  themselves on the ordinary overlay path, so `ridesOverlayPath` is true and
  `isAuthoredTransition` separates them from `fade`, which also rides that path but IS a
  token the probe fixture measures. The payoff is that **an authored family cannot be
  missing from a build** — never subtracted by the capability gate, never refused by
  `renderProject`, works against an ffmpeg with no `xfade` filter whatsoever, and survives
  on a blended clip. Each is written twice (a JS sampler for the previews, an ffmpeg
  expression for the export) with a test asserting the two agree numerically, the same
  shape `element-anim.ts` uses. Three things measured rather than reasoned about:
  - **`fade` is the wrong primitive for a ramp, and this cost a release.** The flashes
    first drew their veil with two chained `fade` filters and measured up to **64/255**
    wrong. `fade` does not ramp on the clock — it counts FRAMES: it starts at the first
    frame at or after `st`, gives THAT frame a factor of exactly zero, and steps by
    `1/round(d*fps)`. So the ramp is displaced by however far `st` sits from a frame
    boundary (at `st=0.25:d=0.25`, 30fps: half a frame out of a four-frame ramp). Anything
    whose vertices are wherever the user put the transition must be an expression in `T`,
    not a `fade`. `flashExpr` + `geq` measures **1/255**.
  - **`geq` is far too slow over a 4K frame**, so the flash's colour source is generated
    **2x2 and scaled up with `flags=neighbor`** — exact on a flat colour, and the
    per-pixel filter then runs over four pixels instead of eight million.
  - **Zoom needs `scale=…:eval=frame`**, or the expressions are evaluated once at init and
    the clip renders at a constant size — which looks like a plausible transition and is a
    still. Dimensions round to EVEN and clamp to 2 (odd is an error in 4:2:0, not a
    rounding difference), and the overlay origin is `round()`ed because `overlay`
    truncates. Measured against ffmpeg it tracks `zoomScaleAt` to ~1.5px at 128px wide —
    the even-dimension quantisation — so it carries a geometric tolerance like `squeeze`
    rather than being exact. A clip's two sides MULTIPLY rather than one being picked
    (each clamps to its own window and so returns exactly 1 outside it); a shake picks,
    because both sides displace the frame identically.
  - **Blur is the one that cannot be an expression at all.** `gblur`'s sigma is a plain
    option — settable at runtime, not evaluated per frame — so it is driven by `sendcmd`,
    one command per output frame, each stamped HALF A FRAME EARLY because `sendcmd` fires
    on the first frame at or after its timestamp (`0.0667` on a 30fps stream lands on
    frame 3, not the frame at `0.06667`). The filter instance must be NAMED per clip
    (`gblur@xf<i>`): `sendcmd` targets by filter TYPE otherwise, so one clip's schedule
    drove every `gblur` in the graph — measured, and it read as only one side blurring.
    And **`gblur` is an IIR approximation that comes out 20% NARROW**: nominal 1/2/4/8/16
    fit an effective 0.80/1.50/3.20/6.50/12.95 against a true gaussian, a flat 0.80 ratio
    that `steps` does not move. Both previews take a real sigma, so the export multiplies
    by `GBLUR_NOMINAL` (1.25); without it the file was a quarter less blurred than the
    picture the user watched. ~8/255 of shape difference remains on a hard edge, recorded
    like the grade's residual. **`hblur` is ffmpeg's and stays export-only**: its box
    reaches `1 + W/2` — half the frame — which the canvas preview affords with a
    downscaled CPU running-sum and Skia's declarative tree cannot at any viable cost.
  - **The picker's tiles are the transitions themselves**, so they have to consume
    everything `xfadeStateAt` can return. They did not, silently: `mask`, `hole`, `scale`,
    `block`, `blur` and the separate veil op all arrived after the tile was written, and
    every family whose whole effect lived in one of them drew as a plain cross-fade —
    twenty-one tiles identical to Fade at the worst point. `transition-tile.test.tsx`
    renders every offerable tile and compares markup, because each one is individually
    plausible and nothing catches a duplicate by looking. SVG has no shader, so a mask is
    sampled onto a 10x10 lattice (`xfadeMaskGrid`) and `pixelize` quantises the picture's
    own marks to the block grid — one sample per block at its centre, which is what
    ffmpeg does.
  `fixtures/xfade-field.json` is regenerated by `xfade-field-probe.test.ts`
  (`ORBIT_FFMPEG_PROBE=1`), which re-measures every family and refuses to write if a
  previously-recorded one does not come back — for a while the fixture existed and the
  script that made it did not. Its family set is DERIVED from what each transition does,
  because flat sources cannot see a displacement: a shake would record a row there that
  agreed with any implementation at all. Authored families carry a tolerance of **2**
  where the rest carry 1, and the extra byte is the path (4:2:0 `overlay` with a per-clip
  `fade` crossfade), not the family.
- **So a transition is gated on what the SERVER's ffmpeg has** (2026-08-02), which matters
  beyond this one box: Orbit is self-hostable, so every deployment brings its own ffmpeg.
  `/health` reports `capabilities.transitions` from `ffmpegXfadeTokens` (cached per binary,
  like the HDR probe), both clients cache it per server URL, and the pickers are built from
  `previewableTransitions(tokens)`. `parseXfadeTokens` keys on the INTEGER column of the
  option dump, because that is what separates an enum constant from an option — so
  `duration`, `offset`, `expr` and `transition` itself fall out without being named, and a
  future ffmpeg can add options without being misread. `custom` is excluded: it takes a
  per-pixel expression and counting it would make a build look capable of a family it has
  no code for.
  **Unknown means OFFER it — the opposite of the HDR gate, deliberately.** HDR hides when
  unprobed because offering it yields a file whose tags lie and the cost of hiding is one
  checkbox; here the editor has to work with no server reachable at all, and emptying the
  picker in aeroplane mode would be worse than the case it guards. So an empty list
  subtracts NOTHING, on both clients and in both the picker and the service. The second
  line of defence is `renderProject`, which resolves the main track and REFUSES by name
  before taking a render slot. Refused rather than substituted: a push is not a slide (a
  slide moves both pictures), so silently swapping one would hand back a file that does not
  match the timeline the user watched — the same class of lie as an HDR tag on SDR pixels.
  `render-transition-gate.test.ts` proves the chain against a shell shim that prints a real
  5.1 help dump, rather than mocking the probe, because it is the spawn and the parse that
  have to work; it asserts both directions, since a gate that refused everything would pass
  the obvious test while breaking every export.
  This is also what `xfade-verify.mjs` was written to catch and its `FAIL` branch is exactly
  this case — but note it is COPIED INTO the image at build time, not bind-mounted, so it
  cannot be run against a deployed container without a rebuild. `-h filter=xfade` can.
  What was measured about the sixteen, so it is not re-derived.
  **Read the C, do not port it from GLSL habit: ffmpeg's own `mix(a, b, t)` is
  `a*t + b*(1-t)`, the REVERSE of GLSL's, and its internal `progress` runs 1 → 0**
  (`progress = 1 - (pts - first - offset)/duration`, `vf_xfade.c:1932`), so `P = 1 - p`.
  Get either backwards and every formula below silently inverts.
  `fadeblack` is a NESTED mix, not a sum —
  `mix(mix(A, bg, ss(0.8, 1, P)), mix(bg, B, ss(0.2, 1, P)), P)` with
  `ss = smoothstep` — which is asymmetric (at `p = 0.5` it is already 34% B against 66%
  black), and it needs an answer about what the run's ALPHA does through the dip before a
  third full-frame op can be right. An earlier note here recorded a two-term sum for it,
  guessed from probe output; it is wrong, and the C is the answer.
  `circleopen` is `smoothstep(0, 1, hypot(x - w/2, y - h/2)/hypot(w/2, h/2) + (P - 0.5)*3)`
  — note the **integer** `w/2` (a half-pixel offset on odd dimensions) and the 3× ramp,
  which means it is over by `p ≈ 0.83` and has not started before `p ≈ 0.17`.
  **Seventeen of those landed on 2026-08-03** and the pickers now offer **34 of
  36** — Black, White, Circle×2, Blinds×4, Diagonal×4, Squeeze×2, Zoom and Radial
  joined the geometric set. Every one was read out of `vf_xfade.c` and then
  measured back: **all exact to ≤1/255**, recorded in
  `fixtures/xfade-field.json` and asserted with no ffmpeg by `xfade-field.test.ts`.
  **Eleven of them are ONE shape** — the incoming clip drawn over the outgoing one
  through a `smoothstep` of a scalar field — so `XfMask` DESCRIBES the field
  (`radius|absx|absy|prod|angle`, a sign, a bias) and `xfadeMaskAt` samples it;
  web builds a small bitmap and Skia runs one `RuntimeEffect` over the same
  description, so a twelfth family that fits the shape costs a table entry and
  nothing in either compositor. The rest needed channels, not fields: `scale`
  about the CANVAS centre, `hole` (squeeze is the one family where ffmpeg puts
  the OUTGOING clip on top — punching the band out of the incoming side is the
  same picture without reordering layers, `invertClip` on mobile and `evenodd` on
  web), `block` and `blurX`. Black/White emit a **third op** between the clips.
  Two probe traps worth remembering, because both produce a confident lie: a
  `-vf` after a complex filtergraph FAILS, and empty buffers compared as `NaN`
  report every family exact; and `p` must be DERIVED from the frame index, since
  asking for `p=0.25` at 30fps samples 0.2667 and reads as a **49/255** error in
  correct maths. **`pixelize` and `hblur` are still export-only** — both render in
  the export and in the canvas-2D preview, neither in Skia. `hblur` is the hard
  one: ffmpeg's is a FORWARD box filter, so it DISPLACES the picture by half the
  box as well as softening it, and a centred gaussian of the same width sits
  visibly in the wrong place.
  `squeeze*` scales and therefore RESAMPLES,
  so it needs a recorded tolerance like the grade rather than an exact rule; `zoomin` is a
  scale AND a blend that only starts near `p = 0.53`; `circle*`, `vert*`, `horz*`, `diag*`
  and `radial` want gradient masks; `pixelize` and `hblur` are resampling filters.
- **BYOK stock media**: Orbit is a developer/SDK product, so Unsplash/Pexels use
  **bring-your-own-key**, stored in the OS keychain via `expo-secure-store`, never in the
  bundle and never sent to Orbit's server. `src/content/{keys,stock}.ts`, `KeysSheet`.
- **"Stock" means CC0 and needs no key** (2026-08-03, `src/content/openverse.ts` +
  `useCcSearch.ts`). BYOK was the whole of Stock, and almost nobody registers for an API
  key — so on a fresh install **all four** surfaces that use the word were a search field
  over nothing: the Library sheet fell back to twelve **Picsum** placeholders (now
  deleted; they were never CC0), the media picker returned an error, the audio
  drawer's tab was `SFX.slice(0, 8)` — the first eight of the same bundled effects the
  Sound FX tab already shows, under a heading that called them "Stock audio" — and
  `MediaDrawerSheet`'s Stock panel, **the one "add image" from the timeline opens and so
  the most-reached of the four**, showed "Find the right shot" over an empty grid forever.
  That fourth one was missed on the first pass because grepping for `stock` does not
  find it: the file names its panel `StockPanel` and its tab `"stock"`, but the user-facing
  string is "Stock media" and the search path is `searchStock`, so a scan for the word
  turned up `content/`, `MediaPickScreen` and `AudioDrawerSheet` only. **When changing
  what a word means in this app, enumerate the surfaces by behaviour, not by grep.** All four
  now read Openverse filtered to `license=cc0`, which answers **anonymously**. Four
  categories — Music · Audio · Backgrounds · Images — because they do four different
  things on tap (main track, background, audio track at the playhead), and one grid that
  behaved differently by what you had picked would be a tab keeping a secret. The keyed
  providers stay in the media picker as `Pexels`/`Unsplash` beside `Free`.
  **`license=cc0` is the contract, not a preference.** `license_type=commercial` is a far
  larger corpus and is how you reach Jamendo's 644k tracks — every one CC BY or stricter,
  i.e. a credit the user would owe on an exported video and which nothing here would
  remind them about. Measured against the live API, because none of it is documented
  where you would look:
  - **Jamendo carries no CC0 at all** (`license=cc0&source=jamendo` → 0), so every track
    is Freesound. That is why Music is loops and field recordings rather than a
    production-music catalogue — the honest extent of CC0 audio, not a bad query.
  - **`category` is null on every Freesound record**, so `category=music` against
    `license=cc0` returns **zero** — which reads exactly like "there is no CC0 music" and
    is not what is happening. Music and Audio split on the `length` bucket instead, whose
    first results measured 8s (`shortest`), 93s (`short`), 199s (`medium`), 854s (`long`).
  - **Anonymous: 20 requests/min and 200/day, keyed on IP** (`x-ratelimit-limit-anon_*`
    on every response). So a 429 says so by name — "Search failed" reads as our bug and
    invites the retry that keeps the window shut — and `useCcSearch` caches per
    category-and-query, because flicking the chips to see what is in each is the likeliest
    thing anyone does and would otherwise cost four requests a pass.
  - **`page_size` may not exceed 20 anonymously, and asking for more is a `401`** with
    `page_size may not exceed 20 for anonymous requests`. A paging limit wearing a
    credential error's clothes. `result_count` is a **240 cap**, not the corpus size.
  - **Freesound's `url` is a 128 kbps mp3 preview**; the original WAV is in `alt_files`
    behind a Freesound key, which is the credential this exists in order not to need.
  - An audio item with **no `duration` is dropped**: `duration` is what the timeline lays
    out AND what the export's `atrim` cuts to, so guessing 10s for a 93s track renders a
    file that really is 10 seconds long with nothing admitting a number was invented.
    Openverse reported one for 20/20 in both buckets, so the guard should never fire.
  - **A stock tile must never be a bare `<Image>`.** One that fails to load draws
    NOTHING — the cell's own background shows through, so a whole category reads as
    "there is no content here" while the two audio ones, which draw text, look fine. And
    the `/thumb/` endpoint really can refuse: measured, it answers **403** to some clients
    and 200 to others for the identical URL (`Python-urllib/3.9` → 403, curl and every
    browser UA → 200). `StockTile` falls back thumbnail → origin asset (a different host)
    → a visible mark, keyed on the stage so RN remounts instead of reusing the failed
    request. `MediaTile` in the media drawer already worked this way; the Library sheet's
    grid was written without it.
  `useCcSearch` is one hook for both sheets — written twice they drift, and that failure
  shows up as one sheet spending the day's allowance the other is saving. It also holds a
  sequence ref, because chips are far faster to tap than the network is to answer and a
  slow Music response would otherwise land after a fast Images one.
- **Content library**: `src/content/{catalog,library,assets}.ts` — Stickers · Emoji ·
  Backgrounds. Bundled OpenMoji/gradient packs in `assets/content/`, CDN fallback via jsDelivr.
  Stickers reuse the overlay-image pipeline, so they're dual-rendered for free.

## Design system ("Vela")

Originally specced from the user's own `Vela.dc.html` mockup. That file and its
screenshots were removed from the repo — and from its history — on 2026-07-31, before
the project was opened up; the user keeps the only copy locally. Do not go looking for
it in the tree or in `git log`, and do not re-add it. Everything it decided is in
`constants.ts`, `VIcon.tsx` and this file.
Tokens in `apps/mobile/src/constants.ts` — `vela` / `theme.vela`, plus `sp` (spacing),
`r` (radii), `elev` (tight directional shadows).

Current palette on `codex/ui-redesign` — **settled deliberately 2026-07-27, don't
re-litigate**: one hue, neutral surfaces, no gradients in chrome. That is about the
BRAND and still holds everywhere it was made — nav, buttons, sheets, Home, the mark.
**The timeline is the one deliberate exception** (2026-07-31, and it is not a
regression to "fix"):

- **`apps/mobile/src/components/laneColors.ts` gives each lane a colour**, because on
  the timeline colour is the only thing that says which lane you are looking at and
  which lane a floating HUD belongs to. Music purple, text green, sticker/PiP blue,
  the main image/video lane yellow, the clip-sound lane orange. Five hues on the
  chrome would be a paint box; five hues used as a legend is a legend.
- **One registry, two readers.** `Timeline` and `SelectionActionBar` both call
  `laneFor` — the gutter icon, the clip body where no media covers it, the waveform,
  the selection border, the trim handles and the floating bar all come from it. A
  second copy is exactly how the strip and the bar over it drift apart.
- **`onKey` is measured, not chosen.** There is no single ink for the five: white
  reads on the purple, green and blue and is illegible on the yellow and orange,
  which take near-black. `__tests__/laneColors.test.ts` holds every pair to 4.5:1, so
  a later nudge to a hue cannot quietly take its label with it.
- The playhead, ruler, add tile and transition chips stay `vela.accent`. They belong
  to the editor, not to a lane.
- The main and sticker lanes keep their filmstrips, so their hue arrives as the
  border and the trim handles — where lengthening and shortening actually happen.

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
- **A `KeyboardAvoidingView` has to BE the bottom-anchored container, not sit inside
  one** (2026-08-02). `TextSettingsSheet` had it the other way round — the KAV inside the
  sheet with `width: '100%'` and no flex, while a `flex-end` backdrop above it pinned the
  sheet to the bottom of the screen. `behavior="padding"` then had nothing to push:
  the padding grew inside a box whose bottom edge was already behind the keyboard, and
  tapping Edit on a text clip focused a field you could not see. Every other sheet
  already had it right (`InputSheet`, `TtsSheet`, `AuthSheet`, `AiGenerateModal` all give
  the KAV `flex: 1`), so the shape to copy was already in the tree. Verified with the
  simulator's SOFTWARE keyboard — a hardware keyboard is connected by default and hides
  the entire class of bug; `⌘K` in the Simulator app is what toggles it.
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
- **A real device is `npm run device`** (from the repo root or `apps/mobile`; the script
  is `scripts/orbit-ios`) —
  it sets the UTF-8 locale, finds the one connected iPhone and passes its UDID. Two
  things it encodes that are easy to get wrong by hand: the UDID expo wants is
  `hardwareProperties.udid` (`00008140-…`) and NOT the CoreDevice identifier
  `devicectl list devices` prints in its table (`51C8E0B0-…`) — both look official and
  only one matches; and `devicectl --json-output /dev/stdout` writes the JSON AND the
  human table to stdout, so parsing that stream fails and reports "no devices paired",
  which is a wrong answer wearing a normal one's clothes. It writes to a temp file.
  `--clean` removes `ios/` first, which is the answer whenever a changed `app.json`
  seems to have no effect. `npm run ios` is still the simulator.
  Both scripts live in `scripts/` and are symlinked into **`~/.local/bin`**, not
  `/usr/local/bin` — that is root-owned on a stock macOS and a plain `ln -s` there just
  says "Permission denied". `~/.local/bin` is already on PATH and needs no sudo.
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
  `localhost:8787`, and `extra.serverUrl` now comes from **`app.config.js`**, not
  `app.json` (2026-08-01). `app.json` stays canonical for everything else — the wrapper
  spreads it and computes that one field from `process.env.ORBIT_SERVER_URL`, which
  `eas.json` sets on `preview` and `production` only. **Both development profiles leave
  it EMPTY on purpose**: empty falls through to `hostUri`, which is the whole reason a
  dev build on a device finds your Mac by itself. Setting it there would point every
  debug export at the deployed box and burn its single render slot. Test against
  production with a `preview` build, which needs no Metro at all. A dev build on a physical device therefore reaches your Mac
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
- The transition **picker** offers exactly what BOTH previews render — Cut, Fade,
  Wipe×4, Slide×4, Push×4, Reveal×4 — from `previewableTransitions()`, which reads the
  same tables `xfadeStateAt` reads, so it grows when the renderer does and not a commit
  before. Transitions are on the first visual track only. The engine under it is `xfade`
  — see the transitions section below.

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
  - **Operated through `scripts/orbit-render`** — `caps` (what the box's ffmpeg can do,
    as a verdict rather than a dump), `health`, `deploy` (pull, rebuild, wait, print the
    build that answered), `verify`, `logs`, `sh`. It resolves the compose file from its
    OWN path, through symlinks, so it works from anywhere: `docker compose -f
    apps/render-service/compose.vps.yaml …` is relative and failed twice for exactly that
    reason. `caps` excludes `custom` from its count for the same reason
    `parseXfadeTokens` does, so it cannot disagree with `/health` by one. Symlink it into
    `/usr/local/bin` on the box and the path prefix goes too.
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
