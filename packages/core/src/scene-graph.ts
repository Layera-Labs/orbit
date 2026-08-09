/**
 * Scene Graph - Manages the hierarchical layer tree
 */

import { generateId } from '@layera-labs/shared';
import type { Layer, SceneGraph as SceneGraphType, BackgroundProps, CanvasBorder } from '@layera-labs/shared';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneLayer(layer: Layer): Layer {
  return clone(layer);
}

function cloneState(state: SceneGraphType): SceneGraphType {
  return clone(state);
}

function findLayerInRoot(layers: Layer[], id: string): Layer | undefined {
  for (const layer of layers) {
    if (layer.id === id) {
      return layer;
    }
    if (layer.type === 'group') {
      const found = findLayerInRoot((layer.content as { children: Layer[] }).children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export class SceneGraph {
  private state: SceneGraphType;
  private listeners: Set<(state: SceneGraphType) => void> = new Set();

  constructor(width = 1080, height = 1080) {
    this.state = {
      root: [],
      background: { type: 'solid', value: '#ffffff' },
      border: {
        width: 0,
        color: '#000000',
        style: 'solid',
        radius: 0,
        sides: { top: true, right: true, bottom: true, left: true },
        radiusCorners: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
      },
      width,
      height,
    };
  }

  getState(): SceneGraphType {
    return cloneState(this.state);
  }

  setState(state: SceneGraphType): void {
    this.state = cloneState(state);
    this.emit();
  }

  setBackground(background: BackgroundProps): void {
    this.state = {
      ...this.state,
      background: clone(background),
    };
    this.emit();
  }

  setBorder(border: Partial<CanvasBorder>): void {
    this.state = {
      ...this.state,
      border: {
        ...this.state.border,
        ...clone(border),
      },
    };
    this.emit();
  }

  setDimensions(width: number, height: number): void {
    this.state = {
      ...this.state,
      width,
      height,
    };
    this.emit();
  }

  // Layer management
  addLayer(layer: Omit<Layer, 'id'>): string {
    const id = generateId('layer');
    const fullLayer = cloneLayer({ ...layer, id } as Layer);
    this.state = {
      ...this.state,
      root: [...this.state.root, fullLayer],
    };
    this.emit();
    return id;
  }

  insertLayerAt(index: number, layer: Layer): void {
    this.state = {
      ...this.state,
      root: (() => {
        const root = [...this.state.root];
        root.splice(index, 0, cloneLayer(layer));
        return root;
      })(),
    };
    this.emit();
  }

  removeLayer(id: string): boolean {
    const index = this.state.root.findIndex((l) => l.id === id);
    if (index !== -1) {
      const root = [...this.state.root];
      root.splice(index, 1);
      this.state = {
        ...this.state,
        root,
      };
      this.emit();
      return true;
    }

    // Try removing from groups recursively
    for (const layer of this.state.root) {
      if (layer.type === 'group') {
        const content = layer.content as { children: Layer[] };
        const childIndex = content.children.findIndex((c) => c.id === id);
        if (childIndex !== -1) {
          const root = [...this.state.root];
          const groupLayer = { ...layer };
          const children = [...content.children];
          children.splice(childIndex, 1);
          (groupLayer as { content: { children: Layer[] } }).content = {
            ...(groupLayer.content as object),
            children,
          };
          root[this.state.root.findIndex((l) => l.id === layer.id)] = groupLayer;
          this.state = {
            ...this.state,
            root,
          };
          this.emit();
          return true;
        }
      }
    }
    return false;
  }

  getLayer(id: string): Layer | undefined {
    return findLayerInRoot(this.state.root, id);
  }

  updateLayer(id: string, updates: Partial<Layer>): boolean {
    const nextState = cloneState(this.state);
    const layer = findLayerInRoot(nextState.root, id);
    if (!layer) return false;
    const nextLayer = { ...layer, ...updates };
    const topLevelIndex = nextState.root.findIndex((l) => l.id === id);
    if (topLevelIndex !== -1) {
      nextState.root[topLevelIndex] = nextLayer;
      this.state = nextState;
      this.emit();
      return true;
    }

    // Recursive update for nested group layers
    const updateGroupChildren = (layers: Layer[]): boolean => {
      for (let i = 0; i < layers.length; i++) {
        const candidate = layers[i];
      if (candidate.type !== 'group') continue;
      const children = [...(candidate.content as { children: Layer[] }).children];
      const childIndex = children.findIndex((child) => child.id === id);
      if (childIndex !== -1) {
        children[childIndex] = nextLayer;
        layers[i] = {
          ...candidate,
          content: {
            ...(candidate.content as { type: 'group'; children: Layer[] }),
            children,
          },
        };
        return true;
        }

        if (updateGroupChildren(children)) {
          layers[i] = {
            ...candidate,
            content: {
              ...(candidate.content as { type: 'group'; children: Layer[] }),
              children,
            },
          };
          return true;
        }
      }
      return false;
    };

    const nextRoot = [...nextState.root];
    const updated = updateGroupChildren(nextRoot);
    if (!updated) {
      return false;
    }

    this.state = {
      ...nextState,
      root: nextRoot,
    };
    this.emit();
    return true;
  }

  moveLayer(id: string, newIndex: number): boolean {
    const currentIndex = this.state.root.findIndex((l) => l.id === id);
    if (currentIndex === -1) return false;
    const root = [...this.state.root];
    const [layer] = root.splice(currentIndex, 1);
    root.splice(newIndex, 0, layer);
    this.state = {
      ...this.state,
      root,
    };
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
