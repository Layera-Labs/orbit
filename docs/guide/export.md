# Export

Orbit supports multiple export formats for different use cases.

## Image Export

### PNG

```ts
const blob = await engine.export({ format: 'png', quality: 0.95, scale: 2 });
```

### JPG

```ts
const blob = await engine.export({ format: 'jpg', quality: 0.9, scale: 1 });
```

### SVG

```ts
const svgString = engine.exportToDataURL('svg');
```

## Video Export

### MP4

Requires backend processing. Client generates frames, backend encodes to H.264.

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

Monitor progress via SSE or polling:

```ts
const poller = new ExportJobPoller(adapter, jobId);
poller.onProgress = (p) => console.log(`${p}%`);
poller.onComplete = (url) => console.log('Done:', url);
poller.onError = (e) => console.error(e);
poller.start();
```

### GIF

Client-side generation (capped at 5s / 15fps):

```ts
const blob = await engine.export({ format: 'gif', duration: 5, fps: 15 });
```

### PNG Sequence

Export individual frames as PNG files:

```ts
const frames = await engine.export({ format: 'png-sequence', duration: 10, fps: 30 });
// Array of Blobs, one per frame
```

## Audio Export

### WAV

Client-side mixing via `OfflineAudioContext`:

```ts
const { blob, duration } = await engine.exportAudio({
  duration: 60,
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});
```

### MP3

Requires backend FFmpeg processing. Use the video export flow with `format: 'mp3'`.

## PDF Export

Available in the React wrapper:

```tsx
import { exportToPDF } from '@orbit/react';

const pdfBlob = await exportToPDF(engine, {
  pages: [
    { width: 1080, height: 1080 },
    { width: 1080, height: 1920 },
  ],
});
```

## Export Options

```ts
interface ExportOptions {
  format: 'png' | 'jpg' | 'svg' | 'gif' | 'png-sequence' | 'mp4' | 'pdf' | 'mp3';
  quality?: number;    // 0-1, for lossy formats
  scale?: number;      // Resolution multiplier
  width?: number;      // Target width
  height?: number;     // Target height
  duration?: number;   // For video/audio export
  fps?: number;        // For video export
}
```

## Watermarks

You can add watermarks programmatically:

```ts
engine.addLayer({
  type: 'text',
  name: 'Watermark',
  x: 800, y: 1000, width: 200, height: 40,
  content: {
    type: 'text',
    text: 'My Brand',
    fontSize: 24,
    color: 'rgba(255,255,255,0.5)',
  },
});
```

Watermarks are fully developer-controlled. Orbit adds no branding.

## Export Tiers

| Feature | Pro ($200) | Business ($500) | Enterprise ($2000) |
|---------|-----------|-----------------|-------------------|
| Max Resolution | 1080p | 2K | 4K |
| Max FPS | 30 | 60 | 60 |
| Storage | 50GB | 200GB | 1TB |
| MP4/hour | 5 | 20 | 100 |
| GIF/hour | 20 | 50 | 200 |
| Max Duration | 60s | 120s | 300s |
