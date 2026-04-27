# React Wrapper API

## `OrbitEditor`

The main React component.

```tsx
import { OrbitEditor } from '@orbit/react';
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

```ts
const { generate, isGenerating, results, error } = useOrbitAgentic({
  engine,
  apiKey,
  backendUrl,
});
```

### `useEngineBridge`

Auto-syncs engine state into Zustand store. Call once near the root.

```ts
useEngineBridge(engine);
```
