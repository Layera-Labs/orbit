# Core Engine API

## `OrbitEngine`

The main canvas engine class.

### Constructor

```ts
new OrbitEngine(config?: EngineConfig)
```

### Methods

#### Lifecycle
- `init(container: HTMLElement): void` — Mounts the canvas
- `destroy(): void` — Cleans up all resources (timers, audio, observers)

#### Layer Management
- `addLayer(layer: Omit<Layer, 'id'>): string` — Adds a layer, returns ID
- `removeLayer(id: string): void` — Removes a layer
- `updateLayer(id: string, updates: Partial<Layer>): void` — Updates layer properties
- `duplicateLayer(id: string): string | null` — Duplicates a layer
- `moveLayer(id: string, newIndex: number): void` — Reorders layer
- `selectLayer(id: string | string[]): void` — Selects layer(s)
- `getSelectedLayers(): string[]` — Gets selected IDs
- `bringForward(id: string): void`
- `sendBackward(id: string): void`
- `bringToFront(id: string): void`
- `sendToBack(id: string): void`
- `alignLayers(ids: string[], alignment: string): void`
- `distributeLayers(ids: string[], direction: 'horizontal' | 'vertical'): void`
- `flipLayer(id: string, direction: 'horizontal' | 'vertical'): void`
- `groupLayers(ids: string[]): void`
- `ungroupLayer(id: string): void`

#### History
- `undo(): boolean`
- `redo(): boolean`

#### Tools
- `setTool(tool: ToolType): void`
- `getTool(): ToolType`
- `configureTool(options: Partial<DrawOptions & VectorDrawOptions>): void`

#### Viewport
- `zoomIn(): void`
- `zoomOut(): void`
- `zoomToFit(): void`
- `resetZoom(): void`

#### Export
- `export(options: ExportOptions): Promise<Blob>`
- `exportToDataURL(format: 'png' | 'jpg' | 'svg', quality?: number, scale?: number): string`
- `exportAudio(options?: { duration?: number; onProgress?: (p: number) => void; signal?: AbortSignal }): Promise<{ blob: Blob; duration: number }>`

#### Video/Audio
- `playVideo(id: string): void`
- `pauseVideo(id: string): void`
- `seekVideo(id: string, time: number): void`
- `playAllVideos(): void`
- `pauseAllVideos(): void`
- `getMaxVideoDuration(): number`

#### Transitions
- `updateTransitions(atTime?: number): void`

#### Events
- `on(event: string, callback: Function): () => void`

### Properties
- `scene: SceneGraph`
- `viewport: ViewportController`
- `history: CommandHistory`
- `renderer: Renderer`
