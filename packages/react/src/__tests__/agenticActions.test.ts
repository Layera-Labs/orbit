import { describe, expect, it } from 'vitest';
import { OrbitEngine } from '@orbit/core';
import { createFallbackActionsFromPrompt, executeAgenticActions } from '../agentic/actions';

describe('agentic canvas actions', () => {
  it('adds and updates text layers through structured actions', () => {
    const engine = new OrbitEngine({ width: 1000, height: 800 });
    const [textId] = executeAgenticActions(engine, [
      { type: 'addText', text: 'Hello Orbit', fontSize: 48, color: '#2563eb' },
    ]);

    const textLayer = engine.scene.getLayer(textId);
    expect(textLayer?.type).toBe('text');
    expect(textLayer?.x).toBeCloseTo((1000 - (textLayer?.width ?? 0)) / 2);
    expect(textLayer?.y).toBeCloseTo((800 - (textLayer?.height ?? 0)) / 2);
    expect(textLayer?.content).toMatchObject({ text: 'Hello Orbit', fontSize: 48, color: '#2563eb' });
    expect(engine.getSelectedLayers()).toEqual([textId]);

    executeAgenticActions(engine, [
      { type: 'updateText', layerId: textId, text: 'Updated', color: '#dc2626' },
    ]);
    expect(engine.scene.getLayer(textId)?.content).toMatchObject({ text: 'Updated', color: '#dc2626' });
  });

  it('adds background layers behind canvas content', () => {
    const engine = new OrbitEngine({ width: 1000, height: 800 });
    const [shapeId] = executeAgenticActions(engine, [{ type: 'addShape', shape: 'circle' }]);
    const [backgroundId] = executeAgenticActions(engine, [{ type: 'addBackgroundLayer', value: '#f8fafc' }]);

    const layers = engine.scene.getAllLayers();
    expect(layers[0].id).toBe(backgroundId);
    expect(layers[1].id).toBe(shapeId);
    expect(engine.scene.getLayer(backgroundId)?.content).toMatchObject({ fill: '#f8fafc' });
  });

  it('moves, resizes, styles, and deletes target layers', () => {
    const engine = new OrbitEngine({ width: 1000, height: 800 });
    const [shapeId] = executeAgenticActions(engine, [
      { type: 'addShape', shape: 'rectangle', fill: '#2563eb' },
    ]);

    executeAgenticActions(engine, [
      { type: 'moveResizeLayer', layerId: shapeId, x: 10, y: 20, width: 300, height: 200 },
      { type: 'updateLayerStyle', layerId: shapeId, fill: '#16a34a', opacity: 0.5 },
    ]);

    expect(engine.scene.getLayer(shapeId)).toMatchObject({ x: 10, y: 20, width: 300, height: 200, opacity: 0.5 });
    expect(engine.scene.getLayer(shapeId)?.content).toMatchObject({ fill: '#16a34a' });

    executeAgenticActions(engine, [{ type: 'deleteLayer', layerId: shapeId }]);
    expect(engine.scene.getLayer(shapeId)).toBeUndefined();
  });

  it('creates deterministic fallback actions from simple prompts', () => {
    expect(createFallbackActionsFromPrompt('add a heading that says "Sale" in red')).toEqual([
      { type: 'addText', text: 'Sale', color: '#dc2626', fontSize: 44, fontWeight: 700 },
    ]);

    expect(createFallbackActionsFromPrompt('make the selected layer blue', ['layer-1'])).toEqual([
      { type: 'updateLayerStyle', layerId: 'layer-1', fill: '#2563eb', color: '#2563eb' },
    ]);
  });
});
