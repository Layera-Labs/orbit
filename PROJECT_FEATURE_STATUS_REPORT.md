# Orbit Feature and Readiness Report

**Audit date:** 2026-07-26  
**Last reconciled:** 2026-07-27 (see §16)  
**Branch:** `codex/ui-redesign`  
**Audited commit:** `65516bc` plus the then-uncommitted worktree; reconciled at `75bb754`  
**Scope:** Mobile application, native video editor, AI generation, render service,
authentication, billing, storage, providers, automated tests, and documentation.

## 1. Executive summary

Orbit is no longer only a demo or a thin render client. The current branch contains
a substantial native Expo/React Native editing application backed by a TypeScript
FFmpeg render engine and an Express render service.

The core guest editing experience is implemented:

- The app opens without login.
- Local projects, project folders, templates, media import, multi-track editing,
  preview, and server export are present.
- Login is required for AI Studio when the shipped `AUTH_ENABLED` setting is on.
- Image generation, text-to-video, photo-to-video, and text-to-speech have real
  provider integrations through the render service.
- The editor contains real controls for text, filters, motion, keyframes, masks,
  mosaic, magnifier, blending, opacity, speed, audio volume curves, PiP, gap
  handling, delete, and ripple delete.

It is **development-ready but not production-ready**. The most important remaining
work is durable media/output storage, an asynchronous render queue, production
deployment and observability, purchase configuration, social login, cloud project
sync, additional transition implementations, and completion of the Story,
auto-caption/SRT, and editor-preference features.

The change set that was uncommitted when this was audited — Mosaic, Magnifier, Story,
AI generation, TTS, timeline, ripple-delete, and render changes — has since landed in
four commits (`ab4be27`, `7a6df32`, `f4fa403`, `75bb754`), along with fixes for a
number of defects this audit did not find. **§16 records what changed and, more
importantly, where this report was wrong.** Read it before planning from anything
below.

## 2. Status definitions

| Status                      | Meaning                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| **Working**                 | Implemented in code and covered by automated checks and/or local simulator use.                 |
| **Working, setup required** | Implemented, but requires a configured server, provider key, entitlement, or device permission. |
| **Partial**                 | Some useful behavior works, but the feature is incomplete or not durable.                       |
| **UI only**                 | A control or screen exists, but it does not currently change editor/render behavior.            |
| **Coming soon**             | The application explicitly presents the feature as unavailable.                                 |
| **Not implemented**         | No complete user path exists in the current mobile/render architecture.                         |

“Working” does not mean every permutation has been manually tested on physical iOS
and Android devices. See the verification section for the exact checks performed.

## 3. Features added on the UI branch

### 3.1 App shell and visual system

**Status: Working**

- Reworked the app into a light application shell with a dark professional editor.
- Added consistent typography based on Hanken Grotesk and JetBrains Mono.
- Standardized editor drawers and bottom sheets on white surfaces.
- Added animated sheets, selection feedback, colored icons, compact interaction
  states, and a consistent indigo theme.
- Added an iOS-style floating bottom navigation layout:
  - Home
  - Templates
  - AI Studio
  - Premium
  - separate icon-only floating `+` button
- Kept the primary app available to guests.
- Moved account/profile access into the top application header.
- Added automatic status-bar styling on relevant light/dark screens.

### 3.2 Home, projects, folders, and templates

**Status: Working locally**

- Home screen with recent projects and trending templates.
- Project folders and project cards.
- Grid/list view switching.
- Search.
- Multi-select with checkboxes.
- Move selected projects to another folder.
- Delete selected projects.
- New-project format shortcuts.
- Built-in project templates and user-created templates.
- Template categories and template search.
- Local project/media persistence using Expo file storage.

**Current limits**

- Projects and folders are device-local; there is no cloud sync.
- There is no trash/recovery system. Deletion is destructive after confirmation.
- Moving projects is local metadata management, not a server-side operation.
- Cross-device library and project synchronization are not implemented.

### 3.3 Media and content drawers

**Status: Working, with provider-dependent sections**

- Context-specific bottom sheets for image/video, audio, text, and stickers.
- Compact left-side source navigation and right-side previews/content.
- Image/video sources:
  - AI history
  - Upload
  - Stock
  - Library
- Audio sources:
  - project/recent music
  - Upload
  - AI Studio entry
  - Record voiceover
  - Sound FX
  - Stock
  - Library
- Sticker/background library with bundled content, emoji/OpenMoji, gradients, and
  solid/image backgrounds.
