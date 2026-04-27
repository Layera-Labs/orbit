# Layers

Layers are the fundamental building blocks of an Orbit design. Everything on the canvas — text, images, shapes, videos, audio — is a layer.

## Layer Types

| Type | Description |
|------|-------------|
| `text` | Rich text with fonts, colors, alignment |
| `image` | Raster images (JPG, PNG, WebP) |
| `shape` | Vector shapes (rect, circle, triangle, arrow, line, path) |
| `video` | HTML5 video rendered on canvas |
| `audio` | Audio track (not visible on canvas, shown in timeline) |
| `group` | Container for multiple layers |

## Layer Properties

All layers share these properties:

```ts
interface Layer {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  effects: LayerEffect[];
  content: TextContent | ImageContent | ShapeContent | VideoContent | AudioContent;
  transitionIn?: Transition;
  transitionOut?: Transition;
  parentId?: string; // For grouped layers
}
```

## Creating Layers

### Text

```ts
engine.addLayer({
  type: 'text',
  name: 'Headline',
  x: 100, y: 100, width: 400, height: 60,
  rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  visible: true, locked: false, blendMode: 'normal', effects: [],
  content: {
    type: 'text',
    text: 'Hello World',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 700,
    color: '#000000',
    alignment: 'left',
  },
});
```

### Image

```ts
engine.addLayer({
  type: 'image',
  name: 'Photo',
  x: 0, y: 0, width: 1080, height: 1080,
  rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  visible: true, locked: false, blendMode: 'normal', effects: [],
  content: {
    type: 'image',
    src: 'https://example.com/photo.jpg',
    naturalWidth: 1920,
    naturalHeight: 1080,
  },
});
```

### Shape

```ts
engine.addLayer({
  type: 'shape',
  name: 'Rectangle',
  x: 200, y: 200, width: 300, height: 150,
  rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  visible: true, locked: false, blendMode: 'normal', effects: [],
  content: {
    type: 'shape',
    shape: 'rect',
    fill: '#3b82f6',
    stroke: '#1d4ed8',
    strokeWidth: 2,
    cornerRadius: 8,
  },
});
```

## Layer Operations

```ts
// Select
engine.selectLayer('layer-id');

// Move in stack
engine.bringToFront('layer-id');
engine.sendToBack('layer-id');
engine.bringForward('layer-id');
engine.sendBackward('layer-id');

// Align multiple
engine.alignLayers(['id1', 'id2'], 'center'); // left | right | center | top | middle | bottom

// Distribute
engine.distributeLayers(['id1', 'id2', 'id3'], 'horizontal');

// Group/Ungroup
engine.groupLayers(['id1', 'id2']);
engine.ungroupLayer('group-id');

// Duplicate
const newId = engine.duplicateLayer('layer-id');

// Flip
engine.flipLayer('layer-id', 'horizontal');
```

## Blend Modes

Orbit supports these blend modes via `globalCompositeOperation`:

- `normal` (default)
- `multiply`
- `screen`
- `overlay`
- `darken`
- `lighten`
- `color-dodge`
- `color-burn`
- `difference`
- `exclusion`

## Effects

Apply visual effects to any layer:

```ts
interface LayerEffect {
  type: 'dropShadow' | 'blur' | 'brightness' | 'contrast' | 'saturation';
  // type-specific params
}
```

## Smart Guides

When dragging layers, Orbit shows smart guides for alignment relative to other layers and the canvas center. Guides appear automatically during drag operations.

## Grid & Snap

Enable grid snapping in the View menu. Grid size defaults to 20px.
