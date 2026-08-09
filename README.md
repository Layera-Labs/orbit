# Orbit

An embeddable, white-label **design-canvas editor SDK** for image and video, with
an agentic AI layer. It ships as a set of React packages you mount inside your own
product, a Next.js web app built on them, a small React Native example client, and
a render service that does the actual encoding with ffmpeg.

> ### Status: public beta of the source, not of the packages
>
> The engine and the web editor work end to end — you can cut a multi-track video
> in the browser and export a real MP4 — and **1,424 tests pass** across the
> workspace (`pnpm test`, 41 tasks, 116 files, 58 skipped), plus 19 in
> `examples/mobile`, which sits outside the workspace.
>
> **One invariant is currently unenforced, and it is worth knowing about.** The
> native editor left for its own repo on 2026-08-08, and its 34 parity tests —
> the mirror checks that prove its Skia preview still agrees with this engine —
> **fail there today**, because they import `packages/video` across a repo
> boundary that no longer exists. Nothing in this repo is red; the missing half
> of the dual-render proof simply lives somewhere it cannot reach, and publishing
> is what repairs it.
>
> **Nothing is on npm yet.** `npm install @layera-labs/react` does not work today; the
> packages are consumed from source in this workspace. Publishing is the next
> milestone — see [Roadmap](#roadmap). Until then the APIs move without notice.
>
> Prep is done as of 2026-08-09: 12 packages are marked publishable at
> `1.0.0-beta.2`, the other 8 are `private: true`, and the tarballs have been
> packed and installed into a scratch Vite app and a scratch Next app outside
> this repo — both build, both typecheck under `skipLibCheck: false`, and neither
> browser bundle contains a `node:` builtin. The one thing left is choosing a
> registry and an access level, which is why `publishConfig` is absent rather
> than guessed.
>
> **React 18 only.** Every peer is `^18` and that is not conservatism: the packed
> tarballs fail `ERESOLVE` outright against React 19, because `react-konva@18.2.x`
> is the React-18 line and two React copies is a hard crash in Konva's reconciler.
> React 19 was actually attempted — it needs `react-konva@19` plus three source
> lines, after which the full suite passes — but the suite does not mount the
> reconciler, so that is not yet evidence. See CLAUDE.md for the measurement.
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
| `examples/studio` · `demo` · `demo-next` · `webview-host` | SDK demos, one idea each. |
| `examples/mobile` | A small React Native client: AI studio, editor timeline, export. Installs with **npm**, outside the workspace. |

## The one idea worth knowing

**Every effect is rendered twice from one model, and the two must agree.**

A filter, a transition, a blur, a Ken Burns move, a chroma key, a rounded canvas
frame — each is defined once in `packages/video`, then drawn live (canvas 2D in the
browser, Skia in the native editor) and encoded by ffmpeg on the server. The maths
is shared rather than reimplemented, and **tests parse the real filtergraph and
assert it agrees with the preview's draw list**, so a preview that lies about the
export is a failing test rather than a support ticket.

Two of the three renderers are here and their agreement is tested on every run.
The third — the Skia preview — moved to its own repo and its mirror tests are
broken until the packages publish; see the status note above.

Where the two genuinely cannot agree, the divergence is measured against real
ffmpeg, kept small, and written down. Measured today: ungraded clips, alpha ramps
and geometry agree to **≤2/255**; colour grading to **≤6/255**, reaching 10 on the
`vivid` preset's saturated colour.

If you change the engine, read [CLAUDE.md](CLAUDE.md) first. It records what was
measured rather than assumed, and most of it was learned the expensive way.

---

## Feature status

Legend: ✅ done · ◐ partial, with the gap named · ○ not built.

### Video engine (`@layera-labs/video`)

| Feature | | Notes |
|---|:--:|---|
| Multi-track timeline model | ✅ | Versioned `schemaVersion 1\|2\|3` with migrations run on open |
| Server render → MP4 | ✅ | Native ffmpeg filtergraph. No headless browser anywhere |
| Fractional render progress, timeouts, graceful failure | ✅ | |
| Transitions | ◐ | 22 families / 52 variants; **51 offered**, 1 export-only (`hblur` — a forward box filter half the frame wide, which Skia cannot do at a viable cost) |
| Filters / colour grade | ✅ | Modelled on ffmpeg's YUV planes, BT.601. Not byte-identical — see above |
| Ken Burns motion, blur, chroma key, masks, blend modes, speed | ✅ | Dual-rendered |
| Clip rotation + crop | ✅ | One cover-fit; measured against ffmpeg 8.1.2 |
| Canvas frame (mat) | ✅ | Even-odd hole; concentric outer radius |
| Element animation (fade / slide) | ✅ | Deliberately no scale: ffmpeg cannot animate it per frame |
| Audio fades + volume curves | ✅ | One writer, so a curve and a slider cannot disagree |
| Text metrics + wrapping | ✅ | Real sfnt advance widths; `maxWidth` in output pixels |
| Image overlays / stickers / logo watermarks | ✅ | Go down the clip path, so placement is shared |
| `ShapeOverlay` (rect / ellipse) | ✅ | Dual-rendered as a full-frame plate, like a caption. Fill, stroke, corner radius, rotation. **No editor UI authors one** — `@layera-labs/formats` does |
| Word-timing render (karaoke captions) | ◐ | Shipped: `TextOverlay.highlight` opts in and the caption is sliced into one plate per word window, in both renderers. Capped at 64 words, above which it degrades to a static caption. **No editor UI authors one** — the pipeline sets it from the transcript |
| SRT caption export | ✅ | |
| Thumbnail / poster frame | ✅ | `RenderResult.thumbnailPath`, opt-in |
| `RenderResult` metadata | ◐ | `path`, `durationSec`, `bytes`, `thumbnailPath`. No `width`/`height`/`fps`/`encodeMs` |
| Segment / parallel rendering | ○ | One call is one encode. Needed for long-form, not before |

### Generation pipeline (`@layera-labs/pipeline`, `@layera-labs/formats`)

| Feature | | Notes |
|---|:--:|---|
| `ScenePlan` contract, schema-validated, retried | ✅ | Never prose |
| Swappable LLM `Brain` | ✅ | Any OpenAI-compatible `chat/completions` endpoint |
| Step runner with per-step idempotency | ✅ | Keyed `(job, step)`, per scene — a retry re-pays for one scene, not five |
| `generation_jobs` queue + worker | ✅ | Claim / heartbeat / stale sweep, modelled on the render queue |
| `resolveVisual` seam + content-hash cache | ✅ | Openverse (CC0, no key) or Pexels |
| Voice → measured duration → alignment | ✅ | Duration is ffprobed, never estimated. Alignment degrades rather than fails |
| Credit hold / settle / release | ✅ | Held on accept, settled on output, released on failure |
| `POST /v1/generate` + example client UI | ✅ | Topic in, job id out, poll to completion. All four formats are selectable over HTTP |
| Formats | ✅ | Four archetypes in `FORMATS`: `story`, `listicle`, `split`, `chat`. The runner dispatches to `format.compose`, so a format decides the video's shape rather than being composed as a story |
| Brand kit | ✅ | `brandOf` fills the defaults, `logoOverlays` places the mark; all four formats read it |
| Stock **footage**, over HTTP | ✅ | `story`, `listicle` and `split` ask for `visualKind: 'video'`, and `split` also wants a filler clip. The service fills both slots from `PEXELS_API_KEY` — stills-mode in one, videos-mode in the other, because stock search is per-provider. Openverse has no video corpus, so without a key the formats fall back to stills and the finished job says so (`visualsDowngraded` / `fillerSkipped`); `/health` reports `capabilities.stockVideo` either way |
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
pnpm --filter @layera-labs/web dev
```

```bash
pnpm --filter @layera-labs/studio dev
```

The render service has no `dev` script — it compiles and runs:

```bash
pnpm --filter @layera-labs/render-service build
pnpm --filter @layera-labs/render-service start
```

### ffmpeg

The render service shells out to `ffmpeg` and `ffprobe`. Any build from 5.1
onwards works; **6.1+ unlocks 8 more transition variants** — Push ×4 and Reveal
×4, whose `cover*` / `reveal*` tokens do not exist before it. Ask a box what it
has:

```bash
scripts/orbit-render caps
```

---

## Using the SDK

> Until the packages are published, these imports resolve through the workspace.
> Inside this repo add `"@layera-labs/video": "workspace:*"` to your app's
> `package.json`. From outside, see [Roadmap](#roadmap).
>
> Note which packages are in the first publish. `@layera-labs/video`, `model`, `render`,
> `providers`, `editor`, `core`, `react`, `next`, `ui`, `shared`, `effects` and
> `agentic` are marked publishable. `@layera-labs/pipeline` and `@layera-labs/formats` — the
> generation example below — are among the eight kept `private: true`, along with
> `auth`, `billing`, `video-gen`, `video-ai`, `assets` and `react-native`. Each
> manifest carries its own reason.

### Mount the image editor

```tsx
import { OrbitEditor } from '@layera-labs/editor';
import { createStore } from '@layera-labs/model';

const store = createStore();

export default function Page() {
  return <OrbitEditor store={store} defaultTheme="light" />;
}
```

`OrbitEditor` takes `store`, `providers`, `sections`, and a controlled `theme` with
`onThemeChange`. Pass `theme` and the host owns it — otherwise a stored preference
outlives `defaultTheme` and leaves a light editor inside a dark application.

### The AI layer is opt-in

`@layera-labs/agentic` is an **optional peer** of `@layera-labs/react`, and the hook that needs
it lives behind a subpath:

```ts
import { useOrbitAgentic } from '@layera-labs/react/agentic';
```

`ai-optional.test.ts` walks the main entry's import graph and asserts it names
`@layera-labs/agentic` in no import form at all — not at runtime, and not in types
either, since the canvas-agent shapes it needs come from `@layera-labs/shared`. What is
proven is the source graph and the manifest, not an install: nothing here runs
`npm install --omit=optional` against a registry that has no packages on it yet.

### Build a video project and render it

```ts
import { createProject } from '@layera-labs/video/browser';
import { renderProject } from '@layera-labs/video/node';

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

**Import the right entry.** The default `@layera-labs/video` entry is browser-safe — it
is `./browser` under another name, and both reach the same 31 modules with no
`node:` import. `@layera-labs/video/node` is the superset that adds ffmpeg, resvg and
`fs`; name it only from Node. `browser-safety.test.ts` walks **both** the default
and `./browser` and fails if a `node:` builtin ever reaches either.

### Preview a frame without rendering

`frameStateAt` returns a `DrawOp[]` — a draw list the compositor executes. It
computes everything and draws nothing, which is what lets the browser and Skia
previews share one answer with the export.

```ts
import { frameStateAt } from '@layera-labs/video/browser';

const ops = frameStateAt(project, 3.25); // what is on screen at t=3.25s
```

### Generate a video from a topic

```ts
import { generate } from '@layera-labs/pipeline';
import { story } from '@layera-labs/formats';

const out = await generate(
  { brain, voice, provider, store, log, render },
  jobId,
  { topic: 'Why bread goes stale faster in the fridge', format: story, aspect: '9:16' },
);
// → { url, plan, project, compromises,
//     alignmentSkipped?, visualsDowngraded?, fillerSkipped? }
```

Every dependency is injected: no provider, no filesystem, no ffmpeg. That is what
lets the sequencing — the part with the reasoning in it — be tested without a key,
a network or an encoder.

The three optional fields are the honest ones. A generation that has already paid
for a language model and a voice does not die because the box lacks a stock video
key or a forced alignment — it degrades, and names what it gave up.

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
4. **Keep `@layera-labs/video`'s default entry browser-safe.** It is `export * from
   './browser'` and that purity is now a promise to consumers, not an internal
   convention. Anything needing ffmpeg, resvg or `fs` goes in `./node`.
   `browser-safety.test.ts` walks both entries and fails on a `node:` builtin.
5. **An Expo app under `examples/` installs with npm, never pnpm** — pnpm's
   symlinked store corrupts Metro's module resolution, which is why such an app
   sits outside the workspace.

### Getting a change in

```bash
pnpm install && pnpm build
pnpm test && pnpm typecheck        # workspace
cd examples/mobile && npx vitest run   # Expo examples are outside the workspace
```

- Branch from `staging`. `main` is the release branch.
- Commits use short imperative subjects with a scope: `video: …`, `pipeline: …`,
  `service: …`, `fix(editor): …`.
- **Write down why, not what.** The commit message and the comment should explain
  the reasoning and what was measured. Look at `git log` for the house style — it
  is a large part of how this codebase stays understandable.
- Gated suites: `ORBIT_FFMPEG_PROBE=1` runs the tests that need a real ffmpeg,
  `ORBIT_TEST_DATABASE_URL` the ones that need a real Postgres. Both skip rather
  than pass on a stub.
- Conventions: [AGENTS.md](AGENTS.md). Engineering context: [CLAUDE.md](CLAUDE.md).

### Good first areas

- **Editor UI for the two overlay features the engine already renders** — a shape
  overlay and a karaoke caption both dual-render today, and nothing in the web
  editor can author either. `overlayLabel` in `videoStore.ts` already names a
  shape on the timeline; the panels do not exist.
- **A format** in `@layera-labs/formats` — pure `(ScenePlan, Assets, Brand) → VideoProject`.
  Four exist; `formats.test.ts` shows what a new one has to satisfy.
- **An SSE route for generation jobs** — the render one is the template.
- **A migration runner** — before the next table lands, not after.

---

## Roadmap

Near-term, in order:

1. **Publish `@layera-labs/*` to a registry.** The current milestone, and it gates
   everything below. The packaging is done — 12 publishable at `1.0.0-beta.2`, 8
   `private: true` — and what is left is one decision nobody should guess:
   **which registry, at what access level.** Public npm needs
   `{"access":"public"}` or a scoped publish fails; GitHub Packages needs its own
   registry. That is why `publishConfig` is absent from every manifest rather
   than filled in. The scope itself is settled: `@layera-labs`, because `@orbit`
   on npm belongs to the unrelated Orbit.js project and publishing under it 403s.
2. **Repair the parity tests.** orbit-mobile's 34 mirror checks on the
   dual-render invariant fail today because they import across a repo boundary.
   Re-point those 12 files at the published `@layera-labs/video/browser` — the same day
   the packages go up, not later. Until then a change to an effect here can
   diverge from that app's preview with nothing to say so.
3. **Finish the repo split.** The mobile editor left on 2026-08-08. Shortspilot
   follows, consuming published packages like any other customer.

Longer view: [docs/roadmap.md](docs/roadmap.md).

## Docs

- [docs/roadmap.md](docs/roadmap.md) — status and direction
- [docs/architecture-v2.md](docs/architecture-v2.md) — the v2 technical spec
- [docs/feature-status.md](docs/feature-status.md) — an earlier per-feature audit
  (2026-07-26). It predates the repo split and still describes `apps/mobile`,
  which now lives elsewhere. Read it as a snapshot, not as current status
- [docs/guide/](docs/guide/) — configuration, export, AI, deployment
- [AGENTS.md](AGENTS.md) — repo conventions
- [CLAUDE.md](CLAUDE.md) — why things are built the way they are, and what was
  measured rather than assumed. Read it before changing the engine.

## Licence

[MIT](LICENSE).