- Media added from a picker is copied into app-managed local storage.
- Media-library history and generation-history screens are present.

**Current limits**

- The media “upload progress” shown in the drawer is local preparation/copy
  progress; it is not a durable cloud upload.
- Unsplash and Pexels stock access requires user-provided API keys.
- Unsplash video is not available; Pexels is the useful video stock path.
- Audio “Stock” currently uses an offline starter sound-effect collection rather
  than a remote commercial stock-audio provider.
- Generated/uploaded library content is local, not synchronized to an account.

## 4. Mobile video editor capability matrix

| Area                                 | Status                                                   | Current behavior and remaining limits                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native preview                       | **Working**                                              | React Native/Skia composition for visual clips, overlays, captions, filters, motion, masks, mosaic, magnifier, and other effects.                                                                                                                                                                                                                                                                                                                                                           |
| Multi-track timeline                 | **Working**                                              | Visual, image/video overlay, text, and audio lanes with playhead, zoom, selection, trimming, splitting, layer ordering, and vertically scrollable expanded content.                                                                                                                                                                                                                                                                                                                         |
| Responsive editor layout             | **Working**                                              | Timeline height is bounded so expanding lanes does not push the preview above the fixed header.                                                                                                                                                                                                                                                                                                                                                                                             |
| Transport                            | **Working**                                              | Play/pause, previous/next, seek, undo, redo, and fullscreen preview.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Media import                         | **Working**                                              | Photos/videos from picker and app library can be inserted into the timeline.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Text creation                        | **Working**                                              | Heading, subheading, body, recent styles, and categorized templates add editable captions.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Text styling                         | **Working**                                              | Text, font, size, color, custom saved colors, stroke/shadow, alignment/format, spacing, opacity, blend, position, mask, and duplication.                                                                                                                                                                                                                                                                                                                                                    |
| Subtitle styles                      | **Partial**                                              | A Subtitle style/template can be added as ordinary text. There is no finished subtitle track automation workflow.                                                                                                                                                                                                                                                                                                                                                                           |
| SRT import/export                    | **Not implemented**                                      | No complete SRT file parser/importer or SRT exporter is wired into the mobile UI.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Automatic captions/transcription     | **Not implemented**                                      | AI Studio advertises “Auto Captions & Transcribe,” but no mobile-to-service transcription endpoint or completed flow exists.                                                                                                                                                                                                                                                                                                                                                                |
| Visual filters/adjustments           | **Working**                                              | Filter and FX controls change preview and FFmpeg export configuration.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Motion                               | **Working**                                              | Motion presets/parameters are represented in preview and export.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Keyframes                            | **Working**                                              | Opacity/position keyframes are editable and sampled by preview/export.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Chroma cutout                        | **Working**                                              | Current “Cutout” is chroma-key style removal, not semantic AI background removal.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Masks                                | **Working, limited shapes**                              | Core mask handling exists. Shape/style breadth is smaller than the external VN references.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Mosaic                               | **Working** (parity fixed `f4fa403`)                     | Mosaic, triangle, hexagon, and blur styles; shape, position, size, opacity, and strength controls. Preview and FFmpeg both existed when audited but **did not match**: the preview blurred all four patterns while ffmpeg pixelated three of them, so censoring a face previewed soft and exported as hard blocks. The preview now pixelates on the same block grid. Note `triangle`/`hexagon` differ from `mosaic` only in block SIZE — all three are square cells; the names overpromise. |
| Magnifier                            | **Working** (parity fixed `f4fa403`)                     | Magnified region with selectable shape/color and zoom, size, border, opacity, and position controls. The border ring was drawn in the preview and read nowhere in the engine, so it **vanished on export**; it is now stroked in both. The "rounded" region shape also used a 0.35 corner radius in the preview and 0.18 in the export.                                                                                                                                                     |
| Blend/opacity                        | **Working**                                              | Preview and export carry blending and opacity settings.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Speed and speed curve                | **Working**                                              | Clip playback speed/remap controls are implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Audio volume                         | **Working**                                              | Clip volume and original-audio mute state are supported. The timeline speaker is a direct mute/unmute toggle.                                                                                                                                                                                                                                                                                                                                                                               |
| Audio volume curve                   | **Working for export; preview needs broader validation** | Curve data and FFmpeg application exist. Live multi-track audio mixing parity has not been proven across all devices.                                                                                                                                                                                                                                                                                                                                                                       |
| Voice recording                      | **Working, permission required**                         | Native voiceover recording uses Expo Audio and inserts the recording locally.                                                                                                                                                                                                                                                                                                                                                                                                               |
| PiP/overlays                         | **Working**                                              | Overlay clips can be positioned, resized, reordered, masked, and styled.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Split/trim/duplicate                 | **Working**                                              | Implemented for the appropriate selected timeline item.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Normal delete                        | **Working**                                              | Removes the selected clip/overlay without closing the resulting time gap.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Ripple delete                        | **Working** (committed `ab4be27`)                        | Removes an item and shifts later items in the same relevant lane. A profile setting can replace normal delete with ripple delete.                                                                                                                                                                                                                                                                                                                                                           |
| Gap selection/HUD                    | **Working** (committed `ab4be27`)                        | Empty main-track regions can be selected, highlighted, filled, preserved, or deleted; the contextual HUD uses a solid readable background.                                                                                                                                                                                                                                                                                                                                                  |
| Gap effects                          | **Partial**                                              | Mosaic/Magnifier can target a neighboring visual item from a selected gap. This is useful UI behavior but is not a new independent gap clip type.                                                                                                                                                                                                                                                                                                                                           |
| Story                                | **Working** (was Partial prototype; fixed `7a6df32`)     | Lists visual clips, jumps to/deletes a clip, reorders with ↑↓ (`reorderVisualClips`, which repacks the track back to back), persists per-clip notes (authoring-only `note` on `VisualTrackClip`; the renderer ignores it), inserts a real title card that shifts the timeline (`addTitleCard`/`removeTitleCard`), and collapses the section. The header "options" menu had no handler and no specified behaviour, so it was **removed rather than implemented**.                            |
| Transitions: None/Cut                | **Working**                                              | No transition/cut behavior is available.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Transition: Fade                     | **Working**                                              | Preview/export fade support exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Dissolve/Slide/Wipe/Zoom transitions | **Coming soon**                                          | Visible in the transition UI with explicit `soon` state; render implementations are pending.                                                                                                                                                                                                                                                                                                                                                                                                |
| Export sheet                         | **Working, server required**                             | Resolution, frame rate, quality, HDR option, audio-only, estimated size, save-to-gallery, and sharing UI.                                                                                                                                                                                                                                                                                                                                                                                   |
| HDR10 export                         | **Partial / needs device validation**                    | Configuration is passed into the render layer; real HDR color-management and playback compatibility need end-to-end validation on target devices.                                                                                                                                                                                                                                                                                                                                           |
| Undo/redo                            | **Working per editor session**                           | In-memory command history works while editing. Undo history is not persisted across app restarts.                                                                                                                                                                                                                                                                                                                                                                                           |

