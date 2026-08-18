# Agentic API

## `OrbitBackendAdapter`

An HTTP client for a backend **you host**, with Orbit's system prompts injected on
the way out. Both arguments are required — there is no Layera-operated service and
no default URL, and the constructor throws if you omit one.

```ts
import { OrbitBackendAdapter } from '@layera-labs/orbit-agentic';

const adapter = new OrbitBackendAdapter(apiKey, 'https://api.layeralabs.com');
```

### Methods

#### Image Generation
```ts
const asset = await adapter.generateImage({
  prompt: 'A futuristic city at sunset',
  model: 'gpt-4o',
});
// asset.url, asset.id, asset.mimeType
```

#### AI Edit
```ts
const asset = await adapter.editImage({
  prompt: 'Make it rain',
  imageBase64: canvasDataUrl,
  model: 'gpt-4o',
});
```

#### Inpaint (Change Region)
```ts
const asset = await adapter.inpaint({
  prompt: 'Add a red car',
  imageBase64: canvasDataUrl,
  maskBase64: maskDataUrl,
  model: 'flux-inpaint',
});
```

#### Outpaint (Crop & Expand)
```ts
const asset = await adapter.outpaint({
  prompt: 'Extend the sky',
  imageBase64: canvasDataUrl,
  width: 1920,
  height: 1080,
  model: 'gpt-4o',
});
```

#### Lighting
```ts
const asset = await adapter.adjustLighting({
  imageBase64: canvasDataUrl,
  lights: [
    { id: '1', x: 0.5, y: 0.2, z: 1, color: '#ffaa00', brightness: 0.8 },
  ],
  model: 'gpt-4o',
});
```

#### Video Generation
```ts
const asset = await adapter.generateVideo({
  prompt: 'A drone flying over mountains',
  duration: 5,
  resolution: '1080p',
  model: 'gpt-4o',
});
```

#### Audio Generation
```ts
const asset = await adapter.generateAudio({
  prompt: 'Upbeat electronic music',
  duration: 30,
  model: 'gpt-4o',
});
```

#### Video Export
```ts
const { jobId, uploadUrl } = await adapter.initVideoExport({
  format: 'mp4',
  resolution: '1080p',
  fps: 30,
  duration: 10,
  width: 1920,
  height: 1080,
  quality: 'production',
});
```
