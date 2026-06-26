/**
 * OrbitEngine - Main canvas engine
 * Coordinates SceneGraph, Renderer, History, and Viewport
 */

import { SceneGraph } from './scene-graph';
import { CommandHistory } from './history';
import { ViewportController } from './viewport';
import { FabricRenderer, type Renderer } from './renderer/FabricRenderer';
import { DrawController, type DrawOptions } from './draw-tool';
import { VectorDrawTool, type VectorDrawOptions } from './vector-tool';
import { PathEditor } from './path-editor';
import { CollaborationManager, type CollaborationConfig } from './collaboration';
import { AudioManager } from './audio-manager';
import { AudioMixer } from './audio-mixer';
import { TransitionEngine } from './transition-engine';
import { AdjustmentRenderer, type AdjustmentValues } from '@orbit/effects';
import { AddLayerCommand, UpdateLayerCommand, MoveLayerCommand, RemoveLayerCommand, DuplicateLayerCommand, GroupLayersCommand, UngroupLayerCommand } from './commands';
import type { Layer, OrbitTheme, WatermarkOptions, ExportOptions, SceneGraph as SceneGraphState } from '@orbit/shared';
import { DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, generateId } from '@orbit/shared';
import * as fabric from 'fabric';

export type ToolType = 'select' | 'brush' | 'highlighter' | 'text' | 'shape' | 'crop' | 'vector';

export interface EngineConfig {
  width?: number;
  height?: number;
  background?: string;
  collaboration?: CollaborationConfig;
}

export class OrbitEngine {
  scene: SceneGraph;
  viewport: ViewportController;
  history: CommandHistory;
  renderer: Renderer;

  private container: HTMLElement | null = null;
  private config: Required<Pick<EngineConfig, 'width' | 'height'>> & Omit<EngineConfig, 'width' | 'height'>;
  private selectedIds: string[] = [];
  private eventListeners: Map<string, Set<Function>> = new Map();
  private resizeObserver: ResizeObserver | null = null;
  private currentTool: ToolType = 'select';
  private drawController: DrawController = new DrawController();
  private vectorTool: VectorDrawTool = new VectorDrawTool();
  private pathEditor: PathEditor = new PathEditor();
  private collaboration: CollaborationManager | null = null;
  private audioManager: AudioManager;
  private transitionEngine: TransitionEngine = new TransitionEngine();
  private transitionUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private clipboard: Omit<Layer, 'id'>[] = [];
  private cleanupCallbacks: Array<() => void> = [];

  constructor(config: EngineConfig = {}) {
    this.config = {
      width: config.width || DEFAULT_CANVAS_WIDTH,
      height: config.height || DEFAULT_CANVAS_HEIGHT,
      background: config.background || '#ffffff',
    };

    this.scene = new SceneGraph(this.config.width, this.config.height);
    this.viewport = new ViewportController();
    this.history = new CommandHistory();
    this.renderer = new FabricRenderer();
    this.audioManager = new AudioManager({
      onTimeUpdate: (time) => this.emit('audioTimeUpdate', time),
    });

    // Subscribe to viewport zoom changes to update renderer CSS scaling
    this.viewport.subscribe((state) => {
      this.renderer.setZoom(state.zoom);
      this.emit('zoomChange', state.zoom);
    });

    // Subscribe to scene changes to re-render and sync audio
    this.scene.subscribe(() => {
      this.render();
      this.syncAudioTracks();
    });
  }

  private syncAudioTracks(): void {
    const layers = this.scene.getState().root;
    const audioIds = layers.filter((l: Layer) => l.type === 'audio').map((l: Layer) => l.id);
    const trackIds = this.audioManager.getTrackIds();

    // Remove tracks for deleted audio layers
    for (const id of trackIds) {
      if (!audioIds.includes(id)) {
        this.audioManager.removeTrack(id);
      }
    }

    // Add tracks for new audio layers
    for (const layer of layers) {
      if (layer.type === 'audio' && !trackIds.includes(layer.id)) {
        const content = layer.content as { src: string; volume?: number; muted?: boolean; loop?: boolean; trim?: { start: number; end: number } };
        this.audioManager.addTrack(layer.id, content.src, {
          volume: content.volume,
          muted: content.muted,
          loop: content.loop,
          trim: content.trim,
        }).catch(() => {
          // Audio load errors are non-fatal
        });
      }
    }
  }

