# Configuration

> **Not yet on npm.** These packages are not published to a registry; the
> install commands below describe the intended shape once they are. Today Orbit is
> consumed from source in the monorepo — see the [README](../../README.md) for what
> actually works, and the roadmap for when this changes. There is no Orbit API key:
> the render service authenticates with its own JWTs, including guest tokens.

Orbit is highly configurable. You can control canvas size, tool defaults, upload behavior, themes, and more.

## Canvas Configuration

```ts
interface EngineConfig {
  width?: number;   // Canvas width in pixels (default: 1080)
  height?: number;  // Canvas height in pixels (default: 1080)
  backgroundColor?: string; // Default canvas background
}
```

## OrbitEditor Props

```ts
interface OrbitEditorProps {
  apiKey: string;
  backendUrl?: string;
  theme?: string;
  config?: {
    width?: number;
    height?: number;
  };
  providers?: {
    photos?: AssetProvider;
    videos?: AssetProvider;
  };
  callbacks?: {
    onExport?: (blob: Blob, format: string) => void;
    onError?: (error: Error) => void;
    onPublish?: (design: any) => Promise<void>;
    onNewDesign?: (width: number, height: number) => void;
  };
  uploadConfig?: UploadConfig;
  designBackend?: DesignBackend;
  autoSave?: {
    enabled?: boolean;
    debounceMs?: number;
    onSave?: (design: any) => Promise<void>;
  };
}
```

### Asset Providers

Provide custom photo and video libraries:

```ts
const providers = {
  photos: {
    search: async (query: string) => {
      const res = await fetch(`/api/photos?search=${query}`);
      return res.json();
    },
    categories: async () => ['Nature', 'City', 'Abstract'],
  },
};
```

### Upload Configuration

```ts
const uploadConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  acceptedTypes: ['image/*', 'video/*', 'audio/*'],
  onUpload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    return res.json(); // { url, width, height, duration? }
  },
};
```

### Design Backend

```ts
const designBackend = {
  loadDesigns: async () => {
    const res = await fetch('/api/designs');
    return res.json();
  },
  saveDesign: async (design) => {
    await fetch('/api/designs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(design),
    });
  },
  deleteDesign: async (id: string) => {
    await fetch(`/api/designs/${id}`, { method: 'DELETE' });
  },
};
```

## Themes

Orbit uses CSS custom properties for theming. Override any token:

```css
:root {
  --orbit-primary: #3b82f6;
  --orbit-bg: #ffffff;
  --orbit-text: #1f2937;
  --orbit-border: #e5e7eb;
  --orbit-sidebar-width: 280px;
}
```

Register a custom theme:

```ts
import { registerTheme } from '@layera-labs/ui';

registerTheme('my-brand', {
  primary: '#ff6b00',
  bg: '#0a0a0a',
  text: '#f5f5f5',
  border: '#333333',
});
```

Then apply it:

```tsx
<OrbitEditor theme="my-brand" />
```

## Keyboard Shortcuts

All shortcuts are customizable via the engine:

```ts
engine.on('keydown', (e) => {
  if (e.key === 'z' && e.ctrlKey) {
    engine.undo();
  }
});
```

Default shortcuts are documented in the Keyboard Shortcuts section above.

## Rate Limits

Your API key's rate limits are enforced server-side. Current tiers:

| Tier | MP4/hour | GIF/hour | Max Duration |
|------|----------|----------|--------------|
| Pro ($200) | 5 | 20 | 60s |
| Business ($500) | 20 | 50 | 120s |
| Enterprise ($2000) | 100 | 200 | 300s |

## Environment Variables

For Next.js or server-side usage, set:

```env
ORBIT_API_KEY=orbit_sk_your_key
ORBIT_BACKEND_URL=https://api.orbit.ai
```
