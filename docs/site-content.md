# Orbit — site content inventory

Everything factual you need to design the landing page and the docs around.
Read off the codebase on 2026-08-11, not from memory. Colours, wording and
layout are yours; this is the data underneath them.

Anything not in this file has not been built. Do not invent customer logos,
testimonials, quotes, star ratings, user counts, funding, awards, or App Store
links: there are none yet.

---

## 1. What Orbit is

An open-source, embeddable, white-label **editor SDK for image and video**, with
an optional AI layer. A developer drops it into their own React, Next.js or
React Native product and ships a design canvas or a video editor under their own
brand. Closest comparisons: Polotno SDK, an embeddable Canva.

There is also a **hosted cloud render API**, metered in credits, that a
developer can point the SDK at instead of running their own encoders. The render
service is in the repository too, so self-hosting is a first-class path and not
a downgrade.

- Org: **Layera Labs**
- Product: **Orbit**
- Site: `orbit.layeralabs.com` (`useorbit.io` redirects here)
- API: `api.layeralabs.com`
- Source: `github.com/Layera-Labs/orbit`
- npm scope: `@layera-labs`
- Current version: **1.0.0-beta.4**
- Licence: open source (the SDK); the hosted API is a paid service

### The one claim nobody else makes

Every effect is **defined once and rendered twice**: canvas in the browser for
the preview, ffmpeg on the server for the export. The test suite parses the real
ffmpeg filtergraph and fails the build when the two disagree.

Measured, not asserted:

| What | Agreement |
|---|---|
| Geometry, timing, alpha ramps, ungraded clips | within **2/255** |
| Colour grades | within **6/255** (worst preset, `vivid`, reaches 10) |
| A live browser frame vs a real encoded MP4 frame | **98.2%** of pixels within 2/255, **median 1/255** |

The residual sits on antialiased edges, one pixel wide: two different SVG
rasterisers plus H.264 ringing, not the effect maths. Every flat interior
differs by 1.

---

## 2. The packages

**12 are published to npm. 8 are private** (internal to the hosted service and
not something a customer installs). All are `@layera-labs/orbit-*`.

### Published — v2, the current SDK

| Package | What it does |
|---|---|
| `orbit-video` | **The engine.** Headless video timeline model, effect maths, the ffmpeg argument builder, and the frame operations both previews draw. Depends on nothing else here, which is exactly what lets a browser and a server agree through it. Three entry points: default and `/browser` are pure and browser-safe; `/node` adds ffmpeg, resvg and fs. |
| `orbit-model` | The document: a reactive (Valtio) store, undo/redo history, and the operations that mutate it. Headless. |
| `orbit-render` | Draws that document with react-konva. The canvas is a pure function of the model. |
| `orbit-providers` | Pluggable interfaces for templates, fonts, backgrounds and stock photos. A registry you fill in with your own sources. |
| `orbit-editor` | The assembled React editor: panels, inspectors, the canvas, the chrome. |

### Published — v1, feature-complete and in maintenance

New work goes into v2. v1 still builds, still ships, and is what `docs/guide/`
currently documents.

| Package | What it does |
|---|---|
| `orbit-core` | The v1 canvas engine, vanilla TypeScript. |
| `orbit-react` | React bindings for v1. |
| `orbit-next` | v1 wired for the Next.js App Router. |
| `orbit-ui` | v1 React component library (Tailwind + Radix). |
| `orbit-shared` | Shared types and utilities under the v1 half. |
| `orbit-effects` | WebGL effects and shaders. |
| `orbit-agentic` | The AI layer: backend adapters for the agentic pipeline. An **optional peer** — v1 builds and runs without it. |

### Private — not installable, listed so the architecture is honest

