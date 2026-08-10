/**
 * Fabric.js Renderer - Implementation of the Renderer interface
 */

import * as fabric from 'fabric';
import type { Layer, SceneGraph as SceneGraphType, WatermarkOptions } from '@layera-labs/orbit-shared';
import type { TransitionState } from '../transition-engine';

export interface PeerCursor {
  userId: string;
  userName: string;
  userColor: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface Renderer {
  init(container: HTMLElement, width: number, height: number): void;
  destroy(): void;
  render(scene: SceneGraphType): void;
  resize(width: number, height: number): void;
  setCanvasSize(width: number, height: number): void;
  setZoom(percent: number): void;
  getCanvas(): fabric.Canvas | null;
  exportToDataURL(format: string, quality?: number, scale?: number): string;
  setSelection(ids: string[]): void;
  clearSelection(): void;
  onSelectionChange(callback: (ids: string[]) => void): () => void;
  onObjectModify(callback: (id: string, props: Record<string, unknown>) => void): () => void;
  setWatermark(options: WatermarkOptions | null): void;
  onNeedsRender(callback: () => void): () => void;
  configureSnap(gridSize: number, enabled: boolean): void;
  getObjectById(id: string): fabric.Object | undefined;
  setPeerCursors(peers: PeerCursor[]): void;
  // Video playback
  playVideo(id: string): void;
  pauseVideo(id: string): void;
  seekVideo(id: string, time: number): void;
  setVideoVolume(id: string, volume: number): void;
  setVideoMuted(id: string, muted: boolean): void;
  getVideoCurrentTime(id: string): number;
  getVideoDuration(id: string): number;
  isVideoPlaying(id: string): boolean;
  playAllVideos(): void;
  pauseAllVideos(): void;
  setTransitionOverrides(overrides: Map<string, TransitionState>): void;
}

export class FabricRenderer implements Renderer {
  private canvas: fabric.Canvas | null = null;
  private container: HTMLElement | null = null;
  private selectionCallback: ((ids: string[]) => void) | null = null;
  private modifyCallback: ((id: string, props: Record<string, unknown>) => void) | null = null;
  private needsRenderCallback: (() => void) | null = null;
  private objectMap: Map<string, fabric.Object> = new Map();
  private snapGridSize: number = 20;
  private snapEnabled: boolean = false;
  private smartGuidesEnabled: boolean = true;
  private guideThreshold: number = 5;
  private canvasWidth: number = 1080;
  private canvasHeight: number = 1080;
  private guideLines: fabric.Line[] = [];
  private watermarkOptions: WatermarkOptions | null = null;
  private watermarkObject: fabric.Object | null = null;
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private pendingImages: Set<string> = new Set();
  private videoCache: Map<string, HTMLVideoElement> = new Map();
  private videoObjects: Map<string, fabric.Image> = new Map();
  private animationFrameId: number | null = null;
  private peerCursors: Map<string, { group: fabric.Group; timestamp: number }> = new Map();
  private transitionOverrides: Map<string, TransitionState> = new Map();

  init(container: HTMLElement, width: number, height: number): void {
    this.container = container;
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.applyContainerLayout();

    // Clean up any existing canvas elements (React Strict Mode double-mount)
    const existing = container.querySelectorAll('canvas, .canvas-container');
    existing.forEach((el) => el.remove());

    const canvasEl = document.createElement('canvas');
    canvasEl.id = 'orbit-canvas';
    canvasEl.className = 'block max-w-none';
    container.appendChild(canvasEl);

    // Initialize with artboard dimensions (backstore), NOT container size
    this.canvas = new fabric.Canvas(canvasEl, {
      width,
      height,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      selection: true,
      fireRightClick: true,
      stopContextMenu: true,
    });
    this.applyWrapperLayout();

    // Clean up duplicate canvas after Fabric.js initializes its wrapper
    setTimeout(() => {
      // Only remove if the original is still a direct child of container
      // (meaning Fabric.js cloned it rather than moving it into the wrapper)
      if (canvasEl.parentElement === container) {
        canvasEl.remove();
      }
    }, 0);

    // Configure Fabric.js defaults
    fabric.FabricObject.prototype.set({
      borderColor: '#3b82f6',
      cornerColor: '#3b82f6',
      cornerStrokeColor: '#ffffff',
      cornerSize: 8,
      transparentCorners: false,
      cornerStyle: 'circle' as const,
      padding: 4,
    });

    // Set up clipPath to hide objects outside artboard
    this.updateClipPath();

    this.setupEvents();
  }

  private applyContainerLayout(): void {
    if (!this.container) return;

    this.container.style.display = 'flex';
    this.container.style.overflow = 'auto';
    this.container.style.boxSizing = 'border-box';
    this.container.style.padding = '32px';
  }

  private applyWrapperLayout(): void {
    const wrapper = this.canvas?.wrapperEl;
    if (!wrapper) return;

    wrapper.style.margin = 'auto';
    wrapper.style.flex = '0 0 auto';
  }

  private updateClipPath(): void {
    if (!this.canvas) return;
    const clipRect = new fabric.Rect({
      left: 0,
      top: 0,
      width: this.canvasWidth,
      height: this.canvasHeight,
      absolutePositioned: true,
    });
    this.canvas.clipPath = clipRect;
  }

