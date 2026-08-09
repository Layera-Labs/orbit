import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrbitEngine } from '../engine';
import type { Layer } from '@layera-labs/shared';

describe('OrbitEngine (without init)', () => {
  let engine: OrbitEngine;

  beforeEach(() => {
    engine = new OrbitEngine({ width: 800, height: 600 });

    // Mock Audio to prevent timeouts in audio tests
    vi.stubGlobal('Audio', vi.fn(() => ({
      src: '',
      crossOrigin: '',
      volume: 1,
      muted: false,
      loop: false,
      currentTime: 0,
      duration: 30,
      readyState: 4,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: vi.fn((event: string, handler: Function) => {
        if (event === 'canplaythrough') setTimeout(() => handler(), 0);
      }),
      removeEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  it('initializes with config', () => {
    expect(engine.scene.getState().width).toBe(800);
    expect(engine.scene.getState().height).toBe(600);
    expect(engine.viewport.getState().zoom).toBe(100);
    expect(engine.history.canUndo()).toBe(false);
  });

  it('adds a layer', () => {
    const id = engine.addLayer({
      type: 'text',
      name: 'Hello',
      x: 10, y: 20, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'World', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    expect(id).toBeDefined();
    expect(engine.scene.getState().root.length).toBe(1);
  });

  it('selects a layer', () => {
    const id = engine.addLayer({
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    engine.selectLayer(id);
    expect(engine.getSelectedLayers()).toContain(id);
  });

  it('selects multiple layers', () => {
    const id1 = engine.addLayer({
      type: 'text', name: 'A',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    const id2 = engine.addLayer({
      type: 'text', name: 'B',
      x: 100, y: 100, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    engine.selectLayer([id1, id2]);
    expect(engine.getSelectedLayers()).toHaveLength(2);
  });

  it('removes a layer', () => {
    const id = engine.addLayer({
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    engine.removeLayer(id);
    expect(engine.scene.getState().root.length).toBe(0);
  });

  it('loads a replacement scene', () => {
    engine.addLayer({
      type: 'text', name: 'Old',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'Old', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });

    engine.loadScene({
      root: [{
        id: 'layer-next',
        type: 'text',
        name: 'Next',
        x: 0, y: 0, width: 100, height: 50,
        rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
        visible: true, locked: false, blendMode: 'normal', effects: [],
        content: { type: 'text', text: 'Next', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
      }],
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

    expect(engine.scene.getState().root).toHaveLength(1);
    expect(engine.scene.getState().root[0].name).toBe('Next');
    expect(engine.scene.getState().width).toBe(500);
    expect(engine.history.canUndo()).toBe(false);
  });

  it('duplicates a layer', () => {
    const id = engine.addLayer({
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    const dupId = engine.duplicateLayer(id);
    expect(dupId).toBeDefined();
    expect(engine.scene.getState().root.length).toBe(2);
    expect(engine.scene.getState().root[1].name).toBe('Test Copy');
  });

  it('undo/redo add layer', () => {
    const id = engine.addLayer({
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    expect(engine.scene.getState().root.length).toBe(1);
    engine.undo();
    expect(engine.scene.getState().root.length).toBe(0);
    engine.redo();
    expect(engine.scene.getState().root.length).toBe(1);
  });

  it('updateLayer changes properties', () => {
    const id = engine.addLayer({
      type: 'text', name: 'Test',
      x: 0, y: 0, width: 100, height: 50,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      visible: true, locked: false, blendMode: 'normal', effects: [],
      content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' },
    });
    engine.updateLayer(id, { x: 50, y: 75 });
    expect(engine.scene.getLayer(id)?.x).toBe(50);
    expect(engine.scene.getLayer(id)?.y).toBe(75);
  });

  it('moveLayer reorders', () => {
    const id1 = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id2 = engine.addLayer({ type: 'text', name: 'B', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.moveLayer(id1, 1);
    expect(engine.scene.getAllLayers()[1].id).toBe(id1);
  });

  it('bringToFront moves to end', () => {
    const id = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.addLayer({ type: 'text', name: 'B', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.bringToFront(id);
    expect(engine.scene.getAllLayers()[1].id).toBe(id);
  });

  it('sendToBack moves to start', () => {
    engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id = engine.addLayer({ type: 'text', name: 'B', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.sendToBack(id);
    expect(engine.scene.getAllLayers()[0].id).toBe(id);
  });

  it('sets tool and emits event', () => {
    const callback = vi.fn();
    engine.on('toolChange', callback);
    engine.setTool('brush');
    expect(engine.getTool()).toBe('brush');
    expect(callback).toHaveBeenCalledWith('brush');
  });

  it('configureTool updates draw options', () => {
    engine.configureTool({ strokeWidth: 10, color: '#ff0000', mode: 'brush' });
    const opts = engine['drawController'].getOptions();
    expect(opts.strokeWidth).toBe(10);
    expect(opts.color).toBe('#ff0000');
  });

  it('emits zoomChange on viewport update', () => {
    const callback = vi.fn();
    engine.on('zoomChange', callback);
    engine.zoomIn();
    expect(callback).toHaveBeenCalled();
  });

  it('resizeCanvas updates dimensions and preserves layers', () => {
    engine.addLayer({ type: 'text', name: 'Test', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.scene.setBackground({ type: 'solid', value: '#ff0000' });
    engine.resizeCanvas(1920, 1080);
    expect(engine.scene.getState().width).toBe(1920);
    expect(engine.scene.getState().height).toBe(1080);
    expect(engine.scene.getState().root).toHaveLength(1);
    expect(engine.scene.getState().root[0].name).toBe('Test');
    expect(engine.scene.getState().background.value).toBe('#ff0000');
  });

  it('clearCanvas removes all layers', () => {
    engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.addLayer({ type: 'text', name: 'B', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.clearCanvas();
    expect(engine.scene.getState().root).toHaveLength(0);
  });

  it('copy and paste layers', () => {
    const id = engine.addLayer({ type: 'text', name: 'Original', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.selectLayer(id);
    engine.copy();
    const pasted = engine.paste();
    expect(pasted.length).toBe(1);
    expect(engine.scene.getState().root.length).toBe(2);
    expect(engine.scene.getState().root[1].name).toBe('Original Copy');
  });

  it('alignLayers left aligns to minimum x', () => {
    const id1 = engine.addLayer({ type: 'text', name: 'A', x: 10, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id2 = engine.addLayer({ type: 'text', name: 'B', x: 100, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.alignLayers([id1, id2], 'left');
    expect(engine.scene.getLayer(id1)?.x).toBe(10);
    expect(engine.scene.getLayer(id2)?.x).toBe(10);
  });

  it('alignLayers centerH centers horizontally', () => {
    const id1 = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id2 = engine.addLayer({ type: 'text', name: 'B', x: 200, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.alignLayers([id1, id2], 'centerH');
    expect(engine.scene.getLayer(id1)?.x).toBe(100); // center 150 - width/2 50
    expect(engine.scene.getLayer(id2)?.x).toBe(100); // center 150 - width/2 50
  });

  it('distributeLayers horizontally', () => {
    const id1 = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 50, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id2 = engine.addLayer({ type: 'text', name: 'B', x: 50, y: 0, width: 50, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id3 = engine.addLayer({ type: 'text', name: 'C', x: 100, y: 0, width: 50, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'C', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.distributeLayers([id1, id2, id3], 'horizontal');
    expect(engine.scene.getLayer(id1)?.x).toBe(0);
    expect(engine.scene.getLayer(id2)?.x).toBe(50);
    expect(engine.scene.getLayer(id3)?.x).toBe(100);
  });

  it('flipLayer horizontal inverts scaleX', () => {
    const id = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.flipLayer(id, 'horizontal');
    expect(engine.scene.getLayer(id)?.scaleX).toBe(-1);
  });

  it('flipLayer vertical inverts scaleY', () => {
    const id = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.flipLayer(id, 'vertical');
    expect(engine.scene.getLayer(id)?.scaleY).toBe(-1);
  });

  it('groupLayers groups selected layers', () => {
    const id1 = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id2 = engine.addLayer({ type: 'text', name: 'B', x: 100, y: 100, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const groupId = engine.groupLayers([id1, id2]);
    expect(groupId).toBeDefined();
    expect(engine.scene.getAllLayers()).toHaveLength(1);
    expect(engine.scene.getAllLayers()[0].type).toBe('group');
  });

  it('groupLayers returns null for less than 2 layers', () => {
    const id = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    expect(engine.groupLayers([id])).toBeNull();
    expect(engine.scene.getAllLayers()).toHaveLength(1);
    expect(engine.scene.getAllLayers()[0].type).toBe('text');
  });

  it('ungroupLayer restores children', () => {
    const id1 = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id2 = engine.addLayer({ type: 'text', name: 'B', x: 100, y: 100, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const groupId = engine.groupLayers([id1, id2])!;
    const restored = engine.ungroupLayer(groupId);
    expect(restored.length).toBe(2);
    expect(engine.scene.getAllLayers()).toHaveLength(2);
  });

  it('getMaxVideoDuration returns default when no video/audio', () => {
    expect(engine.getMaxVideoDuration()).toBe(60);
  });

  it('getMaxVideoDuration returns max video duration', () => {
    engine.addLayer({ type: 'video', name: 'Vid', x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'video', src: '', duration: 120 } });
    expect(engine.getMaxVideoDuration()).toBe(120);
  });

  it('getMaxVideoDuration returns max audio trim end', () => {
    engine.addLayer({ type: 'audio', name: 'Audio', x: 0, y: 0, width: 0, height: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: false, locked: false, blendMode: 'normal', effects: [], content: { type: 'audio', src: '', duration: 200, trim: { start: 0, end: 150 } } });
    expect(engine.getMaxVideoDuration()).toBe(150);
  });

  it('event on/off works', () => {
    const callback = vi.fn();
    const off = engine.on('test', callback);
    engine['emit']('test', 'arg1');
    expect(callback).toHaveBeenCalledWith('arg1');
    off();
    engine['emit']('test', 'arg2');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('destroy cleans up resources', () => {
    engine.destroy();
    expect(engine['container']).toBeNull();
  });

  // --- Zoom / Viewport ---
  it('setZoom updates viewport as percentage', () => {
    engine.setZoom(200);
    expect(engine.viewport.getState().zoom).toBe(200);
  });

  it('zoomIn increases zoom percentage', () => {
    engine.setZoom(100);
    const before = engine.viewport.getState().zoom;
    engine.zoomIn();
    expect(engine.viewport.getState().zoom).toBeGreaterThan(before);
  });

  it('zoomOut decreases zoom percentage', () => {
    engine.setZoom(200);
    const before = engine.viewport.getState().zoom;
    engine.zoomOut();
    expect(engine.viewport.getState().zoom).toBeLessThan(before);
  });

  it('resetZoom resets to 100%', () => {
    engine.setZoom(50);
    engine.resetZoom();
    expect(engine.viewport.getState().zoom).toBe(100);
  });

  it('zoomToFit does nothing without container', () => {
    expect(() => engine.zoomToFit()).not.toThrow();
  });

  // --- Audio (delegates to AudioManager) ---
  it('addAudioLayer adds track', async () => {
    const layer: Layer = {
      id: 'audio-1', type: 'audio', name: 'Track', x: 0, y: 0, width: 0, height: 0,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: false, locked: false,
      blendMode: 'normal', effects: [],
      content: { type: 'audio', src: '', duration: 10, volume: 0.5, muted: false, loop: false, trim: { start: 0, end: 10 } },
    };
    await engine.addAudioLayer(layer);
    expect(engine.getAudioTrackIds()).toContain('audio-1');
  });

  it('removeAudioLayer removes track', async () => {
    const layer: Layer = {
      id: 'audio-1', type: 'audio', name: 'Track', x: 0, y: 0, width: 0, height: 0,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: false, locked: false,
      blendMode: 'normal', effects: [],
      content: { type: 'audio', src: '', duration: 10 },
    };
    await engine.addAudioLayer(layer);
    engine.removeAudioLayer('audio-1');
    expect(engine.getAudioTrackIds()).not.toContain('audio-1');
  });

  it('audio play/pause/seek work', async () => {
    const layer: Layer = {
      id: 'audio-1', type: 'audio', name: 'Track', x: 0, y: 0, width: 0, height: 0,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: false, locked: false,
      blendMode: 'normal', effects: [],
      content: { type: 'audio', src: '', duration: 10 },
    };
    await engine.addAudioLayer(layer);
    engine.playAudio();
    expect(engine.isAudioPlaying()).toBe(true);
    engine.pauseAudio();
    expect(engine.isAudioPlaying()).toBe(false);
    engine.seekAudio(5);
    expect(engine.getAudioCurrentTime()).toBe(5);
  });

  it('setAudioVolume updates track', async () => {
    const layer: Layer = {
      id: 'audio-1', type: 'audio', name: 'Track', x: 0, y: 0, width: 0, height: 0,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: false, locked: false,
      blendMode: 'normal', effects: [],
      content: { type: 'audio', src: '', duration: 10 },
    };
    await engine.addAudioLayer(layer);
    engine.setAudioVolume('audio-1', 0.3);
    expect(engine['audioManager'].getTrack('audio-1')?.volume).toBe(0.3);
  });

  it('setAudioMuted updates track', async () => {
    const layer: Layer = {
      id: 'audio-1', type: 'audio', name: 'Track', x: 0, y: 0, width: 0, height: 0,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: false, locked: false,
      blendMode: 'normal', effects: [],
      content: { type: 'audio', src: '', duration: 10 },
    };
    await engine.addAudioLayer(layer);
    engine.setAudioMuted('audio-1', true);
    expect(engine['audioManager'].getTrack('audio-1')?.muted).toBe(true);
  });

  it('setAudioTrim updates track', async () => {
    const layer: Layer = {
      id: 'audio-1', type: 'audio', name: 'Track', x: 0, y: 0, width: 0, height: 0,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: false, locked: false,
      blendMode: 'normal', effects: [],
      content: { type: 'audio', src: '', duration: 10 },
    };
    await engine.addAudioLayer(layer);
    engine.setAudioTrim('audio-1', { start: 2, end: 8 });
    expect(engine['audioManager'].getTrack('audio-1')?.trimStart).toBe(2);
    expect(engine['audioManager'].getTrack('audio-1')?.trimEnd).toBe(8);
  });

  it('exportAudio throws when no audio layers', async () => {
    await expect(engine.exportAudio()).rejects.toThrow('No audio layers to export');
  });

  // --- Video (delegates to renderer) ---
  it('playVideo does not throw without init', () => {
    engine.addLayer({ type: 'video', name: 'Vid', x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'video', src: '', duration: 10 } });
    expect(() => engine.playVideo('any-id')).not.toThrow();
  });

  it('pauseVideo does not throw without init', () => {
    expect(() => engine.pauseVideo('any-id')).not.toThrow();
  });

  it('seekVideo does not throw without init', () => {
    expect(() => engine.seekVideo('any-id', 5)).not.toThrow();
  });

  it('getVideoCurrentTime returns 0 without init', () => {
    expect(engine.getVideoCurrentTime('any-id')).toBe(0);
  });

  it('getVideoDuration returns 0 without init', () => {
    expect(engine.getVideoDuration('any-id')).toBe(0);
  });

  it('isVideoPlaying returns false without init', () => {
    expect(engine.isVideoPlaying('any-id')).toBe(false);
  });

  it('playAllVideos does not throw', () => {
    expect(() => engine.playAllVideos()).not.toThrow();
  });

  it('pauseAllVideos does not throw', () => {
    expect(() => engine.pauseAllVideos()).not.toThrow();
  });

  // --- Transitions ---
  it('start/stop transition updates', () => {
    engine.startTransitionUpdates();
    expect(engine['transitionUpdateInterval']).not.toBeNull();
    engine.stopTransitionUpdates();
    expect(engine['transitionUpdateInterval']).toBeNull();
  });

  it('updateTransitions applies overrides for video layers', () => {
    const id = engine.addLayer({ type: 'video', name: 'Vid', x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'video', src: '', duration: 10 }, transitionIn: { type: 'fade', duration: 1, easing: 'linear' } });
    engine['renderer'].setTransitionOverrides = vi.fn();
    engine.updateTransitions(0.5);
    expect(engine['renderer'].setTransitionOverrides).toHaveBeenCalled();
  });

  // --- Path Editing ---
  it('startPathEdit returns false for non-shape layers', () => {
    const id = engine.addLayer({ type: 'text', name: 'Text', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    expect(engine.startPathEdit(id)).toBe(false);
  });

  it('startPathEdit returns false for non-path shapes', () => {
    const id = engine.addLayer({ type: 'shape', name: 'Rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'shape', shape: 'rect', fill: '#f00', stroke: '#000', strokeWidth: 2 } });
    expect(engine.startPathEdit(id)).toBe(false);
  });

  it('stopPathEdit does not throw', () => {
    expect(() => engine.stopPathEdit()).not.toThrow();
  });

  it('isPathEditing returns false initially', () => {
    expect(engine.isPathEditing()).toBe(false);
  });

  // --- Watermark / Theme / Snap ---
  it('setCanvasWatermark does not throw', () => {
    expect(() => engine.setCanvasWatermark({ type: 'text', content: 'Watermark', position: 'bottom-right', opacity: 0.5 })).not.toThrow();
  });

  it('setTheme applies CSS variables', () => {
    engine.setTheme({ name: 'test', variables: { '--orbit-primary': '#ff0000' } });
    expect(document.documentElement.style.getPropertyValue('--orbit-primary')).toBe('#ff0000');
  });

  it('setSnapToGrid does not throw', () => {
    expect(() => engine.setSnapToGrid(true, 20)).not.toThrow();
  });

  // --- Export ---
  it('exportToDataURL returns empty string without init', () => {
    expect(engine.exportToDataURL('png')).toBe('');
  });

  it('export resolves to blob for png', async () => {
    // Mock renderer to return a valid data URL
    engine['renderer'].exportToDataURL = vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgo=');
    const blob = await engine.export({ format: 'png' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('export resolves to blob for jpg', async () => {
    engine['renderer'].exportToDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,AAAA');
    const blob = await engine.export({ format: 'jpg' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });

  it('export returns SVG blob for svg format', async () => {
    const svg = '<svg><rect width="100" height="100"/></svg>';
    engine['renderer'].exportToDataURL = vi.fn().mockReturnValue('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    const blob = await engine.export({ format: 'svg' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/svg+xml');
  });

  // --- Misc ---
  it('getCanvasElement returns null without init', () => {
    expect(engine.getCanvasElement()).toBeNull();
  });

  it('bringForward and sendBackward work', () => {
    const id1 = engine.addLayer({ type: 'text', name: 'A', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'A', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    const id2 = engine.addLayer({ type: 'text', name: 'B', x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, locked: false, blendMode: 'normal', effects: [], content: { type: 'text', text: 'B', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, color: '#000', alignment: 'left' } });
    engine.bringForward(id1);
    expect(engine.scene.getAllLayers()[1].id).toBe(id1);
    engine.sendBackward(id2);
    expect(engine.scene.getAllLayers()[0].id).toBe(id2);
  });
});
