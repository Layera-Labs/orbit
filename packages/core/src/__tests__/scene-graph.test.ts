import { describe, it, expect } from 'vitest';
import { SceneGraph } from '../scene-graph';

describe('SceneGraph', () => {
  it('creates with default dimensions', () => {
    const sg = new SceneGraph();
    const state = sg.getState();
    expect(state.width).toBe(1080);
    expect(state.height).toBe(1080);
    expect(state.root).toEqual([]);
  });

  it('creates with custom dimensions', () => {
    const sg = new SceneGraph(1920, 1080);
    const state = sg.getState();
    expect(state.width).toBe(1920);
    expect(state.height).toBe(1080);
  });

  it('adds a layer', () => {
    const sg = new SceneGraph();
    const id = sg.addLayer({
      type: 'text',
      name: 'Test',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      visible: true,
      locked: false,
      blendMode: 'normal',
      effects: [],
      content: { type: 'text', text: 'Hello', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    expect(id).toBeDefined();
    expect(sg.getState().root.length).toBe(1);
    expect(sg.getState().root[0].name).toBe('Test');
  });

  it('removes a layer', () => {
    const sg = new SceneGraph();
    const id = sg.addLayer({
      type: 'text',
      name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'Hello', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    sg.removeLayer(id);
    expect(sg.getState().root.length).toBe(0);
  });

  it('updates a layer', () => {
    const sg = new SceneGraph();
    const id = sg.addLayer({
      type: 'text',
      name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'Hello', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    sg.updateLayer(id, { x: 50, opacity: 0.5 });
    const layer = sg.getLayer(id);
    expect(layer?.x).toBe(50);
    expect(layer?.opacity).toBe(0.5);
  });

  it('moves a layer', () => {
    const sg = new SceneGraph();
    const id1 = sg.addLayer({
      type: 'text', name: 'First',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    const id2 = sg.addLayer({
      type: 'text', name: 'Second',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    sg.moveLayer(id2, 0);
    expect(sg.getState().root[0].id).toBe(id2);
    expect(sg.getState().root[1].id).toBe(id1);
  });

  it('notifies subscribers on changes', () => {
    const sg = new SceneGraph();
    let called = false;
    const unsub = sg.subscribe(() => { called = true; });
    sg.addLayer({
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'Hello', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    expect(called).toBe(true);
    unsub();
  });

  it('sets background', () => {
    const sg = new SceneGraph();
    sg.setBackground({ type: 'solid', value: '#ff0000' });
    expect(sg.getState().background.value).toBe('#ff0000');
  });

  it('replaces the full scene state', () => {
    const sg = new SceneGraph();
    sg.addLayer({
      type: 'text', name: 'Old',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'Old', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });

    sg.setState({
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
      width: 500,
      height: 400,
    });

    expect(sg.getState().root).toEqual([]);
    expect(sg.getState().width).toBe(500);
    expect(sg.getState().height).toBe(400);
  });
});