  destroy(): void {
    this.stopPlaybackLoop();
    for (const videoEl of this.videoCache.values()) {
      videoEl.pause();
      videoEl.src = '';
    }
    this.videoCache.clear();
    this.videoObjects.clear();
    this.peerCursors.clear();
    this.canvas?.dispose();
    this.canvas = null;
    this.objectMap.clear();
    this.imageCache.clear();
    this.pendingImages.clear();
    // Remove Fabric.js wrapper from DOM to prevent duplicates on re-init
    if (this.container) {
      const wrapper = this.container.querySelector('.canvas-container');
      if (wrapper) wrapper.remove();
    }
  }

  render(scene: SceneGraphType): void {
    if (!this.canvas) return;

    // Save current selection before clearing
    const selectedIds = this.getCurrentSelection();

    // Stop any playing videos before clearing
    this.stopPlaybackLoop();
    this.videoObjects.clear();

    // Clear canvas but keep track of existing objects
    this.canvas.clear();
    this.objectMap.clear();

    // Render background
    this.renderBackground(scene.background);

    // Render layers
    scene.root.forEach((layer) => {
      if (!layer.visible) return;
      const obj = this.createFabricObject(layer);
      if (obj) {
        obj.set('selectable', !layer.locked);
        obj.set('evented', !layer.locked);
        this.canvas!.add(obj);
        this.objectMap.set(layer.id, obj);
      }
    });

    // Render border on top of everything
    this.renderBorder(scene.border);

    this.canvas.requestRenderAll();

    // Re-add watermark on top of layers
    this.applyWatermark();

    // Restore selection after re-render
    if (selectedIds.length > 0) {
      this.setSelection(selectedIds);
    }
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.container) return;
    // Scale the visual CSS size only; backstore stays at artboard dimensions
    this.canvas.setDimensions({ width, height }, { cssOnly: true });
    this.applyWrapperLayout();
    this.canvas.calcOffset();
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    if (!this.canvas) return;
    // Update backstore dimensions
    this.canvas.setDimensions({ width, height });
    this.applyWrapperLayout();
    // Update clipPath to match new artboard size
    this.updateClipPath();
  }

  setZoom(percent: number): void {
    if (!this.canvas) return;
    const s = percent / 100;
    this.canvas.setDimensions(
      { width: this.canvasWidth * s, height: this.canvasHeight * s },
      { cssOnly: true }
    );
    this.applyWrapperLayout();
    this.canvas.calcOffset();
    this.canvas.requestRenderAll();
  }

  getCanvas(): fabric.Canvas | null {
    return this.canvas;
  }

  exportToDataURL(format: string, quality?: number, scale?: number): string {
    if (!this.canvas) return '';

    // SVG export
    if (format === 'svg') {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        this.canvas.toSVG({
          viewBox: { x: 0, y: 0, width: this.canvasWidth, height: this.canvasHeight },
          width: String(this.canvasWidth),
          height: String(this.canvasHeight),
        })
      );
    }

    const fabricFormat = format === 'jpg' ? 'jpeg' : (format as 'png' | 'jpeg');

    // For JPG, fill transparent areas with white
    const originalBg = this.canvas.backgroundColor;
    if (fabricFormat === 'jpeg') {
      this.canvas.set('backgroundColor', '#ffffff');
    }

    // Ensure watermark is on top before export
    if (this.watermarkObject) {
      this.canvas.bringObjectToFront(this.watermarkObject);
    }

    const dataUrl = this.canvas.toDataURL({
      format: fabricFormat,
      quality: quality || 1,
      multiplier: scale || 1,
    });

    // Restore original background
    if (fabricFormat === 'jpeg') {
      this.canvas.set('backgroundColor', originalBg);
    }