### 4.1 Editor controls that are currently UI-only

The Editor Preferences sheet contains controls that update store state but are not
currently consumed by editing or rendering logic:

- Quick vs Pro main-track mode
- Track Linkage
- Object Snapping
- Preview FPS

These should either be implemented and persisted or labeled as previews/coming
soon. At present they can mislead users because their switches visibly change
without changing editor behavior.

### 4.2 Selection HUD and contextual rails

**Status: Working**

- Selected text, audio, and visual items receive their own contextual actions.
- Delete is consistently presented in white within the editor theme.
- When Ripple Delete is enabled, it replaces the normal Delete action. **This report
  originally claimed it "remains one-line where space permits"; it did not.** The
  label was hard-clipped mid-word (`ellipsizeMode="clip"` on a slot too narrow for
  "Ripple delete"), and the Delete slot carried a `flex: 1.18` override that made the
  six actions unevenly spaced. Fixed in `75bb754`: equal slots, a compact 42pt row,
  the label shortened to "Ripple" with the full text kept for screen readers.
- The floating contextual bar uses the theme-blue solid background.
- Short bottom action groups center within the screen.
- Larger tool groups remain horizontally scrollable because fitting every advanced
  editor tool into a phone width would reduce touch targets below a safe size.

## 5. Authentication, guest access, premium, and billing

