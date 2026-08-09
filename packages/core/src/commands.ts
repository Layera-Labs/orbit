/**
 * Commands for the history system
 */

import type { Command } from './history';
import type { SceneGraph } from './scene-graph';
import type { Layer } from '@layera-labs/shared';

export class AddLayerCommand implements Command {
  label = 'Add Layer';
  private layerId: string = '';

  constructor(
    private sceneGraph: SceneGraph,
    private layer: Omit<Layer, 'id'>
  ) {}

  execute(): void {
    this.layerId = this.sceneGraph.addLayer(this.layer);
  }

  undo(): void {
    if (this.layerId) {
      this.sceneGraph.removeLayer(this.layerId);
    }
  }

  redo(): void {
    this.execute();
  }
}

export class RemoveLayerCommand implements Command {
  label = 'Remove Layer';
  private removedLayer: Layer | null = null;
  private removedIndex: number = -1;

  constructor(
    private sceneGraph: SceneGraph,
    private layerId: string
  ) {}

  execute(): void {
    const layers = this.sceneGraph.getAllLayers();
    this.removedIndex = layers.findIndex((l: Layer) => l.id === this.layerId);
    this.removedLayer = layers[this.removedIndex] || null;
    this.sceneGraph.removeLayer(this.layerId);
  }

  undo(): void {
    if (this.removedLayer && this.removedIndex >= 0) {
      this.sceneGraph.insertLayerAt(this.removedIndex, this.removedLayer);
    }
  }

  redo(): void {
    this.execute();
  }
}

export class UpdateLayerCommand implements Command {
  label = 'Update Layer';
  private oldValues: Partial<Layer> = {};

  constructor(
    private sceneGraph: SceneGraph,
    private layerId: string,
    private newValues: Partial<Layer>
  ) {}

  execute(): void {
    const layer = this.sceneGraph.getLayer(this.layerId);
    if (!layer) return;
    // Store old values
    this.oldValues = {};
    for (const key of Object.keys(this.newValues)) {
      (this.oldValues as Record<string, unknown>)[key] = ((layer as unknown) as Record<string, unknown>)[key];
    }
    this.sceneGraph.updateLayer(this.layerId, this.newValues);
  }

  undo(): void {
    this.sceneGraph.updateLayer(this.layerId, this.oldValues);
  }

  redo(): void {
    this.sceneGraph.updateLayer(this.layerId, this.newValues);
  }
}

export class MoveLayerCommand implements Command {
  label = 'Move Layer';
  private oldIndex: number = -1;

  constructor(
    private sceneGraph: SceneGraph,
    private layerId: string,
    private newIndex: number
  ) {}

  execute(): void {
    const layers = this.sceneGraph.getAllLayers();
    this.oldIndex = layers.findIndex((l: Layer) => l.id === this.layerId);
    this.sceneGraph.moveLayer(this.layerId, this.newIndex);
  }

  undo(): void {
    this.sceneGraph.moveLayer(this.layerId, this.oldIndex);
  }

  redo(): void {
    this.sceneGraph.moveLayer(this.layerId, this.newIndex);
  }
}

export class DuplicateLayerCommand implements Command {
  label = 'Duplicate Layer';
  duplicatedId: string = '';

  constructor(
    private sceneGraph: SceneGraph,
    private layerId: string
  ) {}

  execute(): void {
    const layer = this.sceneGraph.getLayer(this.layerId);
    if (!layer) return;
    const duplicated: Omit<Layer, 'id'> = {
      ...layer,
      name: `${layer.name} Copy`,
      x: layer.x + 20,
      y: layer.y + 20,
    };
    this.duplicatedId = this.sceneGraph.addLayer(duplicated);
  }

  undo(): void {
    if (this.duplicatedId) {
      this.sceneGraph.removeLayer(this.duplicatedId);
    }
  }

  redo(): void {
    this.execute();
  }
}

export class GroupLayersCommand implements Command {
  label = 'Group Layers';
  groupId: string = '';
  private originalIndices: { id: string; index: number }[] = [];

  constructor(
    private sceneGraph: SceneGraph,
    private layerIds: string[]
  ) {}

  execute(): void {
    const layers = this.sceneGraph.getAllLayers();
    const children: Layer[] = [];

    // Sort by index so we remove from back to front
    this.originalIndices = this.layerIds
      .map((id) => ({ id, index: layers.findIndex((l) => l.id === id) }))
      .filter((item) => item.index !== -1)
      .sort((a, b) => b.index - a.index);

    for (const item of this.originalIndices) {
      const layer = layers[item.index];
      if (layer) {
        children.unshift(layer);
        this.sceneGraph.removeLayer(layer.id);
      }
    }

    if (children.length === 0) return;

    // Calculate group bounds
    const minX = Math.min(...children.map((c) => c.x));
    const minY = Math.min(...children.map((c) => c.y));
    const maxX = Math.max(...children.map((c) => c.x + c.width));
    const maxY = Math.max(...children.map((c) => c.y + c.height));

    // Adjust children positions relative to group
    const adjustedChildren = children.map((child) => ({
      ...child,
      x: child.x - minX,
      y: child.y - minY,
    }));

    const groupLayer: Omit<Layer, 'id'> = {
      type: 'group',
      name: 'Group',
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      visible: true,
      locked: false,
      blendMode: 'normal',
      effects: [],
      content: {
        type: 'group',
        children: adjustedChildren,
      },
    };

    this.groupId = this.sceneGraph.addLayer(groupLayer);
  }

  undo(): void {
    const group = this.sceneGraph.getLayer(this.groupId);
    if (!group || group.type !== 'group') return;

    const content = group.content as { children: Layer[] };

    // Restore children to original positions
    for (const child of content.children) {
      const restored: Omit<Layer, 'id'> = {
        ...child,
        x: child.x + group.x,
        y: child.y + group.y,
      };
      this.sceneGraph.addLayer(restored);
    }

    this.sceneGraph.removeLayer(this.groupId);
  }

  redo(): void {
    this.execute();
  }
}

export class UngroupLayerCommand implements Command {
  label = 'Ungroup Layer';
  private restoredIds: string[] = [];
  private groupIndex: number = -1;
  private groupLayer: Layer | null = null;

  constructor(
    private sceneGraph: SceneGraph,
    private groupId: string
  ) {}

  execute(): void {
    const group = this.sceneGraph.getLayer(this.groupId);
    if (!group || group.type !== 'group') return;

    this.groupLayer = group;
    const layers = this.sceneGraph.getAllLayers();
    this.groupIndex = layers.findIndex((l) => l.id === this.groupId);

    const content = group.content as { children: Layer[] };

    for (const child of content.children) {
      const restored: Omit<Layer, 'id'> = {
        ...child,
        x: child.x + group.x,
        y: child.y + group.y,
      };
      const id = this.sceneGraph.addLayer(restored);
      this.restoredIds.push(id);
    }

    this.sceneGraph.removeLayer(this.groupId);
  }

  undo(): void {
    // Remove restored layers
    for (const id of this.restoredIds) {
      this.sceneGraph.removeLayer(id);
    }
    this.restoredIds = [];

    // Re-add the group at its original position
    if (this.groupLayer) {
      this.sceneGraph.insertLayerAt(this.groupIndex, this.groupLayer);
    }
  }

  redo(): void {
    this.restoredIds = [];
    this.execute();
  }
}
