# Orbit

An embeddable, white-label **design-canvas editor** for image and video, with an
agentic AI layer. It ships as a set of React packages you can mount inside your
own product, a Next.js web app built on them, a native iOS/Android video editor,
and a render service that does the actual encoding with ffmpeg.

> **Status: in development, not production-ready.** The engine and both editors
> work end to end — you can cut a multi-track video on a phone and export a real
> MP4 — but the APIs still move and some surfaces are unfinished. See
> [docs/roadmap.md](docs/roadmap.md) for direction and
> [docs/feature-status.md](docs/feature-status.md) for an honest per-feature audit.

## What is here

| Path | What it is |
|---|---|
| `apps/mobile` | Native video editor (Expo / React Native / Skia). Where most work happens. |
| `apps/web` | The web product — one editor over the SDK, plus an AI studio. Next.js 14. |
| `apps/render-service` | Express service: upload, render, AI generation, auth, billing. |
| `apps/studio`, `apps/demo`, `apps/demo-next`, `apps/webview-host` | Demos of the SDK. |
| `packages/video` | The canonical video engine: ffmpeg arg builder, effect maths, `renderProject`. |
| `packages/model`, `render`, `providers`, `editor` | The v2 SDK — document model → canvas renderer → provider registry → React UI. |
| `packages/video-gen`, `video-ai` | AI providers (TTS, image and video generation). |
| `packages/core`, `react`, `next`, `ui`, `shared`, `assets`, `effects`, `agentic` | The v1 SDK (legacy, still builds). |

## The one idea worth knowing

**Every effect is rendered twice from one model, and the two must agree.** A
filter, a transition, a blur, a Ken Burns move, a chroma key, a rounded canvas
frame — each is defined once in `packages/video`, then drawn live (Skia on the
phone, canvas 2D in the browser) and encoded by ffmpeg on the server. The maths
is shared rather than reimplemented, and tests parse the real filtergraph and
assert it agrees with the preview's draw list, so a preview that lies about the
export is a failing test rather than a support ticket.

Where the two genuinely cannot agree, the divergence is measured against real
ffmpeg, kept small, and written down.

## Quick start

Node >= 20, pnpm 10.

```bash
pnpm install && pnpm build
```

```bash
pnpm test && pnpm typecheck
```

Run the web app, the SDK demo, or the render service:

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

`apps/mobile` is deliberately **outside** the pnpm workspace and installs with
npm — mixing the two corrupts Metro's module resolution. It also needs a
development build rather than Expo Go, because it renders through Skia.

```bash
cd apps/mobile && npm install
```

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios
```

## Docs

- [docs/roadmap.md](docs/roadmap.md) — status and direction
- [docs/architecture-v2.md](docs/architecture-v2.md) — the v2 technical spec
- [docs/feature-status.md](docs/feature-status.md) — per-feature audit
- [docs/guide/](docs/guide/) — installation, configuration, export, AI, deployment
- [docs/api/](docs/api/) — package APIs
- [AGENTS.md](AGENTS.md) — repo conventions
- [CLAUDE.md](CLAUDE.md) — the deep engineering context: why things are built the
  way they are, and what was measured rather than assumed. Read it before
  changing the engine.

## Licence

[MIT](LICENSE).