| Feature                              | Status                                         | Notes                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest app access                     | **Working**                                    | Projects and the editor open without login.                                                                                                                       |
| AI Studio login gate                 | **Working**                                    | With `AUTH_ENABLED = true`, AI generation and credit operations require authentication.                                                                           |
| Self-hosted email registration/login | **Working, server required**                   | Mounted when `ORBIT_AUTH_PROVIDER=selfhosted`.                                                                                                                    |
| Forgot/reset password                | **Working, setup required**                    | Requires Resend configuration. Without email configuration, forgot-password returns a service-unavailable response.                                               |
| Managed auth token verification      | **Backend capability**                         | Clerk, Supabase, and Firebase adapters exist in the auth package. The current mobile app does not include finished sign-in acquisition flows for these providers. |
| Apple sign-in                        | **Coming soon**                                | Button displays a coming-soon message.                                                                                                                            |
| Google sign-in                       | **Coming soon**                                | Button displays a coming-soon message.                                                                                                                            |
| Premium screen                       | **Coming soon**                                | The premium sheet is visual marketing only; no subscription entitlement system currently unlocks the advertised benefits.                                         |
| Credit balance                       | **Working, server required**                   | Read from the render service for the authenticated/anonymous account.                                                                                             |
| Credit packs UI                      | **Partial**                                    | Client wrapper and buy sheet exist.                                                                                                                               |
| RevenueCat purchases                 | **Not active**                                 | iOS and Android public keys are empty, the native purchase module/config is not enabled for release, and store products/offerings/webhook must be configured.     |
| RevenueCat credit webhook            | **Implemented, production hardening required** | Idempotent transaction crediting exists. The shared webhook secret must be made mandatory in production.                                                          |

## 6. AI Studio and generation

| Feature                            | Status                                        | Provider / requirement                                                                                                                       |
| ---------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| AI Studio gated landing page       | **Working**                                   | Login required under the shipped configuration.                                                                                              |
| Text-to-image                      | **Working, setup required**                   | Runway through `/v1/generate-image`; 10 application credits.                                                                                 |
| Text-to-video                      | **Working, setup required**                   | Runway through `/v1/generate-video`; duration/aspect controls.                                                                               |
| Photo-to-video                     | **Working, setup required**                   | Selected local image is uploaded/resolved and sent to Runway.                                                                                |
| Optional generated video sound     | **Working, setup required**                   | Provider-dependent; higher application credit cost.                                                                                          |
| Text-to-speech                     | **Working, setup required**                   | ElevenLabs through `/v1/tts`; voice and speed controls; 5 application credits.                                                               |
| AI generation preview/retry/insert | **Working**                                   | Generated results can be previewed and inserted into the current timeline.                                                                   |
| AI history                         | **Partial**                                   | History is stored locally. Provider URLs or local files can become unavailable, and there is no account-level durable generation library.    |
| AI music generation                | **Not implemented**                           | The audio AI entry opens AI Studio, but there is no music-generation provider or endpoint.                                                   |
| Automatic captions/transcription   | **Not implemented**                           | Advertised in the AI Studio feature list only.                                                                                               |
| AI script/template agent           | **Library exists, mobile flow not connected** | `@orbit/video-ai` can create a limited template specification, but the current mobile AI path does not expose it through the render service. |

### Required AI configuration

- `RUNWAY_API_TOKEN`
- `ELEVENLABS_API_KEY`
- optional `ELEVENLABS_VOICE_ID`
- optional `ELEVENLABS_MODEL`
- an authenticated account when `ORBIT_AUTH_PROVIDER` is enabled
- a positive credit balance

Live provider calls were not made during this audit, so upstream account balance,
model availability, safety rejection behavior, and latency remain operational
dependencies.

## 7. Render service status

The render service is an Express application using the `@orbit/video` FFmpeg
renderer, `@orbit/video-gen` providers, `@orbit/auth`, and `@orbit/billing`.

### 7.1 Implemented endpoints