    return dataUrl;
  }

  setSelection(ids: string[]): void {
    if (!this.canvas) return;
    const objects = ids
      .map((id) => this.objectMap.get(id))
      .filter((obj): obj is fabric.Object => obj !== undefined);

    if (objects.length === 1) {
      this.canvas.setActiveObject(objects[0]);
    } else if (objects.length > 1) {
      const selection = new fabric.ActiveSelection(objects, { canvas: this.canvas });
      this.canvas.setActiveObject(selection);
    }
    this.canvas.requestRenderAll();
  }

  clearSelection(): void {
    if (!this.canvas) return;
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  onSelectionChange(callback: (ids: string[]) => void): () => void {
    this.selectionCallback = callback;
    return () => {
      this.selectionCallback = null;
    };
  }

  onObjectModify(callback: (id: string, props: Record<string, unknown>) => void): () => void {
    this.modifyCallback = callback;
    return () => {
      this.modifyCallback = null;
    };
  }

  onNeedsRender(callback: () => void): () => void {
    this.needsRenderCallback = callback;
    return () => {
      this.needsRenderCallback = null;
    };
  }

  configureSnap(gridSize: number, enabled: boolean): void {
    this.snapGridSize = gridSize;
    this.snapEnabled = enabled;
  }

  setWatermark(options: WatermarkOptions | null): void {
    this.watermarkOptions = options;
    // Remove existing watermark
    if (this.watermarkObject && this.canvas) {
      this.canvas.remove(this.watermarkObject);
      this.watermarkObject = null;
    }
    this.applyWatermark();
  }

  private applyWatermark(): void {
    if (!this.canvas || !this.watermarkOptions) return;

    // Use design canvas dimensions, not viewport
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const options = this.watermarkOptions;
    const padding = options.padding ?? 20;

    if (options.type === 'text') {
      this.watermarkObject = new fabric.Text(options.content, {
        left: 0,
        top: 0,
        fontSize: (options.fontSize ?? 24),
        fill: options.color ?? '#ffffff',
        opacity: options.opacity,
        selectable: false,
        evented: false,
        originX: 'left',
        originY: 'top',
      });
    } else {
      // Image watermark - placeholder rect for now
      // In production, load actual image from URL
      this.watermarkObject = new fabric.Rect({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        fill: '#ffffff',
        opacity: options.opacity,
        selectable: false,
        evented: false,
      });
    }

    // Position watermark relative to design canvas
    const obj = this.watermarkObject;
    const objWidth = obj.width ?? 0;
    const objHeight = obj.height ?? 0;

    switch (options.position) {
      case 'top-left':
        obj.set({ left: padding, top: padding });
        break;
      case 'top-right':
        obj.set({ left: width - objWidth - padding, top: padding });
        break;
      case 'bottom-left':
        obj.set({ left: padding, top: height - objHeight - padding });
        break;
      case 'bottom-right':
        obj.set({ left: width - objWidth - padding, top: height - objHeight - padding });
        break;
      case 'center':
        obj.set({ left: width / 2, top: height / 2, originX: 'center', originY: 'center' });
        break;
    }

    this.canvas.add(obj);
    this.canvas.bringObjectToFront(obj);
    this.canvas.requestRenderAll();
  }

  private setupEvents(): void {
    if (!this.canvas) return;

    // Selection changed
    this.canvas.on('selection:created', (e) => {
      this.handleSelection(e.selected);
    });

    this.canvas.on('selection:updated', (e) => {
      this.handleSelection(e.selected);
    });

    this.canvas.on('selection:cleared', () => {
      this.selectionCallback?.([]);
    });

    const emitObjectUpdate = (obj: fabric.Object) => {
      const id = this.findLayerId(obj);
      if (!id || !this.modifyCallback) return;

      const updates: Record<string, unknown> = {
        x: obj.left,
        y: obj.top,
        width: obj.width ? obj.width * (obj.scaleX || 1) : undefined,
        height: obj.height ? obj.height * (obj.scaleY || 1) : undefined,
        rotation: obj.angle,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        skewX: obj.skewX,
        skewY: obj.skewY,
      };

      if (obj instanceof fabric.Text && 'text' in obj) {
        updates.text = obj.text;
      }

      this.modifyCallback(id, updates);
    };

    // Long-press drag state
    let dragTimer: ReturnType<typeof setTimeout> | null = null;
    let isDragging = false;
    let dragObj: fabric.Object | null = null;
    let dragStartPos = { left: 0, top: 0 };
    const DRAG_DELAY = 400;

    // Mouse down: start timer, save position
    this.canvas.on('mouse:down', (e) => {
      const obj = e.target;
      if (!obj || (obj instanceof fabric.IText && obj.isEditing)) return;

      dragObj = obj;
      isDragging = false;
      dragStartPos = { left: obj.left || 0, top: obj.top || 0 };

      dragTimer = setTimeout(() => {
        isDragging = true;
      }, DRAG_DELAY);
    });

    // Object moving: if not long press yet, snap back to start
    this.canvas.on('object:moving', (e) => {
      const obj = e.target;
      if (!obj) return;

      if (!isDragging && obj === dragObj) {
        // Snap back to original position
        obj.set({ left: dragStartPos.left, top: dragStartPos.top });
        obj.setCoords();
        return;
      }

      // Snap to grid
      if (this.snapEnabled) {
        const grid = this.snapGridSize;
        obj.set({
          left: Math.round((obj.left || 0) / grid) * grid,
          top: Math.round((obj.top || 0) / grid) * grid,
        });
      }

      // Smart guides
      if (this.smartGuidesEnabled) {
        this.applySmartGuides(obj);
      }
    });

    // Mouse up: cancel timer, reset if short click
    this.canvas.on('mouse:up', (e) => {
      if (dragTimer) {
        clearTimeout(dragTimer);
        dragTimer = null;
      }

      const obj = e.target;
      if (obj && !isDragging && obj === dragObj) {
        // Short click: reset to original position
        obj.set({ left: dragStartPos.left, top: dragStartPos.top });
        obj.setCoords();
      }

      if (obj && isDragging) {
        // Long press drag ended: emit update
        emitObjectUpdate(obj);
      }

      dragObj = null;
      isDragging = false;
      this.clearGuideLines();
    });

    // Object moving (with optional snap to grid + smart guides)
    this.canvas.on('object:moving', (e) => {
      const obj = e.target;
      if (!obj) return;

      // Snap to grid
      if (this.snapEnabled) {
        const grid = this.snapGridSize;
        obj.set({
          left: Math.round((obj.left || 0) / grid) * grid,
          top: Math.round((obj.top || 0) / grid) * grid,
        });
      }

      // Smart guides
      if (this.smartGuidesEnabled) {
        this.applySmartGuides(obj);
      }
    });

    // Object modified (move, scale, rotate, text edit)
    this.canvas.on('object:modified', (e) => {
      const obj = e.target;
      if (obj) emitObjectUpdate(obj);
    });

    this.canvas.on('text:changed', (e) => {
      const obj = e.target;
      if (obj) emitObjectUpdate(obj);
    });

    // Double-click to enter text editing
    this.canvas.on('mouse:dblclick', (e) => {
      const obj = e.target;
      if (obj instanceof fabric.IText) {
        obj.enterEditing();
      }
    });
  }

  private handleSelection(objects: fabric.Object[] | undefined): void {
    if (!objects || !this.selectionCallback) return;
    const ids = objects
      .map((obj) => this.findLayerId(obj))
      .filter((id): id is string => id !== undefined);
    this.selectionCallback(ids);
  }

  private findLayerId(obj: fabric.Object): string | undefined {
    for (const [id, fabricObj] of this.objectMap) {
      if (fabricObj === obj) return id;
    }
    return undefined;
  }

  private getCurrentSelection(): string[] {
    if (!this.canvas) return [];
    const activeObject = this.canvas.getActiveObject();
    const ids: string[] = [];
    if (!activeObject) return ids;

    if (activeObject instanceof fabric.ActiveSelection) {
      for (const obj of activeObject.getObjects()) {
        for (const [id, fabricObj] of this.objectMap) {
          if (fabricObj === obj) {
            ids.push(id);
            break;
          }
        }
      }
    } else {
      for (const [id, fabricObj] of this.objectMap) {
        if (fabricObj === activeObject) {
          ids.push(id);
          break;
        }
      }
    }
    return ids;
  }

  private applySmartGuides(activeObj: fabric.Object): void {
    if (!this.canvas) return;
    this.clearGuideLines();

    const threshold = this.guideThreshold;
    const activeBounds = this.getObjectBounds(activeObj);

    for (const [, otherObj] of this.objectMap) {
      if (otherObj === activeObj) continue;
      const otherBounds = this.getObjectBounds(otherObj);

      // Check horizontal alignments (left, centerX, right)
      const hAlignments = [
        { val: activeBounds.left, target: otherBounds.left },
        { val: activeBounds.centerX, target: otherBounds.centerX },
        { val: activeBounds.right, target: otherBounds.right },
        { val: activeBounds.left, target: otherBounds.right },
        { val: activeBounds.right, target: otherBounds.left },
      ];

      for (const align of hAlignments) {
        if (Math.abs(align.val - align.target) < threshold) {
          activeObj.set('left', (activeObj.left || 0) + (align.target - align.val));
          this.drawGuideLine(align.target, 0, align.target, this.canvasHeight);
          break;
        }
      }

      // Check vertical alignments (top, centerY, bottom)
      const vAlignments = [
        { val: activeBounds.top, target: otherBounds.top },
        { val: activeBounds.centerY, target: otherBounds.centerY },
        { val: activeBounds.bottom, target: otherBounds.bottom },
        { val: activeBounds.top, target: otherBounds.bottom },
        { val: activeBounds.bottom, target: otherBounds.top },
      ];

      for (const align of vAlignments) {
        if (Math.abs(align.val - align.target) < threshold) {
          activeObj.set('top', (activeObj.top || 0) + (align.target - align.val));
          this.drawGuideLine(0, align.target, this.canvasWidth, align.target);
          break;
        }
      }
    }

    this.canvas.requestRenderAll();
  }

  private getObjectBounds(obj: fabric.Object): { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number } {
    const left = obj.left || 0;
    const top = obj.top || 0;
    const width = (obj.width || 0) * (obj.scaleX || 1);
    const height = (obj.height || 0) * (obj.scaleY || 1);
    return {
      left,
      right: left + width,
      top,
      bottom: top + height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    };
  }

  private drawGuideLine(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.canvas) return;
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: '#3b82f6',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      opacity: 0.8,
    });
    this.canvas.add(line);
    this.guideLines.push(line);
  }

  private clearGuideLines(): void {
    if (!this.canvas) return;
    for (const line of this.guideLines) {
      this.canvas.remove(line);
    }
    this.guideLines = [];
    this.canvas.requestRenderAll();
  }

  getObjectById(id: string): fabric.Object | undefined {
    return this.objectMap.get(id);
  }

  private createFabricObject(layer: Layer): fabric.Object | null {
    let obj: fabric.Object | null = null;
    switch (layer.type) {
      case 'image':
        obj = this.createImageObject(layer);
        break;
      case 'text':
        obj = this.createTextObject(layer);
        break;
      case 'shape':
        obj = this.createShapeObject(layer);
        break;
      case 'group':
        obj = this.createGroupObject(layer);
        break;
      case 'video':
        obj = this.createVideoObject(layer);
        break;
      default:
        return null;
    }
    if (obj) {
      const overrides = this.transitionOverrides.get(layer.id);
      if (overrides) this.applyTransitionToObject(obj, overrides);
    }
    return obj;
  }

  private createGroupObject(layer: Layer): fabric.Group | null {
    const content = layer.content as { children: Layer[] };
    const childObjects = content.children
      .map((child) => this.createFabricObject(child))
      .filter((obj): obj is fabric.Object => obj !== null);

    if (childObjects.length === 0) return null;

    const group = new fabric.Group(childObjects, {
      left: layer.x,
      top: layer.y,
      width: layer.width,
      height: layer.height,
      opacity: layer.opacity,
      angle: layer.rotation,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      skewX: (layer as any).skewX || 0,
      skewY: (layer as any).skewY || 0,
    });

    return group;
  }

  private createImageObject(layer: Layer): fabric.Object | null {
    const content = layer.content as { src: string; naturalWidth: number; naturalHeight: number };
    const src = content.src;

    // Check cache
    const cached = this.imageCache.get(src);
    if (cached) {
      return new fabric.Image(cached, {
        left: layer.x,
        top: layer.y,
        width: layer.width,
        height: layer.height,
        opacity: layer.opacity,
        angle: layer.rotation,
        scaleX: layer.scaleX,
        scaleY: layer.scaleY,
        skewX: (layer as any).skewX || 0,
        skewY: (layer as any).skewY || 0,
      });
    }

    // Start loading if not already pending
    if (!this.pendingImages.has(src)) {
      this.pendingImages.add(src);
      this.loadImage(src);
    }

    // Return placeholder while loading
    return new fabric.Rect({
      left: layer.x,
      top: layer.y,
      width: layer.width,
      height: layer.height,
      fill: '#1a1a2e',
      opacity: layer.opacity,
      angle: layer.rotation,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      skewX: (layer as any).skewX || 0,
      skewY: (layer as any).skewY || 0,
    });
  }

  private loadImage(src: string): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.imageCache.set(src, img);
      this.pendingImages.delete(src);
      this.needsRenderCallback?.();
    };
    img.onerror = () => {
      this.pendingImages.delete(src);
      // Mark as failed so we don't retry indefinitely
      this.imageCache.set(src, img); // store broken image to prevent retry
    };
    img.src = src;
  }

  private createTextObject(layer: Layer): fabric.Text | null {
    const content = layer.content as {
      text: string;
      fontSize: number;
      color: string;
      fontFamily?: string;
      fontWeight?: number;
      fontStyle?: 'normal' | 'italic';
      alignment?: 'left' | 'center' | 'right' | 'justify';
      lineHeight?: number;
      letterSpacing?: number;
      decoration?: 'none' | 'underline' | 'line-through';
      gradient?: { start: string; end: string; angle: number };
      blur?: number;
      textStrokeColor?: string;
      textStrokeWidth?: number;
      shadow?: { color: string; blur: number; opacity: number; offsetX: number; offsetY: number };
    };
    const text = new fabric.Text(content.text, {
      left: layer.x,
      top: layer.y,
      fontSize: content.fontSize,
      fill: content.color,
      fontFamily: content.fontFamily || 'Inter',
      fontWeight: content.fontWeight || 400,
      fontStyle: content.fontStyle || 'normal',
      textAlign: content.alignment || 'left',
      lineHeight: content.lineHeight ?? 1.16,
      charSpacing: content.letterSpacing ?? 0,
      underline: content.decoration === 'underline',
      linethrough: content.decoration === 'line-through',
      stroke: content.textStrokeColor || undefined,
      strokeWidth: content.textStrokeWidth || 0,
      shadow: this.createTextShadow(content),
      opacity: layer.opacity,
      angle: layer.rotation,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      skewX: (layer as any).skewX || 0,
      skewY: (layer as any).skewY || 0,
    });
    if (content.gradient) {
      text.set('fill', this.createTextGradient(content.gradient, text.width || layer.width, text.height || layer.height));
    }
    return text;
  }

  private createTextGradient(
    gradient: { start: string; end: string; angle: number },
    width: number,
    height: number
  ): fabric.Gradient<'linear'> {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const radians = ((gradient.angle || 0) * Math.PI) / 180;
    const x = Math.cos(radians) * safeWidth * 0.5;
    const y = Math.sin(radians) * safeHeight * 0.5;

    return new fabric.Gradient({
      type: 'linear',
      coords: {
        x1: safeWidth / 2 - x,
        y1: safeHeight / 2 - y,
        x2: safeWidth / 2 + x,
        y2: safeHeight / 2 + y,
      },
      colorStops: [
        { offset: 0, color: gradient.start },
        { offset: 1, color: gradient.end },
      ],
    });
  }

  private createTextShadow(content: {
    color: string;
    blur?: number;
    shadow?: { color: string; blur: number; opacity: number; offsetX: number; offsetY: number };
  }): fabric.Shadow | undefined {
    if (content.shadow) {
      return new fabric.Shadow({
        color: this.hexToRgba(content.shadow.color, content.shadow.opacity / 100),
        blur: content.shadow.blur,
        offsetX: content.shadow.offsetX,
        offsetY: content.shadow.offsetY,
      });
    }
    if (content.blur && content.blur > 0) {
      return new fabric.Shadow({
        color: this.hexToRgba(content.color, 0.65),
        blur: content.blur,
        offsetX: 0,
        offsetY: 0,
      });
    }
    return undefined;
  }

  private hexToRgba(color: string, alpha: number): string {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
    if (!match) return color;
    const r = parseInt(match[1], 16);
    const g = parseInt(match[2], 16);
    const b = parseInt(match[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  private createShapeObject(layer: Layer): fabric.Object | null {
    const content = layer.content as { shape: string; fill: string; stroke: string; strokeWidth: number };
    const fill = this.createPaint(content.fill, layer.width, layer.height);
    const common = {
      left: layer.x,
      top: layer.y,
      fill,
      stroke: content.stroke,
      strokeWidth: content.strokeWidth,
      opacity: layer.opacity,
      angle: layer.rotation,
      skewX: (layer as any).skewX || 0,
      skewY: (layer as any).skewY || 0,
    };

    switch (content.shape) {
      case 'rectangle':
        return new fabric.Rect({
          ...common,
          width: layer.width,
          height: layer.height,
        });
      case 'circle':
        return new fabric.Circle({
          ...common,
          radius: Math.min(layer.width, layer.height) / 2,
        });
      case 'triangle':
        return new fabric.Triangle({
          ...common,
          width: layer.width,
          height: layer.height,
        });
      case 'star': {
        const points = this.createStarPoints(layer.width, layer.height);
        return new fabric.Polygon(points, {
          ...common,
          originX: 'center',
          originY: 'center',
          left: layer.x + layer.width / 2,
          top: layer.y + layer.height / 2,
        });
      }
      case 'polygon': {
        const sides = (layer.content as { sides?: number }).sides || 6;
        const points = this.createPolygonPoints(layer.width, layer.height, sides);
        return new fabric.Polygon(points, {
          ...common,
          originX: 'center',
          originY: 'center',
          left: layer.x + layer.width / 2,
          top: layer.y + layer.height / 2,
        });
      }
      case 'line':
        return new fabric.Line([0, 0, layer.width, 0], {
          left: layer.x,
          top: layer.y,
          stroke: content.stroke || content.fill,
          strokeWidth: content.strokeWidth || 2,
          opacity: layer.opacity,
          angle: layer.rotation,
        });
      case 'arrow': {
        const w = layer.width;
        const pathStr = `M 0 0 L ${w} 0 M ${w - 10} -5 L ${w} 0 L ${w - 10} 5`;
        return new fabric.Path(pathStr, {
          left: layer.x,
          top: layer.y,
          fill: '',
          stroke: content.stroke || content.fill,
          strokeWidth: content.strokeWidth || 2,
          opacity: layer.opacity,
          angle: layer.rotation,
        });
      }
      case 'path': {
        const pathData = (layer.content as { pathData?: string }).pathData || '';
        if (!pathData) return null;
        return new fabric.Path(pathData, {
          left: layer.x,
          top: layer.y,
          fill: fill || '',
          stroke: content.stroke,
          strokeWidth: content.strokeWidth,
          opacity: layer.opacity,
          angle: layer.rotation,
          scaleX: layer.scaleX,
          scaleY: layer.scaleY,
          skewX: (layer as any).skewX || 0,
          skewY: (layer as any).skewY || 0,
        });
      }
      default:
        return new fabric.Rect({
          ...common,
          width: layer.width,
          height: layer.height,
        });
    }
  }

  private createPaint(value: string, width: number, height: number): string | fabric.Gradient<'linear'> {
    if (!value?.startsWith('linear-gradient')) return value;
    const angle = Number(value.match(/linear-gradient\(([-\d.]+)deg/i)?.[1] ?? 135);
    const rad = (angle * Math.PI) / 180;
    const stops = this.parseGradientStops(value);
    return new fabric.Gradient({
      type: 'linear',
      coords: {
        x1: 0,
        y1: 0,
        x2: width * Math.cos(rad),
        y2: height * Math.sin(rad),
      },
      colorStops: stops.map((stop) => ({ offset: stop.offset, color: stop.color })),
    });
  }

  private createStarPoints(width: number, height: number): { x: number; y: number }[] {
    const outerR = Math.min(width, height) / 2;
    const innerR = outerR * 0.4;
    const numPoints = 5;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < numPoints * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI * i) / numPoints - Math.PI / 2;
      points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    }
    return points;
  }

  private createPolygonPoints(width: number, height: number, sides: number): { x: number; y: number }[] {
    const r = Math.min(width, height) / 2;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    }
    return points;
  }

  private createVideoObject(layer: Layer): fabric.Object | null {
    const content = layer.content as { src: string; duration: number; currentTime?: number; volume?: number; muted?: boolean; loop?: boolean; autoplay?: boolean };
    const src = content.src;

    // Check cache
    let videoEl = this.videoCache.get(src);
    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.crossOrigin = 'anonymous';
      videoEl.src = src;
      videoEl.loop = content.loop ?? false;
      videoEl.muted = content.muted ?? false;
      videoEl.volume = content.volume ?? 1;
      videoEl.preload = 'metadata';
      this.videoCache.set(src, videoEl);
    }

    const img = new fabric.Image(videoEl, {
      left: layer.x,
      top: layer.y,
      width: layer.width,
      height: layer.height,
      opacity: layer.opacity,
      angle: layer.rotation,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      skewX: (layer as any).skewX || 0,
      skewY: (layer as any).skewY || 0,
    });

    this.videoObjects.set(layer.id, img);

    // Autoplay if requested
    if (content.autoplay) {
      videoEl.play().catch(() => {});
      this.startPlaybackLoop();
    }

    // Seek to currentTime if set
    if (content.currentTime && content.currentTime > 0) {
      videoEl.currentTime = content.currentTime;
    }

    return img;
  }

  // ===== Video Playback =====

  playVideo(id: string): void {
    const obj = this.videoObjects.get(id);
    if (!obj) return;
    const videoEl = obj.getElement() as HTMLVideoElement;
    if (!videoEl) return;
    videoEl.play().catch(() => {});
    this.startPlaybackLoop();
  }

  pauseVideo(id: string): void {
    const obj = this.videoObjects.get(id);
    if (!obj) return;
    const videoEl = obj.getElement() as HTMLVideoElement;
    if (!videoEl) return;
    videoEl.pause();
    this.stopPlaybackLoopIfAllPaused();
  }

  seekVideo(id: string, time: number): void {
    const obj = this.videoObjects.get(id);
    if (!obj) return;
    const videoEl = obj.getElement() as HTMLVideoElement;
    if (!videoEl) return;
    videoEl.currentTime = Math.max(0, Math.min(time, videoEl.duration || 0));
    this.canvas?.requestRenderAll();
  }

  setVideoVolume(id: string, volume: number): void {
    const obj = this.videoObjects.get(id);
    if (!obj) return;
    const videoEl = obj.getElement() as HTMLVideoElement;
    if (!videoEl) return;
    videoEl.volume = Math.max(0, Math.min(1, volume));
  }

  setVideoMuted(id: string, muted: boolean): void {
    const obj = this.videoObjects.get(id);
    if (!obj) return;
    const videoEl = obj.getElement() as HTMLVideoElement;
    if (!videoEl) return;
    videoEl.muted = muted;
  }

  getVideoCurrentTime(id: string): number {
    const obj = this.videoObjects.get(id);
    if (!obj) return 0;
    const videoEl = obj.getElement() as HTMLVideoElement;
    return videoEl?.currentTime || 0;
  }

  getVideoDuration(id: string): number {
    const obj = this.videoObjects.get(id);
    if (!obj) return 0;
    const videoEl = obj.getElement() as HTMLVideoElement;
    return videoEl?.duration || 0;
  }

  isVideoPlaying(id: string): boolean {
    const obj = this.videoObjects.get(id);
    if (!obj) return false;
    const videoEl = obj.getElement() as HTMLVideoElement;
    return videoEl ? !videoEl.paused : false;
  }

  playAllVideos(): void {
    for (const obj of this.videoObjects.values()) {
      const videoEl = obj.getElement() as HTMLVideoElement;
      if (videoEl) videoEl.play().catch(() => {});
    }
    this.startPlaybackLoop();
  }

  pauseAllVideos(): void {
    for (const obj of this.videoObjects.values()) {
      const videoEl = obj.getElement() as HTMLVideoElement;
      if (videoEl) videoEl.pause();
    }
    this.stopPlaybackLoop();
  }

  // ===== Peer Cursors =====

  setPeerCursors(peers: PeerCursor[]): void {
    if (!this.canvas) return;

    const now = Date.now();
    const activeIds = new Set<string>();

    for (const peer of peers) {
      activeIds.add(peer.userId);
      const existing = this.peerCursors.get(peer.userId);

      if (existing) {
        // Update position
        existing.group.set({ left: peer.x, top: peer.y });
        existing.timestamp = now;
        existing.group.setCoords();
      } else {
        // Create new cursor
        const cursorDot = new fabric.Circle({
          left: 0,
          top: 0,
          radius: 4,
          fill: peer.userColor,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });

        const label = new fabric.Text(peer.userName, {
          left: 8,
          top: -14,
          fontSize: 11,
          fill: '#ffffff',
          backgroundColor: peer.userColor,
          padding: 2,
          selectable: false,
          evented: false,
        });

        const group = new fabric.Group([cursorDot, label], {
          left: peer.x,
          top: peer.y,
          selectable: false,
          evented: false,
        });

        this.canvas.add(group);
        this.peerCursors.set(peer.userId, { group, timestamp: now });
      }
    }

    // Remove stale cursors
    for (const [userId, data] of this.peerCursors) {
      if (!activeIds.has(userId) || now - data.timestamp > 30000) {
        this.canvas.remove(data.group);
        this.peerCursors.delete(userId);
      }
    }

    this.canvas.requestRenderAll();
  }

  setTransitionOverrides(overrides: Map<string, TransitionState>): void {
    this.transitionOverrides = overrides;
    // Apply to existing objects immediately
    for (const [id, state] of overrides) {
      const obj = this.objectMap.get(id);
      if (obj) this.applyTransitionToObject(obj, state);
    }
  }

  private applyTransitionToObject(obj: fabric.Object, state: TransitionState): void {
    if (state.opacity !== undefined) obj.set('opacity', state.opacity);
    if (state.scaleX !== undefined) obj.set('scaleX', state.scaleX);
    if (state.scaleY !== undefined) obj.set('scaleY', state.scaleY);
    if (state.x !== undefined) obj.set('left', state.x);
    if (state.y !== undefined) obj.set('top', state.y);
    obj.setCoords();
  }

  private startPlaybackLoop(): void {
    if (this.animationFrameId !== null) return;
    const loop = () => {
      // Re-apply transition overrides on each frame
      for (const [id, state] of this.transitionOverrides) {
        const obj = this.objectMap.get(id);
        if (obj) this.applyTransitionToObject(obj, state);
      }
      this.canvas?.requestRenderAll();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopPlaybackLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private stopPlaybackLoopIfAllPaused(): void {
    let anyPlaying = false;
    for (const obj of this.videoObjects.values()) {
      const videoEl = obj.getElement() as HTMLVideoElement;
      if (videoEl && !videoEl.paused) {
        anyPlaying = true;
        break;
      }
    }
    if (!anyPlaying) {
      this.stopPlaybackLoop();
    }
  }

  private renderBorder(border: SceneGraphType['border']): void {
    if (!this.canvas || border.width <= 0) return;

    const w = border.width;
    const inset = w / 2;
    const W = this.canvasWidth;
    const H = this.canvasHeight;

    // Get per-corner radius values
    const rTL = border.radiusCorners.topLeft || border.radius;
    const rTR = border.radiusCorners.topRight || border.radius;
    const rBR = border.radiusCorners.bottomRight || border.radius;
    const rBL = border.radiusCorners.bottomLeft || border.radius;

    // Helper to create arc path command
    const arc = (r: number, x: number, y: number) => `A ${r} ${r} 0 0 1 ${x} ${y}`;

    const pathSegments: string[] = [];

    // Build path clockwise from top-left
    // Start at top-left corner (end of left side arc)
    let startX = inset;
    let startY = inset + rTL;
    pathSegments.push(`M ${startX} ${startY}`);

    // Top-left corner arc (connecting left to top)
    if (rTL > 0 && (border.sides.top || border.sides.left)) {
      pathSegments.push(arc(rTL, inset + rTL, inset));
    } else if (border.sides.top) {
      pathSegments.push(`L ${inset} ${inset}`);
    }

    // Top side
    if (border.sides.top) {
      pathSegments.push(`L ${W - inset - rTR} ${inset}`);
    }

    // Top-right corner arc
    if (rTR > 0 && (border.sides.top || border.sides.right)) {
      pathSegments.push(arc(rTR, W - inset, inset + rTR));
    } else if (border.sides.right) {
      pathSegments.push(`L ${W - inset} ${inset}`);
    }

    // Right side
    if (border.sides.right) {
      pathSegments.push(`L ${W - inset} ${H - inset - rBR}`);
    }

    // Bottom-right corner arc
    if (rBR > 0 && (border.sides.right || border.sides.bottom)) {
      pathSegments.push(arc(rBR, W - inset - rBR, H - inset));
    } else if (border.sides.bottom) {
      pathSegments.push(`L ${W - inset} ${H - inset}`);
    }

    // Bottom side
    if (border.sides.bottom) {
      pathSegments.push(`L ${inset + rBL} ${H - inset}`);
    }

    // Bottom-left corner arc
    if (rBL > 0 && (border.sides.bottom || border.sides.left)) {
      pathSegments.push(arc(rBL, inset, H - inset - rBL));
    } else if (border.sides.left) {
      pathSegments.push(`L ${inset} ${H - inset}`);
    }

    // Left side
    if (border.sides.left) {
      pathSegments.push(`L ${inset} ${inset + rTL}`);
    }

    const pathString = pathSegments.join(' ');
    if (!pathString || pathString === `M ${startX} ${startY}`) return;

    const path = new fabric.Path(pathString, {
      fill: 'transparent',
      stroke: border.color,
      strokeWidth: w,
      strokeDashArray: border.style === 'dashed' ? [w * 2, w] : border.style === 'dotted' ? [w, w * 1.5] : undefined,
      selectable: false,
      evented: false,
    });
    this.canvas.add(path);
    this.canvas.bringObjectToFront(path);
  }

  private renderBackground(background: SceneGraphType['background']): void {
    if (!this.canvas) return;

    switch (background.type) {
      case 'solid': {
        const bgRect = new fabric.Rect({
          left: 0,
          top: 0,
          width: this.canvasWidth,
          height: this.canvasHeight,
          fill: background.value,
          selectable: false,
          evented: false,
          stroke: 'rgba(0,0,0,0.08)',
          strokeWidth: 1,
          shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.08)',
            blur: 32,
            offsetX: 0,
            offsetY: 4,
          }),
        });
        this.canvas.add(bgRect);
        this.canvas.sendObjectToBack(bgRect);
        break;
      }
      case 'gradient': {
        const stops = background.gradientStops || this.parseGradientStops(background.value);
        const angle = background.gradientAngle || 135;
        const rad = (angle * Math.PI) / 180;
        const gradient = new fabric.Gradient({
          type: background.gradientType || 'linear',
          coords: {
            x1: 0,
            y1: 0,
            x2: this.canvasWidth * Math.cos(rad),
            y2: this.canvasHeight * Math.sin(rad),
          },
          colorStops: stops.map((s) => ({ offset: s.offset, color: s.color })),
        });
        const bgRect = new fabric.Rect({
          left: 0,
          top: 0,
          width: this.canvasWidth,
          height: this.canvasHeight,
          fill: gradient as any,
          selectable: false,
          evented: false,
          stroke: 'rgba(0,0,0,0.08)',
          strokeWidth: 1,
          shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.08)',
            blur: 32,
            offsetX: 0,
            offsetY: 4,
          }),
        });
        this.canvas.add(bgRect);
        this.canvas.sendObjectToBack(bgRect);
        break;
      }
      case 'pattern': {
        const bgRect = new fabric.Rect({
          left: 0,
          top: 0,
          width: this.canvasWidth,
          height: this.canvasHeight,
          fill: '#ffffff',
          selectable: false,
          evented: false,
          stroke: 'rgba(0,0,0,0.08)',
          strokeWidth: 1,
          shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.08)',
            blur: 32,
            offsetX: 0,
            offsetY: 4,
          }),
        });
        this.canvas.add(bgRect);
        this.canvas.sendObjectToBack(bgRect);
        break;
      }
      default:
        this.canvas.set('backgroundColor', 'transparent');
    }
  }

  private parseGradientStops(cssValue: string): Array<{ offset: number; color: string }> {
    // Basic parser for linear-gradient strings
    const stops: Array<{ offset: number; color: string }> = [];
    const match = cssValue.match(/gradient\([^,]+,(.+)\)/);
    if (!match) return [{ offset: 0, color: cssValue }, { offset: 1, color: cssValue }];
    const parts = match[1].split(',').map((s) => s.trim());
    parts.forEach((part, index) => {
      const colorMatch = part.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-zA-Z]+)/);
      if (colorMatch) {
        stops.push({ offset: index / Math.max(1, parts.length - 1), color: colorMatch[1] });
      }
    });
    if (stops.length === 0) return [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }];
    return stops;
  }
}
