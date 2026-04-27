# Orbit SDK

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
npm install @orbit/react
```

```tsx
import { OrbitEditor } from '@orbit/react';

function App() {
  return (
    <OrbitEditor
      apiKey="orbit_sk_your_key"
      backendUrl="https://api.orbit.ai"
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
| `@orbit/core` | Vanilla TypeScript canvas engine (Fabric.js v6) |
| `@orbit/react` | React wrapper with UI panels |
| `@orbit/next` | Next.js wrapper |
| `@orbit/ui` | Themeable UI component library |
| `@orbit/shared` | Types, utilities, constants |
| `@orbit/agentic` | AI backend adapter |
| `@orbit/effects` | WebGL shaders |
| `@orbit/assets` | Asset utilities |

## Next Steps

- [Getting Started Guide](/guide/getting-started)
- [API Reference](/api/core)
- [Architecture Overview](/guide/architecture)