`orbit-auth` (pluggable end-user auth: self-hosted JWT, or Clerk / Supabase /
Firebase) · `orbit-billing` (licence keys, credit ledger, usage metering) ·
`orbit-video-gen` (generative image/video/TTS behind the metered service) ·
`orbit-video-ai` (natural-language prompt to a rendered video) · `orbit-pipeline`
(Brief → ScenePlan → VideoProject; the part that decides) · `orbit-formats`
(video archetypes) · `orbit-assets` (asset providers and cache) · `orbit-brand`
(the mark, icon set and display face shared between products).

### The dependency shape

```
orbit-video                                    (depends on nothing)

orbit-model ──┬── orbit-render ──┐
              ├── orbit-providers ┼── orbit-editor
              └───────────────────┘

orbit-shared ──┬── orbit-ui ──────┐
               ├── orbit-effects ─┼── orbit-react ── orbit-next
               ├── orbit-agentic ─┤
               └── orbit-core ────┘
```

---

## 3. What the editor does

### Image / design canvas

- **Element types:** text, image, video, audio, shape, line, SVG, QR code,
  gradient, pattern, solid, group
- Crop, corner radius, stroke, shadow, blur
- Group and ungroup
- Blend modes: normal, multiply, screen, overlay, darken, lighten, difference,
  exclusion
- Templates, font picker, colour picker and swatches
- Multi-page documents with page controls and rulers
- Undo/redo, layers, alignment, snapping
- SVG export/import round-trip

### Video editor

- **Multi-track timeline:** visual tracks, overlay tracks, caption lanes, audio
  tracks
- Drag, trim and cross-lane move in a single gesture, committed once per gesture
  so history stays clean
- Ripple delete, duplicate, split, keyboard shortcuts
- Deliberate gaps are preserved: tracks are never silently re-packed
- Filmstrips and audio waveforms on the timeline
- Per-clip: rotation, crop, fit, constant speed, volume, audio fades, volume
  curve
- Canvas frame (mat/letterbox) with shared geometry
- Element animation: fade and slide in/out
- Picture-in-picture placement and stickers
- Captions, with **SRT export**
- Chroma key (WebGL fragment shader in preview, `colorkey` on export, verified
  byte-for-byte)
- Local effects: mosaic, magnifier/lens, blur regions
- Ken Burns / motion, keyframed position and opacity
- HDR10 export (real conversion, not a relabel)

### Colour grades

Presets plus manual control over **brightness, contrast, saturation,
temperature, fade, RGB**. Named presets include `none`, `vivid`, `film`, `mono`,
`warm`, `cool`. Modelled where ffmpeg actually runs them — on the YUV planes,
BT.601 — so preview and export collapse into the same 4×5 colour matrix.

### Transitions

**21 families, 51 individual types**, and the picker only ever offers what *both*
renderers can draw:

Cut · Fade · Black · White · Wipe (4 directions) · Slide (4) · Push (4) ·
Reveal (4) · Shake (4) · Shake 2 (4) · Flash (light, blink) · Circle (open,
close) · Blinds (4) · Diagonal (4 corners) · Squeeze (2) · Zoom rush · Zoom
in/out · Zoom 2 in/out · Pixelate · Radial · Blur (2)

Built on ffmpeg `xfade`, gated at runtime against what the deployed ffmpeg can
actually parse.

---

## 4. The AI layer

Optional. The SDK works completely without it, and it is a separate peer
dependency so nothing is forced on a developer who does not want it.

| Capability | Credits | Provider |
|---|---|---|
| Generate image | 10 | Replicate |
| Edit image | 8 | Replicate |
| Generate video (with audio) | 100 | Runway |
| Generate video (muted) | 60 | Runway |
| Text to speech | 5 | ElevenLabs |
| Caption / transcribe | 1 | — |

Planning brain: Gemini. Prompt → scene plan → a real `VideoProject` that the
same engine renders.

Charged **only on success**. A failed generation does not debit.

---

## 5. The cloud render API

Base: `https://api.layeralabs.com`

### Two kinds of bearer token