  init(container: HTMLElement): void {
    this.container = container;
    this.renderer.init(container, this.config.width, this.config.height);
    this.zoomToFit();

    // Setup renderer event handlers
    this.renderer.onSelectionChange((ids) => {
      this.selectedIds = ids;
      this.emit('selectionChange', ids);
    });

    this.renderer.onObjectModify((id, props) => {
      const layer = this.scene.getLayer(id);
      if (!layer) return;

      const updates: Record<string, unknown> = { ...props };
      // Convert flat text prop to nested content update for text layers
      if ('text' in updates && layer.type === 'text') {
        updates.content = {
          ...layer.content,
          text: updates.text,
        };
        delete updates.text;
      }

      const cmd = new UpdateLayerCommand(this.scene, id, updates);
      this.history.execute(cmd);
    });

    // Re-render when images load
    this.renderer.onNeedsRender(() => {
      this.render();
    });

    // Observe container resize to recalc offsets and optionally refit
    this.resizeObserver = new ResizeObserver((entries) => {
      if (!this.container) return;
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width < 10 || height < 10) return;
      const canvas = this.renderer.getCanvas();
      if (canvas) canvas.calcOffset();
    });
    this.resizeObserver.observe(container);

    // Setup draw controller
    this.drawController.init(container);
    this.drawController.onComplete((dataUrl) => {
      const img = new Image();
      img.onload = () => {
        const layer: Omit<Layer, 'id'> = {
          type: 'image',
          name: 'Drawing',
          x: 0,
          y: 0,
          width: img.naturalWidth,
          height: img.naturalHeight,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          effects: [],
          content: {
            type: 'image',
            src: dataUrl,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          },
        };
        this.addLayer(layer);
        this.drawController.clear();
      };
      img.src = dataUrl;
    });

    // Setup vector draw tool
    const fabricCanvas = this.renderer.getCanvas();
    if (fabricCanvas) {
      this.vectorTool.setCanvas(fabricCanvas);
      this.vectorTool.onComplete((pathData) => {
        const layer: Omit<Layer, 'id'> = {
          type: 'shape',
          name: 'Vector Path',
          x: 0,
          y: 0,
          width: this.config.width,
          height: this.config.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: this.vectorTool.getOptions().opacity,
          visible: true,
          locked: false,
          blendMode: 'normal',
          effects: [],
          content: {
            type: 'shape',
            shape: 'path',
            fill: '',
            stroke: this.vectorTool.getOptions().color,
            strokeWidth: this.vectorTool.getOptions().strokeWidth,
            pathData,
          },
        };
        this.addLayer(layer);
      });
    }

    // Setup path editor
    if (fabricCanvas) {
      this.pathEditor.setCanvas(fabricCanvas);
      this.pathEditor.onChange((pathData) => {
        const selectedId = this.selectedIds[0];
        if (!selectedId) return;
        const layer = this.scene.getLayer(selectedId);
        if (!layer || layer.type !== 'shape') return;
        const content = layer.content as { pathData?: string };
        this.updateLayer(selectedId, {
          content: { ...content, pathData } as typeof layer.content,
        });
      });
    }

