# AI Tools

Orbit's agentic system connects to `api.orbit.ai` to generate and edit media using AI models.

It is **opt-in**. `@orbit/agentic` is an optional peer of `@orbit/react`: install
it, build a backend, and hand that backend to the editor. Skip all of it and the
editor still runs — including video export, which is core editing, not AI.

## Setup

```tsx
import { OrbitBackendAdapter } from '@orbit/agentic';

const backend = new OrbitBackendAdapter('orbit_sk_your_key', 'https://api.orbit.ai');

<OrbitEditor aiBackend={backend} exportBackend={backend} />;
```

Without `aiBackend` the canvas AI button and the agentic drawer are not rendered
at all.

## Available Tools

### Generate Image

Create an image from a text prompt:

```ts
import { useOrbitAgentic } from '@orbit/react/agentic';

const { generate } = useOrbitAgentic({ engine, backend });
const asset = await generate({
  prompt: 'A futuristic city at sunset with flying cars',
  model: 'gpt-4o',
});
engine.addLayer({
  type: 'image',
  name: 'AI Generated',
  x: 0, y: 0, width: 1080, height: 1080,
  content: { type: 'image', src: asset.url, naturalWidth: 1024, naturalHeight: 1024 },
});
```

### Edit Image

Modify an existing image on the canvas:

```ts
const dataUrl = engine.exportToDataURL('png');
const asset = await adapter.editImage({
  prompt: 'Add rain and dark clouds',
  imageBase64: dataUrl,
  model: 'gpt-4o',
});
```

### Inpaint (Change Region)

Edit a specific region using a mask:

```ts
const asset = await adapter.inpaint({
  prompt: 'Add a red sports car',
  imageBase64: dataUrl,
  maskBase64: maskDataUrl,
  model: 'flux-inpaint',
});
```

### Outpaint (Crop & Expand)

Extend the canvas beyond the original boundaries:

```ts
const asset = await adapter.outpaint({
  prompt: 'Extend the sky and add mountains',
  imageBase64: dataUrl,
  width: 1920,
  height: 1080,
  model: 'gpt-4o',
});
```

### Adjust Lighting

Add virtual lights to change scene illumination:

```ts
const asset = await adapter.adjustLighting({
  imageBase64: dataUrl,
  lights: [
    { id: '1', x: 0.5, y: 0.2, z: 1, color: '#ffaa00', brightness: 0.8 },
    { id: '2', x: 0.8, y: 0.5, z: 0.5, color: '#4488ff', brightness: 0.4 },
  ],
  model: 'gpt-4o',
});
```

### Generate Video

Create video from text prompt:

```ts
const asset = await adapter.generateVideo({
  prompt: 'A drone flying over mountains at sunrise',
  duration: 5,
  resolution: '1080p',
  model: 'gpt-4o',
});
```

### Generate Audio

Create background music or sound effects:

```ts
const asset = await adapter.generateAudio({
  prompt: 'Upbeat electronic music for a workout video',
  duration: 30,
  model: 'gpt-4o',
});
```

## System Prompts

The Orbit backend automatically injects system prompts optimized for creative generation. You don't need to write these yourself.

## Rate Limits

AI generation shares the same rate limits as video export. See [Configuration](/guide/configuration) for tier details.

## Error Handling

All AI methods throw on failure. Wrap in try/catch:

```ts
try {
  const asset = await adapter.generateImage({ prompt: '...' });
} catch (error) {
  console.error('AI generation failed:', error.message);
}
```