This is the single most important concept for a developer to understand, and it
deserves its own section on the docs site.

- **A JWT is a person.** A signed-in user, or a guest token the server itself
  issued for a device that has not signed in. "No login required" works without
  anything being anonymous.
- **An `orbit_sk_` API key is a developer's server.** Unattended, no browser, no
  session to refresh. Bills to the account that issued it.

Rules that fall out of that: **keys cannot manage keys** (a key that can mint a
key outlives revoking the one that leaked), and **guests cannot sync projects**
(no password means the identity dies with the device's storage). Keys require a
database — there is no in-memory fallback, because a credential that evaporates
on restart is not a weaker feature, it is a broken one.

Every route requires a bearer token. There are no anonymous endpoints.

### Routes (30)

**Auth**
- `POST /v1/auth/guest` — a token for a device that has not signed in
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/forgot` — returns `delivery: 'link' | 'code'`
- `POST /v1/auth/reset`
- `GET  /reset` — the service serves the reset form itself

**API keys**
- `POST   /v1/keys` — issue one; the secret is shown **once** and never stored
- `GET    /v1/keys` — list (last 4 characters only)
- `DELETE /v1/keys/:id` — revoke

**Media and rendering**
- `POST /v1/upload` — returns an `upload:<token>` to reference in a project
- `POST /v1/render` — synchronous, or `{async: true}` → `202 {id}`
- `GET  /v1/render/:id` — poll job status
- `GET  /v1/render/:id/events` — server-sent progress events
- `POST /v1/render/:id/ticket`
- `POST /v1/render/quote` — price a render without running it

**Generation**
- `POST /v1/generate` — job-based generation
- `GET  /v1/generate/:id` — poll
- `POST /v1/generate-image`
- `POST /v1/generate-video`
- `POST /v1/tts`
- `POST /v1/transcribe`
- `GET  /v1/fonts/:family`

**Projects (cloud sync)**
- `GET    /v1/projects`
- `GET    /v1/projects/:id`
- `PUT    /v1/projects/:id`
- `DELETE /v1/projects/:id`

Documents only — media travels as the `upload:` tokens a project already
carries, so a sync is kilobytes rather than megabytes. Conflicts are
last-write-wins by the client's timestamp, resolved in a single statement so
there is no read-then-write window; a stale write gets 409 **with the winner**
so the client can keep both rather than drop an edit. Deletes are tombstones.

**Credits and ops**
- `GET  /v1/credits` — balance
- `POST /v1/credits/grant`
- `POST /v1/billing/webhook`
- `GET  /health` — storage kind, queue mode, running/queued/capacity, cluster
  depth, job count

### Pricing

Per **second of output**, by resolution tier:

| Tier | Credits per second |
|---|---|
| 480p | 0.25 |
| 720p | 0.5 |
| 1080p | 1 |
| 2K | 2 |
| 4K | 4 |

- HDR10: **×1.5**
- Minimum **1 credit** per render
- Seconds **round up**, so a caller can predict the number from their own
  timeline
- Credits are always whole numbers
- A zero-length project bills nothing

**The tier comes from the SHORT edge.** A 1080×1920 vertical phone video is
priced as 1080p, not as the 2K its long edge would suggest. This is the one rule
worth calling out on the pricing page, because it is the one that surprises
people and it is in the customer's favour.

Worked examples: 30 s at 1080×1920 = **30 credits**. 30 s at 3840×2160 with HDR
= **180 credits**. 6 s at 4K HDR = **36 credits**.

### How metering actually works

Credits are **held before ffmpeg starts** and **settled against the real
output**. A failed encode releases the hold and refunds in full rather than
charging for a file that does not exist. A hold is an ordinary negative row in
the ledger, so a balance is always the sum of what happened.

---

## 6. Mobile

A **native iOS video editor**, built on the same `orbit-video` engine: the same
effect maths, the same transitions, the same export path through the same render
service. The preview is Skia on the phone and canvas in the browser, drawing one
shared definition, with the encoder agreeing with both.

Built with Expo / React Native. Features: AI studio, multi-track timeline,
media picker, export screen with real progress, project sync, credits.

**Not on the App Store yet.** No screenshots exist that can honestly be shown.
Do not mock one up.

There is also `orbit-react-native` (private): a typed bridge for embedding the
v2 web build in a React Native WebView. Deprioritised, not shipped.

---

## 7. Self-hosting and architecture

The render service is **in the repository**, not behind the API.

- Dockerfile plus a compose file bringing up **Postgres and MinIO**
- **Shared Postgres job queue** — every instance is also a worker, so adding a
  machine adds capacity. `FOR UPDATE SKIP LOCKED` stops two workers rendering
  (and charging for) the same job. Claims heartbeat, so a worker killed
  mid-encode has its job re-offered instead of stranding it.
- **Pluggable storage** — local disk by default; set a bucket and keys and both
  uploads and rendered output go to any S3-compatible store. Output URLs are
  presigned GETs.
- **Real shutdown** — on SIGTERM a worker hands its claim back and stops its
  encoders, because a signal reaches the service, not its child ffmpeg
  processes.
- **Observability** — one JSON line per request (no bodies or query strings:
  they carry upload tokens), and a `/health` that reports storage kind, queue
  mode, render capacity and cluster depth. `ok` stays true while merely busy, so
  a load balancer will not pull the box that is doing the work.
- Operated through a `scripts/orbit-render` CLI: `caps`, `health`, `deploy`,
  `verify`, `logs`, `sh`.

The hosted API is this same service, with our ffmpeg builds and our operational
problems. Nothing about the SDK requires it.

---

## 8. Suggested sections, and the data each one has

Use, drop or reorder freely. The point is that each has real content behind it.

1. **Hero — the dual-render proof.** The 98.2% / median 1 / worst 94 figures. A
   frame shown both ways. This is the only thing on the page no competitor can
   copy.
2. **What you install.** The 12 published packages and the dependency shape.
   Message: take the whole editor or one piece.
3. **What it can do.** The editor feature surface: elements, timeline, 51
   transitions, grades, chroma key, captions with SRT.
4. **The AI layer.** Six operations, their credit costs, and the fact that it is
   optional and charged only on success.
5. **The cloud API.** The pricing table, the short-edge rule, hold-then-settle
   metering, and the two token kinds.
6. **Integration.** How little code it takes; the two auth models.
7. **Self-hosting.** Docker compose, the shared queue, S3-compatible storage.
   Framed as a real alternative, not a downgrade.
8. **Mobile.** The engine travels to a phone. No fake screenshots.
9. **Developer portal CTA.** Sign in with GitHub, create keys, add credits, read
   the docs.

---

## 9. Numbers you can put on the page

| Claim | Value |
|---|---|
| Published packages | 12 |
| Version | 1.0.0-beta.4 |
| Transition families / types | 21 / 51 |
| API routes | 30 |
| Preview vs export agreement | 98.2% of pixels within 2/255, median 1/255 |
| Ungraded agreement | ≤ 2/255 |
| Graded agreement | ≤ 6/255 (worst preset 10) |
| Quality tiers | 5 (480p → 4K) |
| AI operations | 6 |
| Element types | 12 |
| Blend modes | 8 |

---

## 10. Do not claim

- Any customer, logo, testimonial, quote, rating, or user/download count
- Funding, team size, awards, press
- An App Store listing, or any mobile screenshot
- SOC 2, ISO, HIPAA, GDPR compliance or any certification
- Uptime or SLA figures
- "Production ready" without qualification — it is beta, and the honest framing
  is that the blockers were closed but purchase config and social login are
  still open
- A free tier, trial length, or dollar price. Credits are the unit; the dollar
  price per credit is not set yet.
