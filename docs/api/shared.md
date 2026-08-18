# Shared Types & Utilities

> **This is v1's API.** Published and maintained, but not the current SDK —
> see [installation](../guide/installation.md) for the v2 packages.

## Types

### `LayerType`

```ts
type LayerType = 'text' | 'image' | 'shape' | 'video' | 'audio' | 'group';
```

### `BlendMode`

```ts
type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'difference' | 'exclusion';
```

### `ToolType`

```ts
type ToolType =
  | 'select' | 'hand' | 'text' | 'draw' | 'vector'
  | 'shape' | 'image' | 'crop' | 'zoom';
```

### `ExportFormat`

```ts
type ExportFormat =
  | 'png' | 'jpg' | 'svg' | 'gif' | 'png-sequence' | 'mp4' | 'pdf' | 'mp3';
```

### `ViewportState`

```ts
interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
}
```

### `Transition`

```ts
interface Transition {
  type: 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out' | 'none';
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}
```

### `VideoExportOptions`

```ts
interface VideoExportOptions {
  format: 'mp4' | 'gif' | 'png-sequence' | 'mp3';
  resolution?: '720p' | '1080p' | '2k' | '4k';
  fps?: number;
  duration?: number;
  width?: number;
  height?: number;
  quality?: 'draft' | 'production';
}
```

### `AudioTrackSource`

```ts
interface AudioTrackSource {
  src: string;
  volume: number;
  muted: boolean;
  loop: boolean;
  trim: { start: number; end: number };
}
```

## Utilities

### `clamp`

```ts
function clamp(value: number, min: number, max: number): number;
```

### `lerp`

```ts
function lerp(a: number, b: number, t: number): number;
```

### `debounce`

```ts
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void;
```

### `throttle`

```ts
function throttle<T extends (...args: any[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void;
```

## Constants

### `DEFAULT_CANVAS_SIZE`

```ts
{ width: 1080, height: 1080 }
```

### `MIN_ZOOM` / `MAX_ZOOM`

```ts
0.1 / 5.0
```

### `DEFAULT_FONT`

```ts
{ family: 'Inter', size: 24, weight: 400 }
```