| Endpoint                   | Status                                       | Function                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`              | **Working**                                  | Basic process health response.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `POST /v1/upload`          | **Working**                                  | Multipart upload (single file, cap via `ORBIT_MAX_UPLOAD_BYTES`, default 500 MB), HEIC/HEIF/AVIF still normalization, per-IP rate limit, and oldest-first eviction above `ORBIT_MAX_MEDIA_BYTES` (`f4fa403`).                                                                                                                                                                                                                                                         |
| `POST /v1/render`          | **Working**                                  | Resolves uploads/HTTP media, renders with FFmpeg, returns a served output URL; per-IP rate limited (`f4fa403`). **This report originally said it "validates media sources" — it did not.** It validated only the legacy `clips`/`audio` fields, never `tracks[].clips[].src` or an image `background.src`, and `tracks` is the only path the mobile app uses. Now validated exhaustively via `collectClientSrcs` (`apps/render-service/src/resolve.ts`), unit tested. |
| `GET /v1/credits`          | **Working**                                  | Authenticated or development anonymous credit balance.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `POST /v1/auth/register`   | **Working when self-hosted auth is enabled** | Email/password registration.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `POST /v1/auth/login`      | **Working when self-hosted auth is enabled** | Email/password login.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /v1/auth/forgot`     | **Working when email is configured**         | Sends reset code/link through Resend.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /v1/auth/reset`      | **Working when self-hosted auth is enabled** | Completes password reset.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /v1/generate-image`  | **Working, provider required**               | Metered Runway image generation.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `POST /v1/generate-video`  | **Working, provider required**               | Metered Runway text/photo video generation.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /v1/tts`             | **Working, provider required**               | Metered ElevenLabs speech generation.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /v1/billing/webhook` | **Implemented**                              | RevenueCat event processing and idempotent credit grants.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /v1/credits/grant`   | **Development only**                         | Available only with `ORBIT_DEV_TOPUP=1`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GET /files/:name`         | **Working locally**                          | Serves generated and rendered files from process-local temporary storage.                                                                                                                                                                                                                                                                                                                                                                                             |

### 7.2 Render engine features

**Status: Working at unit-test level**

- Still and video clip composition.
- Multi-track visual composition.
- Text/caption rasterization and Google font loading.
- Background rendering.
- Audio tracks and volume curves.
- Clip speed and time remapping.
- Filters and adjustments.
- Opacity and blend modes.
- Keyframes and motion.
- Masks.
- Chroma key.
- Mosaic and magnifier effects.
- Fade transitions.
- PiP/overlay composition.
- Configurable output size, frame rate, bitrate/quality, audio-only, and HDR flags.

### 7.3 Render service production gaps

#### Critical before public deployment

1. **No durable media/output storage.** Uploaded media and render/TTS outputs live
   under the host temporary directory. They are lost when the instance restarts
   and do not work safely across multiple instances.
2. **No job queue.** Rendering and generation are synchronous request-bound
   operations. There is no Redis/BullMQ/SQS-style queue, job status endpoint,
   retry policy, cancellation persistence, worker isolation, or concurrency
   backpressure.
