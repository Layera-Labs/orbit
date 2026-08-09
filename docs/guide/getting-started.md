# Getting Started

> **Not yet on npm.** These packages are not published to a registry; the
> install commands below describe the intended shape once they are. Today Orbit is
> consumed from source in the monorepo — see the [README](../../README.md) for what
> actually works, and the roadmap for when this changes. There is no Orbit API key:
> the render service authenticates with its own JWTs, including guest tokens.

Orbit SDK is a white-label canvas editor for developers building design tools, social media editors, or AI-powered creative applications.

## Prerequisites

- Node.js 20+
- React 18+ (for React wrapper)
- A valid Orbit API key (`orbit_sk_...`)

## Installation

### React

```bash
npm install @layera-labs/react
```

### Next.js

```bash
npm install @layera-labs/next
```

### Vanilla JS (Framework-Agnostic)

```bash
npm install @layera-labs/core
```

## Basic Usage

### React

```tsx
import { OrbitEditor } from '@layera-labs/react';

export default function EditorPage() {
  return (
    <div style={{ height: '100vh' }}>
      <OrbitEditor
        apiKey="orbit_sk_your_key"
        backendUrl="https://api.orbit.ai"
        config={{ width: 1080, height: 1080 }}
        callbacks={{
          onExport: (blob, format) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export.${format}`;
            a.click();
          },
          onError: (error) => console.error(error),
          onPublish: async (design) => {
            await fetch('/api/designs', {
              method: 'POST',
              body: JSON.stringify(design),
            });
          },
        }}
      />
    </div>
  );
}
```

### Vanilla JS

```ts
import { OrbitEngine } from '@layera-labs/core';

const container = document.getElementById('canvas-container');
const engine = new OrbitEngine({ width: 1080, height: 1080 });
engine.init(container!);

// Add a text layer
engine.addLayer({
  type: 'text',
  name: 'Title',
  x: 100, y: 100, width: 400, height: 60,
  rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  visible: true, locked: false, blendMode: 'normal', effects: [],
  content: {
    type: 'text',
    text: 'Hello Orbit',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 700,
    color: '#000000',
    alignment: 'left',
  },
});

// Export as PNG
const blob = await engine.export({ format: 'png', quality: 0.95, scale: 2 });
```

## API Key

Your API key (`orbit_sk_...`) authenticates all requests to the Orbit backend. Pass it to the `apiKey` prop. The backend validates your subscription tier and enforces rate limits.

## Next Steps

- [Configuration Options](/guide/configuration)
- [Layer System](/guide/layers)
- [Video & Audio](/guide/video)
- [AI Tools](/guide/ai-tools)
