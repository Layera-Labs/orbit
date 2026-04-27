import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../history';
import { AddLayerCommand, UpdateLayerCommand } from '../commands';
import { SceneGraph } from '../scene-graph';

describe('CommandHistory', () => {
  it('executes and stores a command', () => {
    const history = new CommandHistory();
    const scene = new SceneGraph();
    const cmd = new AddLayerCommand(scene, {
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'Hello', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    history.execute(cmd);
    expect(scene.getState().root.length).toBe(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('undoes a command', () => {
    const history = new CommandHistory();
    const scene = new SceneGraph();
    const cmd = new AddLayerCommand(scene, {
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'Hello', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    history.execute(cmd);
    history.undo();
    expect(scene.getState().root.length).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('redoes a command', () => {
    const history = new CommandHistory();
    const scene = new SceneGraph();
    const cmd = new AddLayerCommand(scene, {
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'Hello', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    history.execute(cmd);
    history.undo();
    history.redo();
    expect(scene.getState().root.length).toBe(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('clears redo stack on new command', () => {
    const history = new CommandHistory();
    const scene = new SceneGraph();
    const cmd1 = new AddLayerCommand(scene, {
      type: 'text', name: 'First',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    const cmd2 = new AddLayerCommand(scene, {
      type: 'text', name: 'Second',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    history.execute(cmd1);
    history.undo();
    history.execute(cmd2);
    expect(history.canRedo()).toBe(false);
    expect(scene.getState().root.length).toBe(1);
    expect(scene.getState().root[0].name).toBe('Second');
  });
});
