# Orbit SDK

> **Not yet on npm.** These packages are not published to a registry; the
> install commands below describe the intended shape once they are. Today Orbit is
> consumed from source in the monorepo — see the [README](../README.md) for what
> actually works, and the roadmap for when this changes. There is no Orbit API key:
> the render service authenticates with its own JWTs, including guest tokens.

**The embeddable, white-label, agentic canvas editor for developers.**

Orbit is a $200/month subscription SDK that gives you a full-featured image/video editor with AI tools, multi-user collaboration, and white-label freedom. No Orbit branding. Full control over styles, icons, colors, and fonts.

## Features

- **Image Editing** — Layers, shapes, text, brushes, smart guides, align/distribute, snap-to-grid
- **Video Engine** — HTML5 video on canvas, playback timeline, transitions, export to MP4/GIF
- **Audio Tracks** — Multi-track mixing, trim, volume, WAV export
- **AI Agentic** — Generate images, edit regions, change lighting, inpaint, outpaint
- **Vector Tools** — Freehand Bézier paths with node editing, pressure-sensitive stylus support
- **Multi-User** — Real-time sync via Yjs + WebSocket, cursor presence
- **White-Label** — Zero branding. You control everything.

## Quick Start

```bash
npm install @layera-labs/react
```

```tsx
import { OrbitEditor } from '@layera-labs/react';

function App() {
  return (
    <OrbitEditor
      apiKey="orbit_sk_your_key"
      backendUrl="https://api.example.com"
      callbacks={{
        onExport: (blob, format) => {
          // Handle exported file
        },
      }}
    />
  );
}
```

## Architecture

Orbit is built as a monorepo with 8 packages:

| Package | Purpose |
|---------|---------|
| `@layera-labs/core` | Vanilla TypeScript canvas engine (Fabric.js v6) |
| `@layera-labs/react` | React wrapper with UI panels |
| `@layera-labs/next` | Next.js wrapper |
| `@layera-labs/ui` | Themeable UI component library |
| `@layera-labs/shared` | Types, utilities, constants |
| `@layera-labs/agentic` | AI backend adapter |
| `@layera-labs/effects` | WebGL shaders |
| `@layera-labs/assets` | Asset utilities |

## Next Steps

- [Getting Started Guide](/guide/getting-started)
- [API Reference](/api/core)
- [Architecture Overview](/guide/architecture)

## Running it for real

- [Beta 1 — what is in it, and what is not](/guide/beta-1) — scope, known
  limits, and the features blocked on third-party credentials.
- [Deploying Orbit](/guide/deploying) — the render service, the web app and the
  mobile build, in the order the problems actually arrive.
