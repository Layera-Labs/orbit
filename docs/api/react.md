# React Wrapper API

## `OrbitEditor`

The main React component.

```tsx
import { OrbitEditor } from '@layera-labs/orbit-react';
```

### Props (`OrbitEditorProps`)

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

## Hooks

### `useOrbitEngine`

```ts
const { containerRef, engine, isReady } = useOrbitEngine({
  width: 1080,
  height: 1080,
});
```

### `useOrbitLayers`

```ts
const { layers, selectedIds, addLayer, removeLayer, selectLayer, updateLayer, moveLayer } =
  useOrbitLayers(engine);
```

### `useOrbitViewport`

```ts
const { zoom, panX, panY, zoomIn, zoomOut, zoomToFit, resetZoom } =
  useOrbitViewport(engine);
```

### `useOrbitHistory`

```ts
const { canUndo, canRedo, undo, redo } = useOrbitHistory(engine);
```

### `useOrbitTool`

```ts
const { activeTool, setTool } = useOrbitTool(engine);
```

### `useOrbitAgentic`

Ships from `@layera-labs/orbit-react/agentic`, not from the package name — it is the one
hook whose types come from `@layera-labs/orbit-agentic`, which is an optional peer. It takes
an `AiBackend` you construct; it builds no client of its own.

```ts
import { useOrbitAgentic } from '@layera-labs/orbit-react/agentic';

const { generate, isGenerating, results, error } = useOrbitAgentic({
  engine,
  backend, // an AiBackend — e.g. @layera-labs/orbit-agentic's OrbitBackendAdapter
});
```

### `useEngineBridge`

Auto-syncs engine state into Zustand store. Call once near the root.

```ts
useEngineBridge(engine);
```
