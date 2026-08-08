# Orbit

An embeddable, white-label **design-canvas editor SDK** for image and video, with
an agentic AI layer. It ships as a set of React packages you mount inside your own
product, a Next.js web app built on them, a native iOS/Android video editor, and a
render service that does the actual encoding with ffmpeg.

> ### Status: public beta of the source, not of the packages
>
> The engine and both editors work end to end — you can cut a multi-track video on
> a phone and export a real MP4 — and **1,911 tests** pass (1,583 in the workspace,
> 328 in the mobile app).
>
> **Nothing is on npm yet.** `npm install @orbit/react` does not work today; the
> packages are consumed from source in this workspace. Publishing is the next
> milestone — see [Roadmap](#roadmap). Until then the APIs move without notice.
>
> Some guides under `docs/guide/` were written ahead of that and describe
> registry installs and an API key. Treat this README as the accurate one.

---

## Contents

- [What is here](#what-is-here)
- [The one idea worth knowing](#the-one-idea-worth-knowing)
- [Feature status](#feature-status) — done / partial / pending
- [Install and run](#install-and-run)
- [Using the SDK](#using-the-sdk)
- [The render service](#the-render-service)
- [Contributing](#contributing)
- [Roadmap](#roadmap)

---

## What is here

A pnpm + Turbo TypeScript monorepo. Node >= 20, pnpm 10.

Four top-level directories, split by what a thing **is**: `packages/` is the SDK,
`services/` is what gets deployed, `apps/` is the shipped products, `examples/` is
small demos.

| Path | What it is |
|---|---|
| `packages/video` | **The canonical video engine.** ffmpeg arg builder, `renderProject`, and all effect maths. |
| `packages/model` · `render` · `providers` · `editor` | The **v2 image SDK**: Valtio document model → react-konva renderer → provider registry → React UI. |
| `packages/pipeline` · `formats` | Brief → `ScenePlan` → `VideoProject`. The generation seam and the format library. |
| `packages/video-gen` · `video-ai` | AI providers — ElevenLabs TTS + transcription, Runway, Replicate, mock. |
| `packages/auth` · `billing` | Four auth adapters plus guest tokens; a credit ledger with hold/settle/release. |
| `packages/core` · `react` · `next` · `ui` · `shared` · `assets` · `effects` · `agentic` | The v1 SDK. Legacy, still builds, still used by the demos. |
| `services/render` | Express: upload, render, generation, auth, billing, storage. |
| `apps/web` | The web product — one editor over the SDK, plus an AI studio. Next.js 14. |
| `apps/mobile` | Native video editor. Expo SDK 55 / RN 0.83 / React 19 / Skia. **Outside the pnpm workspace** — see below. |
| `examples/studio` · `demo` · `demo-next` · `webview-host` | SDK demos. |

## The one idea worth knowing

**Every effect is rendered twice from one model, and the two must agree.**

A filter, a transition, a blur, a Ken Burns move, a chroma key, a rounded canvas
frame — each is defined once in `packages/video`, then drawn live (Skia on the
phone, canvas 2D in the browser) and encoded by ffmpeg on the server. The maths is
shared rather than reimplemented, and **tests parse the real filtergraph and assert
it agrees with the preview's draw list**, so a preview that lies about the export is
a failing test rather than a support ticket.

Where the two genuinely cannot agree, the divergence is measured against real
ffmpeg, kept small, and written down. Measured today: ungraded clips, alpha ramps
and geometry agree to **≤2/255**; colour grading to **≤6/255**, reaching 10 on the
`vivid` preset's saturated colour.

If you change the engine, read [CLAUDE.md](CLAUDE.md) first. It records what was
measured rather than assumed, and most of it was learned the expensive way.

---

## Feature status

Legend: ✅ done · ◐ partial, with the gap named · ○ not built.

### Video engine (`@orbit/video`)

| Feature | | Notes |
|---|:--:|---|
| Multi-track timeline model | ✅ | Versioned `schemaVersion 1\|2\|3` with migrations run on open |
| Server render → MP4 | ✅ | Native ffmpeg filtergraph. No headless browser anywhere |
| Fractional render progress, timeouts, graceful failure | ✅ | |
| Transitions | ◐ | 36 families; **34 offered**, 2 export-only (`pixelize`, `hblur` have no faithful Skia preview) |
| Filters / colour grade | ✅ | Modelled on ffmpeg's YUV planes, BT.601. Not byte-identical — see above |
| Ken Burns motion, blur, chroma key, masks, blend modes, speed | ✅ | Dual-rendered |
| Clip rotation + crop | ✅ | One cover-fit; measured against ffmpeg 8.1.2 |
| Canvas frame (mat) | ✅ | Even-odd hole; concentric outer radius |
| Element animation (fade / slide) | ✅ | Deliberately no scale: ffmpeg cannot animate it per frame |
| Audio fades + volume curves | ✅ | One writer, so a curve and a slider cannot disagree |
| Text metrics + wrapping | ✅ | Real sfnt advance widths; `maxWidth` in output pixels |
| Image overlays / stickers / logo watermarks | ✅ | Go down the clip path, so placement is shared |
| **`ShapeOverlay`** | ◐ | Declared in the type; **no renderer draws it**. Skipped symmetrically in all three, deliberately |
| **Word-timing render (karaoke captions)** | ◐ | `TextOverlay.words` reaches compose time in absolute seconds; **nothing renders it** |
| SRT caption export | ✅ | |
| Thumbnail / poster frame | ✅ | `RenderResult.thumbnailPath`, opt-in |
| `RenderResult` metadata | ◐ | `path`, `durationSec`, `bytes`, `thumbnailPath`. No `width`/`height`/`fps`/`encodeMs` |
| Segment / parallel rendering | ○ | One call is one encode. Needed for long-form, not before |

### Generation pipeline (`@orbit/pipeline`, `@orbit/formats`)

| Feature | | Notes |
|---|:--:|---|
| `ScenePlan` contract, schema-validated, retried | ✅ | Never prose |
| Swappable LLM `Brain` | ✅ | Any OpenAI-compatible `chat/completions` endpoint |
| Step runner with per-step idempotency | ✅ | Keyed `(job, step)`, per scene — a retry re-pays for one scene, not five |
| `generation_jobs` queue + worker | ✅ | Claim / heartbeat / stale sweep, modelled on the render queue |
| `resolveVisual` seam + content-hash cache | ✅ | Openverse (CC0, no key) or Pexels |
| Voice → measured duration → alignment | ✅ | Duration is ffprobed, never estimated. Alignment degrades rather than fails |
| Credit hold / settle / release | ✅ | Held on accept, settled on output, released on failure |
| `POST /v1/generate` + mobile UI | ✅ | Topic in, job id out, poll to completion |
| **Formats** | ◐ | **1 of 5**: `story`. Split-screen needs no engine work; chat, quiz and listicle need `ShapeOverlay` |
| Never run against real vendors | ⚠ | The LLM, ElevenLabs and Openverse paths are tested against fakes only |

### Render service

| Feature | | Notes |
|---|:--:|---|
| Auth: guest tokens, self-hosted, Clerk, Supabase, Firebase | ✅ | Every route under a JWT |
| Credit ledger + metering | ✅ | Append-only; hold/settle/release |
| Durable render queue | ✅ | In-process, or Postgres with `FOR UPDATE SKIP LOCKED` — multi-replica safe |
| Object storage | ✅ | Local disk or any S3-compatible bucket, hand-rolled SigV4 |
| Cloud project sync | ✅ | Documents only; LWW with the winner returned on conflict |
| Password reset by email | ✅ | The service serves its own reset page |
| Rate limiting | ✅ | All routes, including the four AI ones |
| Structured logs + request ids | ✅ | One JSON line per request; ids reach `render_jobs` |
| ffmpeg capability probe on `/health` | ✅ | HDR and the exact `xfade` token list |
| SSE progress | ◐ | Render jobs only. **Generation jobs have no SSE** — clients poll |
| Migration runner | ○ | Schema is `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` |
| Duration-based render pricing | ○ | Flat `ORBIT_RENDER_COST`, off by default |
| Project version history | ○ | One row per project, last-write-wins |

### Clients

| Feature | | Notes |
|---|:--:|---|
| Mobile video editor | ✅ | Multi-track timeline, trim, effects, audio, export to Photos |
| Mobile "topic → video" screen | ✅ | Needs an LLM configured on the server |
| Web editor (image + video, one shell) | ✅ | `/design/[id]` |
| Web AI studio | ✅ | |
| Social login (Apple / Google) | ○ | Credential-dependent |
| In-app purchase config | ○ | Webhook exists, RevenueCat-shaped |
| Publishing to YouTube / TikTok | ○ | Not started |

**Deliberately not built**, with reasons: speed ramping (ffmpeg cannot smoothly ramp
audio tempo, so no faithful preview — constant per-clip speed *is* shipped), and
keyframed scale/rotation (ffmpeg cannot animate scale per frame).

---

## Install and run

```bash
git clone https://github.com/Layera-Labs/orbit.git
cd orbit
pnpm install && pnpm build
```

```bash
pnpm test && pnpm typecheck
```

Run a surface:

```bash
pnpm --filter @orbit/web dev
```

```bash
pnpm --filter @orbit/studio dev
```

```bash
pnpm --filter @orbit/render-service dev
```

### The mobile app

`apps/mobile` is deliberately **outside** the pnpm workspace and installs with npm.
Mixing the two corrupts Metro's module resolution. It also needs a development
build rather than Expo Go, because it renders through Skia.

```bash
cd apps/mobile && npm install
```

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios
```

The UTF-8 locale is not optional — without it CocoaPods crashes inside its own
error reporter with a message that looks like a broken install and is not.

### ffmpeg

The render service shells out to `ffmpeg` and `ffprobe`. Any build from 5.1
onwards works; **6.1+ unlocks 8 more transition families** (`push*`, `reveal*` do
not exist before it). Ask a box what it has:

```bash
scripts/orbit-render caps
```

---

## Using the SDK

> Until the packages are published, these imports resolve through the workspace.
> Inside this repo add `"@orbit/video": "workspace:*"` to your app's
> `package.json`. From outside, see [Roadmap](#roadmap).

### Mount the image editor

```tsx
import { OrbitEditor } from '@orbit/editor';
import { createStore } from '@orbit/model';

const store = createStore();

export default function Page() {
  return <OrbitEditor store={store} defaultTheme="light" />;
}
```

`OrbitEditor` takes `store`, `providers`, `sections`, and a controlled `theme` with
`onThemeChange`. Pass `theme` and the host owns it — otherwise a stored preference
outlives `defaultTheme` and leaves a light editor inside a dark application.

### Build a video project and render it

```ts
import { createProject } from '@orbit/video/browser';
import { renderProject } from '@orbit/video/node';

const project = createProject({
  width: 1080,
  height: 1920,
  tracks: [
    {
      id: 'main',
      kind: 'visual',
      clips: [
        { id: 'c1', type: 'image', src: '/tmp/a.jpg', start: 0, duration: 3 },
        { id: 'c2', type: 'image', src: '/tmp/b.jpg', start: 3, duration: 3,
          transitionIn: { type: 'fade', duration: 0.5 } },
      ],
    },
  ],
});

const result = await renderProject(project, {
  outputPath: '/tmp/out.mp4',
  onFraction: (f) => console.log(`${Math.round(f * 100)}%`),
  thumbnail: { path: '/tmp/out.jpg', atSec: 1 },
});
// → { path, durationSec, bytes, thumbnailPath? }
```

**Import the right entry.** `@orbit/video/browser` is pure and browser-safe;
`@orbit/video/node` adds ffmpeg, resvg and `fs`. A test walks the import graph and
fails if a `node:` builtin ever reaches the browser entry — never import the
default `.` entry from a web bundle.

### Preview a frame without rendering

`frameStateAt` returns a `DrawOp[]` — a draw list the compositor executes. It
computes everything and draws nothing, which is what lets the browser and Skia
previews share one answer with the export.

```ts
import { frameStateAt } from '@orbit/video/browser';

const ops = frameStateAt(project, 3.25); // what is on screen at t=3.25s
```

### Generate a video from a topic

```ts
import { generate } from '@orbit/pipeline';
import { story } from '@orbit/formats';

const out = await generate(
  { brain, voice, provider, store, log, render },
  jobId,
  { topic: 'Why bread goes stale faster in the fridge', format: story, aspect: '9:16' },
);
// → { url, plan, project, compromises, alignmentSkipped? }
```

Every dependency is injected: no provider, no filesystem, no ffmpeg. That is what
lets the sequencing — the part with the reasoning in it — be tested without a key,
a network or an encoder.

Over HTTP, the same thing is `POST /v1/generate` → `202 {id}` → poll
`GET /v1/generate/:id`.

---

## The render service

```bash
cd services/render && cp .env.example .env
docker compose up
```

`.env.example` documents every variable with the reasoning. The ones most often
wanted: `DATABASE_URL`, `ORBIT_JWT_SECRET` (required in production),
`ORBIT_S3_*`, `ELEVENLABS_API_KEY`, `ORBIT_LLM_*` for generation.

Operate it through one script:

```bash
scripts/orbit-render health
```

`caps` reports what the box's ffmpeg can actually do, `deploy` pulls and rebuilds
and prints the build that answered, `verify` re-measures the transition fixtures
inside the container, `logs` and `sh` do what they say.

Full guide: [docs/guide/deploying.md](docs/guide/deploying.md).

---

## Contributing

Contributions are welcome. The bar is unusual in one specific way, so it is worth
stating up front.

### The rules that are not negotiable

1. **Dual-render agreement.** Any change to an effect must land in *both* the
   preview and the ffmpeg export, with a test that parses the real filtergraph and
   asserts they agree. A broken agreement test is a stop-the-line event, not a
   flaky test to retry.
2. **Measure ffmpeg, do not reason about it.** Probe the filter with known RGB
   bytes and read the output. That method has caught several shipping bugs that
   looked obviously correct on paper; the repo is full of comments recording what
   the measurement actually said.
3. **Never gate content on an animation.** Nothing may start at `opacity: 0` and
   rely on a reveal firing. If the animation never runs, the content must still be
   fully there.
4. **`apps/mobile` is standalone npm.** Never run `pnpm add` inside it. It hand-
   mirrors modules from `packages/video` and **12 test files keep those mirrors
   honest** by importing the canonical copy by relative path. Land the package
   change, its test, the mirror and its parity test in *one* commit — the pattern
   only works because the two copies are never simultaneously in motion.
5. **No emoji in mobile UI.** They render as tofu in the simulator. Use
   `src/components/VIcon.tsx`.

### Getting a change in

```bash
pnpm install && pnpm build
pnpm test && pnpm typecheck        # workspace
cd apps/mobile && npx vitest run   # mobile is outside the workspace
```

- Branch from `staging`. `main` is the release branch.
- Commits use short imperative subjects with a scope: `video: …`, `mobile: …`,
  `service: …`, `fix(editor): …`.
- **Write down why, not what.** The commit message and the comment should explain
  the reasoning and what was measured. Look at `git log` for the house style — it
  is a large part of how this codebase stays understandable.
- Gated suites: `ORBIT_FFMPEG_PROBE=1` runs the tests that need a real ffmpeg,
  `ORBIT_TEST_DATABASE_URL` the ones that need a real Postgres. Both skip rather
  than pass on a stub.
- Conventions: [AGENTS.md](AGENTS.md). Engineering context: [CLAUDE.md](CLAUDE.md).

### Good first areas

- **`ShapeOverlay` renderer** — the geometry already matches `ImageOverlay`, and
  `overlay-union.test.ts` exists precisely so a third overlay kind cannot be
  half-added. Unblocks three format archetypes.
- **A format** in `@orbit/formats` — pure `(ScenePlan, Assets, Brand) → VideoProject`.
  Split-screen needs no engine work at all.
- **An SSE route for generation jobs** — the render one is the template.
- **A migration runner** — before the next table lands, not after.

---

## Roadmap

Near-term, in order:

1. **Publish `@orbit/*` to a registry.** This is the current milestone and it
   gates everything below. Today 18 of 20 manifests have no `private` flag and no
   package is on npm.
2. **Split the repo.** Orbit becomes the SDK; `apps/mobile` and the Shortspilot
   product move to their own repos; `examples/` here gets one small app per
   feature instead of a 40k-line product. Publishing must come first — it is what
   lets the mobile parity tests survive the move. See the TODO section in
   [CLAUDE.md](CLAUDE.md) for why the ordering is forced.
3. Then: the shape renderer, the karaoke caption effect, and the rest of the
   format library.

Longer view: [docs/roadmap.md](docs/roadmap.md).

## Docs

- [docs/roadmap.md](docs/roadmap.md) — status and direction
- [docs/architecture-v2.md](docs/architecture-v2.md) — the v2 technical spec
- [docs/feature-status.md](docs/feature-status.md) — an earlier per-feature audit
- [docs/guide/](docs/guide/) — configuration, export, AI, deployment
- [AGENTS.md](AGENTS.md) — repo conventions
- [CLAUDE.md](CLAUDE.md) — why things are built the way they are, and what was
  measured rather than assumed. Read it before changing the engine.

## Licence

[MIT](LICENSE).