    // Setup collaboration
    if (this.config.collaboration) {
      this.collaboration = new CollaborationManager(this.config.collaboration);
      this.collaboration.onSync(() => {
        // When remote changes come in, we could sync back to scene
        // For now, collaboration syncs the Yjs doc separately
      });
      this.collaboration.onPeersChange((peers) => {
        this.renderer.setPeerCursors?.(peers);
      });
      this.collaboration.connect();

      // Track cursor position for presence
      const canvasEl = fabricCanvas?.getElement();
      if (canvasEl) {
        const handleMouseMove = (e: MouseEvent) => {
          if (!this.collaboration) return;
          const rect = canvasEl.getBoundingClientRect();
          const scale = this.viewport.getState().zoom / 100;
          const x = (e.clientX - rect.left) / scale;
          const y = (e.clientY - rect.top) / scale;
          this.collaboration.updateCursor(x, y);
        };
        canvasEl.addEventListener('mousemove', handleMouseMove);
        this.cleanupCallbacks.push(() => canvasEl.removeEventListener('mousemove', handleMouseMove));
      }
    }

    // Initial render
    this.render();
  }

  destroy(): void {
    this.stopTransitionUpdates();
    this.cleanupCallbacks.forEach((cleanup) => cleanup());
    this.cleanupCallbacks = [];
    this.audioManager.destroy();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.drawController.destroy();
    this.vectorTool.deactivate();
    this.pathEditor.stopEditing();
    this.collaboration?.disconnect();
    this.renderer.destroy();
    this.container = null;
  }

  resizeCanvas(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    
    // Use setDimensions to avoid creating a new SceneGraph instance
    // This preserves all subscriptions and existing state
    this.scene.setDimensions(width, height);
    
    this.history.clear();
    this.selectedIds = [];
    this.renderer.clearSelection?.();
    this.renderer.setCanvasSize(width, height);
    this.render();
    this.zoomToFit();
    this.emit('canvasChange', { width, height });
  }

  loadScene(scene: SceneGraphState): void {
    this.config.width = scene.width;
    this.config.height = scene.height;
    this.selectedIds = [];
    this.history.clear();
    this.renderer.clearSelection?.();
    this.renderer.setCanvasSize(scene.width, scene.height);
    this.scene.setState(scene);
    this.render();
    this.zoomToFit();
    this.emit('selectionChange', []);
    this.emit('canvasChange', { width: scene.width, height: scene.height });
  }

  setSnapToGrid(enabled: boolean, gridSize: number): void {
    this.renderer.configureSnap(gridSize, enabled);
  }

  // Layer Management
  addLayer(layer: Omit<Layer, 'id'>): string {
    const cmd = new AddLayerCommand(this.scene, layer);
    this.history.execute(cmd);
    return cmd['layerId'];
  }

  removeLayer(id: string): void {
    const cmd = new RemoveLayerCommand(this.scene, id);
    this.history.execute(cmd);
  }

  duplicateLayer(id: string): string | null {
    const cmd = new DuplicateLayerCommand(this.scene, id);
    this.history.execute(cmd);
    return cmd.duplicatedId || null;
  }

  copy(): void {
    this.clipboard = this.selectedIds
      .map((id) => this.scene.getLayer(id))
      .filter((layer): layer is Layer => !!layer)
      .map((layer) => ({
        ...layer,
        name: `${layer.name} Copy`,
        x: layer.x + 20,
        y: layer.y + 20,
      }));
  }

  paste(): string[] {
    const newIds: string[] = [];
    for (const layer of this.clipboard) {
      const id = this.addLayer(layer);
      newIds.push(id);
    }
    if (newIds.length > 0) {
      this.selectLayer(newIds);
    }
    return newIds;
  }

  selectLayer(id: string | string[]): void {
    const ids = Array.isArray(id) ? id : [id];
    this.selectedIds = ids;
    this.renderer.setSelection(ids);
    this.emit('selectionChange', ids);
    // Stop path editing when selection changes
    if (this.pathEditor.isActive()) {
      this.pathEditor.stopEditing();
    }
  }

  getSelectedLayers(): string[] {
    return [...this.selectedIds];
  }

  updateLayer(id: string, updates: Partial<Layer>): void {
    const cmd = new UpdateLayerCommand(this.scene, id, updates);
    this.history.execute(cmd);
  }

  moveLayer(id: string, newIndex: number): void {
    const cmd = new MoveLayerCommand(this.scene, id, newIndex);
    this.history.execute(cmd);
  }

  bringToFront(id: string): void {
    const layers = this.scene.getAllLayers();
    const newIndex = layers.length - 1;
    const cmd = new MoveLayerCommand(this.scene, id, newIndex);
    this.history.execute(cmd);
  }

  sendToBack(id: string): void {
    const cmd = new MoveLayerCommand(this.scene, id, 0);
    this.history.execute(cmd);
  }

  bringForward(id: string): void {
    const layers = this.scene.getAllLayers();
    const currentIndex = layers.findIndex((l) => l.id === id);
    if (currentIndex >= 0 && currentIndex < layers.length - 1) {
      const cmd = new MoveLayerCommand(this.scene, id, currentIndex + 1);
      this.history.execute(cmd);
    }
  }

  sendBackward(id: string): void {
    const layers = this.scene.getAllLayers();
    const currentIndex = layers.findIndex((l) => l.id === id);
    if (currentIndex > 0) {
      const cmd = new MoveLayerCommand(this.scene, id, currentIndex - 1);
      this.history.execute(cmd);
    }
  }

  groupLayers(ids: string[]): string | null {
    if (ids.length < 2) return null;
    const cmd = new GroupLayersCommand(this.scene, ids);
    this.history.execute(cmd);
    this.selectedIds = [cmd.groupId];
    this.renderer.setSelection([cmd.groupId]);
    return cmd.groupId;
  }

  ungroupLayer(id: string): string[] {
    const cmd = new UngroupLayerCommand(this.scene, id);
    this.history.execute(cmd);
    this.selectedIds = cmd['restoredIds'];
    this.renderer.setSelection(cmd['restoredIds']);
    return cmd['restoredIds'];
  }

  // Alignment
  alignLayers(ids: string[], alignment: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'): void {
    if (ids.length < 2) return;
    const layers = ids.map((id) => this.scene.getLayer(id)).filter((l): l is Layer => !!l);
    if (layers.length === 0) return;

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...layers.map((l) => l.x));
        layers.forEach((l) => this.updateLayer(l.id, { x: minX }));
        break;
      }
      case 'centerH': {
        const minX = Math.min(...layers.map((l) => l.x));
        const maxX = Math.max(...layers.map((l) => l.x + l.width));
        const center = (minX + maxX) / 2;
        layers.forEach((l) => this.updateLayer(l.id, { x: center - l.width / 2 }));
        break;
      }
      case 'right': {
        const maxX = Math.max(...layers.map((l) => l.x + l.width));
        layers.forEach((l) => this.updateLayer(l.id, { x: maxX - l.width }));
        break;
      }
      case 'top': {
        const minY = Math.min(...layers.map((l) => l.y));
        layers.forEach((l) => this.updateLayer(l.id, { y: minY }));
        break;
      }
      case 'centerV': {
        const minY = Math.min(...layers.map((l) => l.y));
        const maxY = Math.max(...layers.map((l) => l.y + l.height));
        const center = (minY + maxY) / 2;
        layers.forEach((l) => this.updateLayer(l.id, { y: center - l.height / 2 }));
        break;
      }
      case 'bottom': {
        const maxY = Math.max(...layers.map((l) => l.y + l.height));
        layers.forEach((l) => this.updateLayer(l.id, { y: maxY - l.height }));
        break;
      }
    }
  }

  distributeLayers(ids: string[], direction: 'horizontal' | 'vertical'): void {
    if (ids.length < 3) return;
    const layers = ids.map((id) => this.scene.getLayer(id)).filter((l): l is Layer => !!l);
    if (layers.length < 3) return;

    if (direction === 'horizontal') {
      const sorted = [...layers].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x;
      const maxX = sorted[sorted.length - 1].x;
      const step = (maxX - minX) / (sorted.length - 1);
      sorted.forEach((l, i) => this.updateLayer(l.id, { x: minX + step * i }));
    } else {
      const sorted = [...layers].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y;
      const maxY = sorted[sorted.length - 1].y;
      const step = (maxY - minY) / (sorted.length - 1);
      sorted.forEach((l, i) => this.updateLayer(l.id, { y: minY + step * i }));
    }
  }

  flipLayer(id: string, axis: 'horizontal' | 'vertical'): void {
    const layer = this.scene.getLayer(id);
    if (!layer) return;
    if (axis === 'horizontal') {
      this.updateLayer(id, { scaleX: -layer.scaleX });
    } else {
      this.updateLayer(id, { scaleY: -layer.scaleY });
    }
  }

  clearCanvas(): void {
    const layers = this.scene.getAllLayers();
    layers.forEach((layer) => {
      this.scene.removeLayer(layer.id);
    });
    this.history.clear();
    this.selectedIds = [];
    this.renderer.clearSelection?.();
    this.render();
  }

  // Viewport
  setZoom(zoom: number): void {
    this.viewport.setZoom(zoom);
  }

  zoomIn(): void {
    this.viewport.zoomIn();
  }

  zoomOut(): void {
    this.viewport.zoomOut();
  }

  zoomToFit(padding = 96): void {
    if (!this.container) return;
    this.viewport.zoomToFit(
      this.config.width,
      this.config.height,
      this.container.clientWidth,
      this.container.clientHeight,
      padding
    );
  }

  resetZoom(): void {
    this.viewport.resetZoom();
  }

  // Tools
  setTool(tool: ToolType): void {
    this.currentTool = tool;
    this.emit('toolChange', tool);

    // Deactivate all special tools first
    this.drawController.deactivate();
    this.vectorTool.deactivate();

    if (tool === 'brush' || tool === 'highlighter') {
      this.drawController.setOptions({ mode: tool });
      this.drawController.activate();
      this.renderer.getCanvas()?.set({ selection: false });
      this.renderer.getCanvas()?.getObjects().forEach((obj) => obj.set('selectable', false));
    } else if (tool === 'vector') {
      this.vectorTool.activate();
      this.renderer.getCanvas()?.set({ selection: false });
      this.renderer.getCanvas()?.getObjects().forEach((obj) => obj.set('selectable', false));
    } else {
      this.renderer.getCanvas()?.set({ selection: true });
      this.renderer.getCanvas()?.getObjects().forEach((obj) => obj.set('selectable', true));
    }
  }

  configureTool(options: Partial<DrawOptions & VectorDrawOptions>): void {
    if ('mode' in options && (options.mode === 'brush' || options.mode === 'highlighter')) {
      this.drawController.setOptions(options);
    } else {
      this.vectorTool.setOptions(options);
    }
  }

  getTool(): ToolType {
    return this.currentTool;
  }

  // Adjustments
  async applyAdjustments(layerId: string, values: AdjustmentValues): Promise<void> {
    const layer = this.scene.getLayer(layerId);
    if (!layer || layer.type !== 'image') return;

    const content = layer.content as { src: string; naturalWidth: number; naturalHeight: number };
    const img = new Image();
    img.crossOrigin = 'anonymous';

    return new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          const renderer = new AdjustmentRenderer(img.naturalWidth, img.naturalHeight);
          renderer.loadImage(img);
          const dataUrl = renderer.renderToDataURL(values, 'image/png');
          renderer.destroy();

          const newContent = {
            ...content,
            src: dataUrl,
          };

          const effects = [...layer.effects];
          const existingIndex = effects.findIndex((e) => e.type === 'adjustments');
          if (existingIndex >= 0) {
            effects[existingIndex] = {
              ...effects[existingIndex],
              params: { values },
            };
          } else {
            effects.push({
              id: generateId('effect'),
              type: 'adjustments',
              params: { values },
              visible: true,
            });
          }

          this.updateLayer(layerId, {
            content: newContent as typeof layer.content,
            effects,
          });
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image for adjustments'));
      img.src = content.src;
    });
  }

  // Video Playback
  playVideo(id: string): void {
    this.renderer.playVideo(id);
  }

  pauseVideo(id: string): void {
    this.renderer.pauseVideo(id);
  }

  seekVideo(id: string, time: number): void {
    this.renderer.seekVideo(id, time);
  }

  setVideoVolume(id: string, volume: number): void {
    this.renderer.setVideoVolume(id, volume);
  }

  setVideoMuted(id: string, muted: boolean): void {
    this.renderer.setVideoMuted(id, muted);
  }

  getVideoCurrentTime(id: string): number {
    return this.renderer.getVideoCurrentTime(id);
  }

  getVideoDuration(id: string): number {
    return this.renderer.getVideoDuration(id);
  }

  isVideoPlaying(id: string): boolean {
    return this.renderer.isVideoPlaying(id);
  }

  playAllVideos(): void {
    this.renderer.playAllVideos();
    this.audioManager.play();
    this.startTransitionUpdates();
  }

  pauseAllVideos(): void {
    this.renderer.pauseAllVideos();
    this.audioManager.pause();
    this.stopTransitionUpdates();
  }

  // Audio Playback
  async addAudioLayer(layer: Layer): Promise<void> {
    if (layer.type !== 'audio') return;
    const content = layer.content as { src: string; volume?: number; muted?: boolean; loop?: boolean; trim?: { start: number; end: number }; duration?: number };
    await this.audioManager.addTrack(layer.id, content.src, {
      volume: content.volume,
      muted: content.muted,
      loop: content.loop,
      trim: content.trim,
    });
  }

  removeAudioLayer(id: string): void {
    this.audioManager.removeTrack(id);
  }

  playAudio(): void {
    this.audioManager.play();
  }

  pauseAudio(): void {
    this.audioManager.pause();
  }

  seekAudio(time: number): void {
    this.audioManager.seek(time);
  }

  setAudioVolume(id: string, volume: number): void {
    this.audioManager.updateTrack(id, { volume });
  }

  setAudioMuted(id: string, muted: boolean): void {
    this.audioManager.updateTrack(id, { muted });
  }

  setAudioTrim(id: string, trim: { start: number; end: number }): void {
    this.audioManager.updateTrack(id, { trimStart: trim.start, trimEnd: trim.end });
  }

  getAudioCurrentTime(): number {
    return this.audioManager.getCurrentTime();
  }

  getAudioTrackIds(): string[] {
    return this.audioManager.getTrackIds();
  }

  isAudioPlaying(): boolean {
    return this.audioManager.isAudioPlaying();
  }

  // Audio Export
  async exportAudio(options?: {
    duration?: number;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  }): Promise<{ blob: Blob; duration: number }> {
    const layers = this.scene.getState().root;
    const audioLayers = layers.filter((l: Layer) => l.type === 'audio');

    if (audioLayers.length === 0) {
      throw new Error('No audio layers to export');
    }

    const tracks = audioLayers.map((l: Layer) => {
      const content = l.content as {
        src: string;
        volume?: number;
        muted?: boolean;
        loop?: boolean;
        trim?: { start: number; end: number };
      };
      const track = this.audioManager.getTrack(l.id);
      return {
        src: content.src,
        volume: track?.volume ?? content.volume ?? 1,
        muted: track?.muted ?? content.muted ?? false,
        loop: track?.loop ?? content.loop ?? false,
        trimStart: track?.trimStart ?? content.trim?.start ?? 0,
        trimEnd: track?.trimEnd ?? content.trim?.end ?? 0,
        offset: 0, // All tracks start at 0 for now
      };
    });

    const duration = options?.duration ?? this.getMaxVideoDuration();
    const mixer = new AudioMixer();
    return mixer.mix({ tracks, duration, onProgress: options?.onProgress, signal: options?.signal });
  }

  // Transitions
  startTransitionUpdates(): void {
    if (this.transitionUpdateInterval) return;
    this.transitionUpdateInterval = setInterval(() => {
      this.updateTransitions();
    }, 50); // 20fps transition updates
  }

  stopTransitionUpdates(): void {
    if (this.transitionUpdateInterval) {
      clearInterval(this.transitionUpdateInterval);
      this.transitionUpdateInterval = null;
    }
    this.renderer.setTransitionOverrides(new Map());
  }

  updateTransitions(atTime?: number): void {
    const overrides = new Map<string, import('./transition-engine').TransitionState>();
    const layers = this.scene.getState().root;

    for (const layer of layers) {
      let layerTime = 0;
      let layerDuration = 0;

      if (layer.type === 'video') {
        layerTime = atTime ?? this.getVideoCurrentTime(layer.id);
        layerDuration = this.getVideoDuration(layer.id);
      } else if (layer.type === 'audio') {
        layerTime = atTime ?? this.getAudioCurrentTime();
        const content = layer.content as { duration?: number; trim?: { end?: number } };
        layerDuration = content.trim?.end || content.duration || 0;
      } else {
        continue; // No transitions for static layers during playback
      }

      const state = this.transitionEngine.computeLayerState(layer, layerTime, layerDuration);
      if (state) {
        overrides.set(layer.id, state);
      }
    }

    this.renderer.setTransitionOverrides(overrides);
  }

  // Path Editing
  startPathEdit(layerId: string): boolean {
    this.pathEditor.stopEditing();
    const layer = this.scene.getLayer(layerId);
    if (!layer || layer.type !== 'shape') return false;
    const content = layer.content as { shape: string; pathData?: string };
    if (content.shape !== 'path' || !content.pathData) return false;

    const obj = this.renderer.getObjectById?.(layerId);
    if (!obj || !(obj instanceof fabric.Path)) return false;

    this.pathEditor.startEditing(obj);
    return true;
  }

  stopPathEdit(): void {
    this.pathEditor.stopEditing();
  }

  isPathEditing(): boolean {
    return this.pathEditor.isActive();
  }

  // History
  undo(): boolean {
    return this.history.undo();
  }

  redo(): boolean {
    return this.history.redo();
  }

  // Export
  export(options: ExportOptions): Promise<Blob> {
    return new Promise((resolve) => {
      const dataUrl = this.renderer.exportToDataURL(options.format, options.quality, options.scale);

      // SVG data URLs are URL-encoded, not base64
      if (options.format === 'svg') {
        const svgContent = decodeURIComponent(dataUrl.split(',')[1]);
        resolve(new Blob([svgContent], { type: 'image/svg+xml' }));
        return;
      }

      // Convert base64 data URL to blob
      const byteString = atob(dataUrl.split(',')[1]);
      const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      resolve(new Blob([ab], { type: mimeString }));
    });
  }

  exportToDataURL(format: string, quality?: number, scale?: number): string {
    return this.renderer.exportToDataURL(format, quality, scale);
  }

  // Watermark
  setCanvasWatermark(options: WatermarkOptions | null): void {
    this.renderer.setWatermark(options);
  }

  // Theme
  setTheme(theme: OrbitTheme): void {
    // Apply theme CSS variables
    const root = document.documentElement;
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }

  // Events
  on(event: string, callback: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
    return () => this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach((callback) => callback(...args));
  }

  getCanvasElement(): HTMLCanvasElement | null {
    return this.renderer.getCanvas()?.getElement() ?? null;
  }

  getMaxVideoDuration(): number {
    const layers = this.scene.getState().root;
    const videoLayers = layers.filter((l: Layer) => l.type === 'video');
    const audioLayers = layers.filter((l: Layer) => l.type === 'audio');
    const durations: number[] = [];

    videoLayers.forEach((l: Layer) => {
      const content = l.content as { duration?: number };
      durations.push(content.duration || 60);
    });

    audioLayers.forEach((l: Layer) => {
      const content = l.content as { duration?: number; trim?: { end?: number } };
      durations.push(content.trim?.end || content.duration || 60);
    });

    if (durations.length === 0) return 60;
    return Math.max(...durations);
  }

  private render(): void {
    this.renderer.render(this.scene.getState());
  }

}
