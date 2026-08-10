import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '../scene-graph';
import {
  AddLayerCommand,
  RemoveLayerCommand,
  UpdateLayerCommand,
  MoveLayerCommand,
  DuplicateLayerCommand,
  GroupLayersCommand,
  UngroupLayerCommand,
} from '../commands';
import type { Layer } from '@layera-labs/orbit-shared';

function createTextLayer(name: string, x = 0, y = 0): Omit<Layer, 'id'> {
  return {
    type: 'text',
    name,
    x, y, width: 100, height: 50,
    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    visible: true, locked: false, blendMode: 'normal', effects: [],
    content: { type: 'text', text: name, fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
  };
}

describe('Commands', () => {
  let scene: SceneGraph;

  beforeEach(() => {
    scene = new SceneGraph(1080, 1080);
  });

  describe('AddLayerCommand', () => {
    it('adds a layer on execute', () => {
      const cmd = new AddLayerCommand(scene, createTextLayer('Test'));
      cmd.execute();
      expect(scene.getAllLayers()).toHaveLength(1);
    });

    it('removes layer on undo', () => {
      const cmd = new AddLayerCommand(scene, createTextLayer('Test'));
      cmd.execute();
      const id = (cmd as any).layerId;
      cmd.undo();
      expect(scene.getLayer(id)).toBeUndefined();
    });

    it('re-adds layer on redo', () => {
      const cmd = new AddLayerCommand(scene, createTextLayer('Test'));
      cmd.execute();
      cmd.undo();
      cmd.redo();
      expect(scene.getAllLayers()).toHaveLength(1);
    });
  });

  describe('RemoveLayerCommand', () => {
    it('removes layer on execute', () => {
      const id = scene.addLayer(createTextLayer('Test'));
      const cmd = new RemoveLayerCommand(scene, id);
      cmd.execute();
      expect(scene.getLayer(id)).toBeUndefined();
    });

    it('restores layer on undo', () => {
      const id = scene.addLayer(createTextLayer('Test'));
      const cmd = new RemoveLayerCommand(scene, id);
      cmd.execute();
      cmd.undo();
      expect(scene.getLayer(id)).toBeDefined();
    });

    it('restores at correct index on undo', () => {
      const id1 = scene.addLayer(createTextLayer('First'));
      scene.addLayer(createTextLayer('Second'));
      const cmd = new RemoveLayerCommand(scene, id1);
      cmd.execute();
      cmd.undo();
      expect(scene.getAllLayers()[0].id).toBe(id1);
    });
  });

  describe('UpdateLayerCommand', () => {
    it('updates layer on execute', () => {
      const id = scene.addLayer(createTextLayer('Test', 0, 0));
      const cmd = new UpdateLayerCommand(scene, id, { x: 100, y: 200 });
      cmd.execute();
      expect(scene.getLayer(id)?.x).toBe(100);
      expect(scene.getLayer(id)?.y).toBe(200);
    });

    it('restores old values on undo', () => {
      const id = scene.addLayer(createTextLayer('Test', 10, 20));
      const cmd = new UpdateLayerCommand(scene, id, { x: 100 });
      cmd.execute();
      cmd.undo();
      expect(scene.getLayer(id)?.x).toBe(10);
    });

    it('re-applies new values on redo', () => {
      const id = scene.addLayer(createTextLayer('Test'));
      const cmd = new UpdateLayerCommand(scene, id, { x: 100 });
      cmd.execute();
      cmd.undo();
      cmd.redo();
      expect(scene.getLayer(id)?.x).toBe(100);
    });

    it('handles content updates', () => {
      const id = scene.addLayer(createTextLayer('Test'));
      const newContent = { type: 'text' as const, text: 'Updated', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' };
      const cmd = new UpdateLayerCommand(scene, id, { content: newContent });
      cmd.execute();
      expect((scene.getLayer(id)?.content as any).text).toBe('Updated');
    });

    it('does nothing for missing layer', () => {
      const cmd = new UpdateLayerCommand(scene, 'missing', { x: 100 });
      expect(() => cmd.execute()).not.toThrow();
    });
  });

  describe('MoveLayerCommand', () => {
    it('moves layer on execute', () => {
      const id = scene.addLayer(createTextLayer('A'));
      scene.addLayer(createTextLayer('B'));
      scene.addLayer(createTextLayer('C'));
      const cmd = new MoveLayerCommand(scene, id, 2);
      cmd.execute();
      expect(scene.getAllLayers()[2].id).toBe(id);
    });

    it('restores original index on undo', () => {
      const id = scene.addLayer(createTextLayer('A'));
      scene.addLayer(createTextLayer('B'));
      const cmd = new MoveLayerCommand(scene, id, 1);
      cmd.execute();
      cmd.undo();
      expect(scene.getAllLayers()[0].id).toBe(id);
    });

    it('re-moves on redo', () => {
      const id = scene.addLayer(createTextLayer('A'));
      scene.addLayer(createTextLayer('B'));
      const cmd = new MoveLayerCommand(scene, id, 1);
      cmd.execute();
      cmd.undo();
      cmd.redo();
      expect(scene.getAllLayers()[1].id).toBe(id);
    });
  });

  describe('DuplicateLayerCommand', () => {
    it('duplicates layer on execute', () => {
      const id = scene.addLayer(createTextLayer('Original'));
      const cmd = new DuplicateLayerCommand(scene, id);
      cmd.execute();
      expect(scene.getAllLayers()).toHaveLength(2);
      expect(scene.getAllLayers()[1].name).toBe('Original Copy');
    });

    it('removes duplicate on undo', () => {
      const id = scene.addLayer(createTextLayer('Original'));
      const cmd = new DuplicateLayerCommand(scene, id);
      cmd.execute();
      cmd.undo();
      expect(scene.getAllLayers()).toHaveLength(1);
    });

    it('does nothing for missing layer', () => {
      const cmd = new DuplicateLayerCommand(scene, 'missing');
      expect(() => cmd.execute()).not.toThrow();
      expect(scene.getAllLayers()).toHaveLength(0);
    });
  });

  describe('GroupLayersCommand', () => {
    it('groups layers on execute', () => {
      const id1 = scene.addLayer(createTextLayer('A', 0, 0));
      const id2 = scene.addLayer(createTextLayer('B', 100, 100));
      const cmd = new GroupLayersCommand(scene, [id1, id2]);
      cmd.execute();
      expect(scene.getAllLayers()).toHaveLength(1);
      expect(scene.getAllLayers()[0].type).toBe('group');
    });

    it('restores children on undo', () => {
      const id1 = scene.addLayer(createTextLayer('A', 0, 0));
      const id2 = scene.addLayer(createTextLayer('B', 100, 100));
      const cmd = new GroupLayersCommand(scene, [id1, id2]);
      cmd.execute();
      cmd.undo();
      expect(scene.getAllLayers()).toHaveLength(2);
    });

    it('groups even with 1 layer (creates single-child group)', () => {
      const id = scene.addLayer(createTextLayer('A'));
      const cmd = new GroupLayersCommand(scene, [id]);
      cmd.execute();
      expect(scene.getAllLayers()).toHaveLength(1);
      expect(scene.getAllLayers()[0].type).toBe('group');
    });

    it('restores children to original positions on undo', () => {
      const id1 = scene.addLayer(createTextLayer('A', 10, 20));
      const id2 = scene.addLayer(createTextLayer('B', 110, 120));
      const cmd = new GroupLayersCommand(scene, [id1, id2]);
      cmd.execute();
      cmd.undo();
      expect(scene.getAllLayers()[0].x).toBe(10);
      expect(scene.getAllLayers()[0].y).toBe(20);
    });
  });

  describe('UngroupLayerCommand', () => {
    it('ungroups on execute', () => {
      const id1 = scene.addLayer(createTextLayer('A', 0, 0));
      const id2 = scene.addLayer(createTextLayer('B', 100, 100));
      const groupCmd = new GroupLayersCommand(scene, [id1, id2]);
      groupCmd.execute();
      const groupId = groupCmd.groupId;

      const cmd = new UngroupLayerCommand(scene, groupId);
      cmd.execute();
      expect(scene.getAllLayers()).toHaveLength(2);
    });

    it('restores group on undo', () => {
      const id1 = scene.addLayer(createTextLayer('A', 0, 0));
      const id2 = scene.addLayer(createTextLayer('B', 100, 100));
      const groupCmd = new GroupLayersCommand(scene, [id1, id2]);
      groupCmd.execute();
      const groupId = groupCmd.groupId;

      const cmd = new UngroupLayerCommand(scene, groupId);
      cmd.execute();
      cmd.undo();
      expect(scene.getAllLayers()).toHaveLength(1);
      expect(scene.getAllLayers()[0].type).toBe('group');
    });

    it('does nothing for non-group layer', () => {
      const id = scene.addLayer(createTextLayer('A'));
      const cmd = new UngroupLayerCommand(scene, id);
      expect(() => cmd.execute()).not.toThrow();
      expect(scene.getAllLayers()).toHaveLength(1);
    });
  });
});
