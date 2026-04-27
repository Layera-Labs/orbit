/**
 * Scene Graph - Manages the hierarchical layer tree
 */

import { generateId } from '@orbit/shared';
import type { Layer, SceneGraph as SceneGraphType, BackgroundProps } from '@orbit/shared';

export class SceneGraph {
  private state: SceneGraphType;
  private listeners: Set<(state: SceneGraphType) => void> = new Set();

  constructor(width = 1080, height = 1080) {
    this.state = {
      root: [],
      background: { type: 'solid', value: '#ffffff' },
      width,
      height,
    };
  }

  getState(): SceneGraphType {
    return this.state;
  }

  setBackground(background: BackgroundProps): void {
    this.state.background = background;
    this.emit();
  }

  setDimensions(width: number, height: number): void {
    this.state.width = width;
    this.state.height = height;
    this.emit();
  }

  // Layer management
  addLayer(layer: Omit<Layer, 'id'>): string {
    const id = generateId('layer');
    const fullLayer = { ...layer, id } as Layer;
    this.state.root.push(fullLayer);
    this.emit();
    return id;
  }

  insertLayerAt(index: number, layer: Layer): void {
    this.state.root.splice(index, 0, layer);
    this.emit();
  }

  removeLayer(id: string): boolean {
    const index = this.state.root.findIndex((l) => l.id === id);
    if (index !== -1) {
      this.state.root.splice(index, 1);
      this.emit();
      return true;
    }
    // Try removing from groups recursively
    for (const layer of this.state.root) {
      if (layer.type === 'group') {
        const content = layer.content as { children: Layer[] };
        const childIndex = content.children.findIndex((c) => c.id === id);
        if (childIndex !== -1) {
          content.children.splice(childIndex, 1);
          this.emit();
          return true;
        }
      }
    }
    return false;
  }

  getLayer(id: string): Layer | undefined {
    for (const layer of this.state.root) {
      if (layer.id === id) return layer;
      if (layer.type === 'group') {
        const content = layer.content as { children: Layer[] };
        const found = content.children.find((c) => c.id === id);
        if (found) return found;
      }
    }
    return undefined;
  }

  updateLayer(id: string, updates: Partial<Layer>): boolean {
    const layer = this.getLayer(id);
    if (!layer) return false;
    Object.assign(layer, updates);
    this.emit();
    return true;
  }

  moveLayer(id: string, newIndex: number): boolean {
    const currentIndex = this.state.root.findIndex((l) => l.id === id);
    if (currentIndex === -1) return false;
    const [layer] = this.state.root.splice(currentIndex, 1);
    this.state.root.splice(newIndex, 0, layer);
    this.emit();
    return true;
  }

  bringToFront(id: string): boolean {
    return this.moveLayer(id, this.state.root.length - 1);
  }

  sendToBack(id: string): boolean {
    return this.moveLayer(id, 0);
  }

  bringForward(id: string): boolean {
    const index = this.state.root.findIndex((l) => l.id === id);
    if (index === -1 || index >= this.state.root.length - 1) return false;
    return this.moveLayer(id, index + 1);
  }

  sendBackward(id: string): boolean {
    const index = this.state.root.findIndex((l) => l.id === id);
    if (index === -1 || index <= 0) return false;
    return this.moveLayer(id, index - 1);
  }

  getAllLayers(): Layer[] {
    return [...this.state.root];
  }

  // Subscribe to changes
  subscribe(listener: (state: SceneGraphType) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