3. **Upload and render routes are not authenticated — now a deliberate open
   decision, not an oversight.** The app is guest-first ("100% Free · No Login
   Required" on onboarding), so requiring a token on `/v1/upload` and `/v1/render`
   would break the primary flow. Per-IP rate limiting shipped in `f4fa403` as the
   floor; the real answer is a job queue plus a per-account or per-device quota, and
   that product decision is still open.
4. **RevenueCat webhook secret is optional in code.** When
   `REVENUECAT_WEBHOOK_AUTH` is absent, the route accepts requests without the
   shared secret. Production startup should fail or disable the route unless the
   secret is set.
5. ~~**No API rate limiting or quotas for rendering/upload.**~~ **Rate limiting done**
   in `f4fa403` — per-IP fixed window, tunable via `ORBIT_RATE_WINDOW_MS`,
   `ORBIT_UPLOAD_RATE_LIMIT`, `ORBIT_RENDER_RATE_LIMIT`. Per-account quotas are still
   missing.
6. **CORS is unrestricted.**
7. **No deployed production definition was found.** There is no complete
   container/worker/object-store/queue deployment topology in this app directory.
8. ~~**FFmpeg and FFprobe had no timeout and were never killed.**~~ **Fixed** in
   `f4fa403`. This audit did not identify it: `isClientSrc` deliberately permits
   `http(s)` srcs, so a src pointing at a stalling or endless stream hung the encode
   forever _and_ leaked its temp directory (the `finally { rm(dir) }` never ran) —
   an unauthenticated denial-of-service primitive. `packages/video/src/render.ts` now
   enforces a hard cap with SIGTERM then SIGKILL, configurable per render.

#### Important operational work

- Add S3/R2-compatible object storage and signed URLs.
- Add upload/output retention and cleanup policies.
- Add background render/generation workers and persistent jobs.
- Add progress, polling/websocket status, retry, timeout, and cancel APIs.
- Add render concurrency and resource limits.
- Add structured logs, error tracking, metrics, traces, and provider latency/cost
  dashboards.
- Add request IDs and audit records.
- Add malware/content-type validation and stricter remote-source policy.
- Add production readiness/health checks for FFmpeg, Postgres, storage, and
  providers rather than only process liveness.
- Add endpoint integration tests for render, auth, generation, and billing.
- Run Postgres integration tests in CI against a real test database.

## 8. Data and persistence state

| Data                          | Current storage                     | Risk / pending work                                                                  |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| Mobile projects               | Device filesystem                   | No cloud backup, collaboration, or cross-device sync.                                |
| Mobile project folders        | Device-local metadata               | No server reconciliation.                                                            |
| Uploaded mobile library       | App-managed device files            | Can be lost with app deletion; no account library.                                   |
| AI history                    | Device-local settings/files/URLs    | Provider URLs may expire; no durable account history.                                |
| Undo/redo                     | In-memory editor store              | Lost when editor/app closes.                                                         |
| Credits and self-hosted users | Postgres when `DATABASE_URL` exists | Falls back to ephemeral memory when missing. Production should refuse this fallback. |
| Server uploads                | Host temporary directory            | Lost on restart; not horizontally scalable.                                          |
| Render outputs                | Host temporary directory            | Lost on restart; URLs are instance-local.                                            |
| TTS outputs                   | Host temporary directory            | Same durability and scaling issue.                                                   |

## 9. Explicitly pending or “coming soon” items

### Visible coming-soon features

- Orbit Premium purchase/subscription.
- Apple login.
- Google login.
- Help & Support content/contact flow.
- Dissolve transition.
- Slide transition.
- Wipe transition.
- Zoom transition.

### Present but incomplete

- SRT import/export.
- Automatic captions and transcription.
- Full live multi-track audio-preview parity.
- Real HDR10 end-to-end validation.
- Remote stock-audio integration.
- Durable AI generation library.
- Cloud project/media sync.
- Purchase activation.
- Production managed-auth sign-in flows in the mobile client.
- More advanced mask presets/handles matching the supplied VN references.
- Persisted editor preferences.

### UI-only controls that currently do not work

- Quick/Pro main-track behavior.
- Track Linkage.
- Object Snapping.
- Preview FPS selection.

## 10. Mobile platform readiness

### Android

**State: Development build/simulator smoke-tested**

- Native Android project exists.
- The app was built, installed, and opened in an Android simulator during the
  recent UI work.
- Guest onboarding/home navigation was verified without a fatal runtime error.
- TypeScript passes.

**Still required**

- Full editor/import/export regression on Android.
- Physical-device media picker, microphone, gallery write, and sharing tests.
- Android render-server networking validation against a LAN/production host.
- Release signing, Play Console metadata, privacy declarations, and store review.
- RevenueCat Android SDK/key/product setup.
- Performance and memory testing on low/mid-range devices.

### iOS

**State: Native project present and actively used for UI development**

- iOS project and iPhone-oriented safe-area/layout work exist.
- The UI has been iterated in an iPhone 16 Pro simulator during this branch’s
  development history.

**Still required**

- A fresh full regression of every edited flow on the current uncommitted worktree.
- Physical-device photo/video, microphone, Photos save, and share tests.
- HDR export/playback validation.
- Release signing/provisioning, App Store metadata, privacy manifests, and review.
- RevenueCat iOS SDK/key/product setup.
- Apple sign-in implementation if offered as an authentication option.

### Shared mobile release blockers

- Change the default `http://localhost:8787` server to a production HTTPS endpoint.
- Define environment/config handling per development, staging, and production.
- Add crash reporting and analytics with privacy review.
- Add automated device/E2E tests for onboarding, project creation, import, edit,
  save, reopen, AI insert, export, gallery save, and share.
- Test project migrations/backward compatibility as model types evolve.
- Decide and document offline behavior for server-only exports and AI.

## 11. Configuration checklist

### Minimum local render/export

- Node 20 or newer.
- pnpm 10.29.2.
- FFmpeg available to the render process.
- Render service running at the URL configured in the mobile Profile settings.

### Production authentication and persistence

- `DATABASE_URL`
- `ORBIT_AUTH_PROVIDER`
- provider-specific auth values, or self-hosted auth
- `ORBIT_LICENSE_KEY`
- secure password/reset configuration

### Password email

- Resend API configuration
- sender address
- optional `EMAIL_RESET_URL_BASE`

### AI

- `RUNWAY_API_TOKEN`
- `ELEVENLABS_API_KEY`
- optional ElevenLabs voice/model values
- credit policy values

### Purchases

- Mobile RevenueCat iOS and Android public SDK keys
- native `react-native-purchases` configuration and rebuilt clients
- App Store Connect and Play Console products
- RevenueCat offering/packages matching server product IDs
- mandatory `REVENUECAT_WEBHOOK_AUTH`
- production webhook URL

### Stock media

- Pexels API key
- Unsplash API key

## 12. Verification performed in this audit

The following commands completed successfully:

| Check                                           | Result                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @orbit/video test`               | **83 tests passed** (was 81; +2 for local-FX alpha and NaN guards).                                                         |
| `pnpm --filter @orbit/video-gen test`           | **26 tests passed** across 4 files.                                                                                         |
| `pnpm --filter @orbit/render-service test`      | **15 tests passed** (was 10; +5 for `collectClientSrcs`); 3 Postgres tests skipped because `TEST_DATABASE_URL` was not set. |
| `pnpm --filter @orbit/render-service typecheck` | **Passed**.                                                                                                                 |
| `pnpm --dir apps/mobile exec tsc --noEmit`      | **Passed**.                                                                                                                 |
| Mobile editor-operation test                    | **24 tests passed** (was 6), covering split-with-speed, ripple insert, track ordering, reorder, the title card, and notes.  |
| Metro iOS bundle                                | **HTTP 200**, ~13.9 MB — the whole app resolves and compiles.                                                               |

**CI gap closed:** these mobile model tests previously ran _nowhere_. `apps/mobile` is
excluded from the pnpm workspace, so `turbo run test` never saw them. Root `pnpm test`
now runs them via a `test:mobile` script.

**Simulator verification** (iOS 26.3, iPhone 17 Pro, dev build): the Story panel
renders with working reorder buttons correctly disabled at both ends; the title card
appears in the preview with the sequence shifted and project duration 9s → 11s; the
mosaic renders as nearest-neighbour blocks on the expected grid and the magnifier ring
draws; the selection action bar shows six equal slots with no clipped labels.

Not tested live during this audit:

- Real Runway requests.
- Real ElevenLabs requests.
- Real RevenueCat purchases/webhooks.
- Real Resend delivery.
- Postgres integration behavior under `TEST_DATABASE_URL`.
- Full real-media FFmpeg render on production infrastructure.
- Complete iOS and Android E2E regression.

## 13. Documentation accuracy

Several existing documents describe an older state of the project:

- `apps/mobile/README.md` still describes a thin render client and does not reflect
  the current native editor.
- `ROADMAP.md` contains useful history but still lists the mobile app as future
  work in places.
- `packages/video-gen/README.md` says real providers are pending even though Runway
  and ElevenLabs providers now exist.
- `packages/video-ai/README.md` describes the template-agent package correctly,
  but that should not be interpreted as the current mobile AI generation flow.

This report should be treated as the current status baseline, **read together with
§16**. The worktree has now been committed, so the trigger for updating those stale
documents has fired; they remain unchanged as of this reconciliation.

`CLAUDE.md` was added at the repo root on 2026-07-27 and now carries the working
project context (architecture, the npm-vs-pnpm split for `apps/mobile`, the
dual-render rule, design-system conventions, and verification commands).

## 14. Recommended completion order

### P0 — make the current product safe and deployable

1. ~~Commit the current UI/editor/render work in logical, reviewable commits.~~
   **Done** — `ab4be27`, `7a6df32`, `f4fa403`, `75bb754`.
2. Add durable object storage for uploads, generated assets, and render outputs.
3. Add an asynchronous job/worker architecture with progress and cancellation.
4. ~~Authenticate and~~ rate-limit upload/render endpoints. **Rate limiting done**
   (`f4fa403`). Authentication is now an open product decision rather than a task:
   the app is guest-first, so a token requirement breaks the primary flow. Decide
   between per-device quotas, anonymous accounts, or gating only expensive renders —
   see §7.3 #3.
5. Make the RevenueCat webhook secret mandatory.
6. Deploy a staging render service with Postgres, FFmpeg workers, HTTPS, logs,
   metrics, and error reporting.
7. Run full iOS and Android edit/export E2E tests against staging.

### P1 — complete monetization and advertised flows

1. Configure and test RevenueCat on both stores.
2. Implement Apple and Google login, or remove their buttons until ready.
3. Finish automatic captions/transcription and SRT import/export.
4. ~~Finish Story persistence and reorder behavior.~~ **Done** — `7a6df32`.
5. Implement or hide Quick/Pro, Linkage, Snapping, and Preview FPS.
6. Implement the four visible coming-soon transitions.
7. Replace placeholder Help & Support with real documentation/contact routes.

### P2 — product durability and polish

1. Add account cloud sync for projects, folders, media, and AI history.
2. Add a recoverable project trash system.
3. Add remote stock audio and richer stock filtering/licensing metadata.
4. Expand mask shapes and advanced preview/export parity tests.
5. Add device performance profiling and large-project stress tests.
6. Refresh all READMEs, roadmap, architecture, and go-live documentation.

## 15. Bottom line

The editor and its new UI are the strongest and most complete parts of the current
branch. Core local editing is usable, and the render/AI integrations are real
rather than mock screens. The remaining risk is mostly outside the visible UI:
production infrastructure, durable storage, background jobs, security controls,
billing activation, provider configuration, cloud sync, and a small set of
advertised or partially designed advanced features.

## 16. Post-audit corrections (2026-07-27)

### 16.1 Fixed since the audit

| Commit    | Change                                                                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ab4be27` | The audited worktree, plus fixes for the security and correctness defects in §16.2.                                                                                                                                           |
| `7a6df32` | Story: every control made real (reorder, persistent notes, title card, collapse); the no-op options button removed.                                                                                                           |
| `f4fa403` | Preview/export parity (mosaic pixelation, magnifier ring, region alpha, corner radius); render-service timeouts, rate limits, eviction, numeric guards; track sort order, ripple-insert on duplicate, memoized preview paths. |
| `75bb754` | Selection action bar: compact, six equal slots, no clipped label.                                                                                                                                                             |

### 16.2 Defects this audit did not find

Found by a subsequent three-way code review of the same change set. All are fixed;
they are recorded because of **what they say about the method**, not to relitigate them.

1. **`/v1/render` arbitrary-file-read.** Source validation covered only the legacy
   `clips`/`audio` arrays. `tracks[].clips[].src` and an image `background.src` were
   unchecked, and `tracks` is the only path the mobile app renders through — so the
   guarded fields were the dead ones. An unauthenticated request could have ffmpeg
   read any file the process could reach and serve the transcode back from `/files`.
   This report listed the endpoint as "Working — validates media sources".
2. **ElevenLabs voice-id injection.** `req.voice` was interpolated unvalidated into
   the request URL path, so a traversal-style value could aim the operator's API key
   at other vendor endpoints and return the response to the caller.
3. **`splitClipAt` corrupted every non-1× clip.** It wrote `trimIn + local`, mixing a
   timeline offset into a source offset; both preview and export map timeline→source
   as `trimIn + elapsed * speed`. Splitting a 2× clip replayed several seconds of
   footage at the cut.
4. **Inverted caption masks rendered opposite in preview vs export.** The preview
   skipped masking entirely when `invert` was set; the export honoured it.
5. **Mosaic/Magnifier sheets mutated the clip on open with no cancel path.** Opening
   a sheet to look at it and dismissing it permanently applied the effect — and
   because the effect target falls back to the clip under the playhead, potentially
   to a clip the user never selected.

**The lesson.** A static audit reports what code _claims_ to do. Every item above sat
behind a feature this report marked **Working**, and three of them (1, 2, 4) are cases
where two components that both existed did not agree with each other — precisely what
reading each in isolation cannot catch. Treat §7.3's infrastructure findings as
reliable, since structural absences are visible from the source. Treat the per-feature
**Working** labels in §4 and §7.1 as _unverified_ unless a test or a simulator run is
cited for them in §12.

### 16.3 Known-open, not covered elsewhere in this report

- **Per-pointer-event project writes.** Effect and PiP drags call `apply()` on every
  pointer event, and each call serializes the whole project to disk on the JS thread.
  Undo history coalesces at 450 ms; the disk write does not.
- **`normalizeProjectStills` always returns `tracks`** (defaulting to `[]`), so
  `project.tracks !== undefined` is always true server-side and the legacy
  concat/xfade path in `buildFFmpegArgs` is unreachable. Latent for the mobile app,
  which always sends `tracks`, but a silent wrong-output bug for any other client.
- **`tsconfig.tsbuildinfo` files are tracked in git** and not ignored. They churn on
  every build and had to be held out of three commits by hand.
- **Mosaic `triangle` and `hexagon` are square blocks** differing only in cell size;
  real polygonal cells have no ffmpeg equivalent. The preview now matches the export,
  but the names still overpromise.
- **Open design question:** `orbitGradient` is `#5b4bff → #933ff2` (indigo→purple),
  which the project's own design guidance names as the most recognisable machine-made
  colour move. Visible on the onboarding CTA and the selection action bar. May be
  deliberate; it has not been confirmed.
