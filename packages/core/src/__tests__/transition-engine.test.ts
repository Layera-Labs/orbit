import { describe, it, expect } from 'vitest';
import { TransitionEngine } from '../transition-engine';
import type { Layer, Transition } from '@layera-labs/orbit-shared';

function createLayer(transitionIn?: Transition, transitionOut?: Transition): Layer {
  return {
    id: '1',
    type: 'image',
    name: 'Test',
    x: 0, y: 0, width: 100, height: 100,
    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    visible: true, locked: false, blendMode: 'normal', effects: [],
    content: { type: 'image', src: '', naturalWidth: 100, naturalHeight: 100 },
    transitionIn,
    transitionOut,
  };
}

describe('TransitionEngine', () => {
  const engine = new TransitionEngine();

  it('returns null when no transitions', () => {
    const layer = createLayer();
    expect(engine.computeLayerState(layer, 0, 5)).toBeNull();
  });

  it('computes fade in transition', () => {
    const layer = createLayer({ type: 'fade', duration: 1, easing: 'linear' });
    expect(engine.computeLayerState(layer, 0, 5)).toEqual({ opacity: 0 });
    expect(engine.computeLayerState(layer, 0.5, 5)).toEqual({ opacity: 0.5 });
    expect(engine.computeLayerState(layer, 1, 5)).toEqual({ opacity: 1 });
    expect(engine.computeLayerState(layer, 2, 5)).toBeNull();
  });

  it('computes fade out transition', () => {
    const layer = createLayer(undefined, { type: 'fade', duration: 1, easing: 'linear' });
    expect(engine.computeLayerState(layer, 0, 5)).toBeNull();
    expect(engine.computeLayerState(layer, 4, 5)).toEqual({ opacity: 1 });
    expect(engine.computeLayerState(layer, 4.5, 5)).toEqual({ opacity: 0.5 });
    expect(engine.computeLayerState(layer, 5, 5)).toEqual({ opacity: 0 });
  });

  it('computes slide-left in transition', () => {
    const layer = createLayer({ type: 'slide-left', duration: 1, easing: 'linear' });
    expect(engine.computeLayerState(layer, 0, 5)).toEqual({ x: 100 });
    expect(engine.computeLayerState(layer, 0.5, 5)).toEqual({ x: 50 });
    expect(engine.computeLayerState(layer, 1, 5)).toEqual({ x: 0 });
  });

  it('computes slide-left out transition', () => {
    const layer = createLayer(undefined, { type: 'slide-left', duration: 1, easing: 'linear' });
    expect(engine.computeLayerState(layer, 4, 5)).toEqual({ x: 0 });
    expect(engine.computeLayerState(layer, 4.5, 5)).toEqual({ x: -50 });
    expect(engine.computeLayerState(layer, 5, 5)).toEqual({ x: -100 });
  });

  it('computes zoom-in in transition', () => {
    const layer = createLayer({ type: 'zoom-in', duration: 1, easing: 'linear' });
    expect(engine.computeLayerState(layer, 0, 5)).toEqual({ scaleX: 0, scaleY: 0 });
    expect(engine.computeLayerState(layer, 0.5, 5)).toEqual({ scaleX: 0.5, scaleY: 0.5 });
    expect(engine.computeLayerState(layer, 1, 5)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it('computes ease-in easing', () => {
    const layer = createLayer({ type: 'fade', duration: 1, easing: 'ease-in' });
    const state = engine.computeLayerState(layer, 0.5, 5);
    expect(state?.opacity).toBe(0.25);
  });

  it('computes ease-out easing', () => {
    const layer = createLayer({ type: 'fade', duration: 1, easing: 'ease-out' });
    const state = engine.computeLayerState(layer, 0.5, 5);
    expect(state?.opacity).toBe(0.75);
  });

  it('handles none transition type', () => {
    const layer = createLayer({ type: 'none', duration: 1, easing: 'linear' });
    expect(engine.computeLayerState(layer, 0.5, 5)).toBeNull();
  });

  it('handles zero duration', () => {
    const layer = createLayer(undefined, { type: 'fade', duration: 1, easing: 'linear' });
    expect(engine.computeLayerState(layer, 0, 0)).toBeNull();
  });

  it('merges in and out when both active', () => {
    const layer = createLayer(
      { type: 'fade', duration: 2, easing: 'linear' },
      { type: 'slide-left', duration: 2, easing: 'linear' }
    );
    // At time 1, only in is active
    expect(engine.computeLayerState(layer, 1, 5)).toEqual({ opacity: 0.5 });
    // At time 4, only out is active
    expect(engine.computeLayerState(layer, 4, 5)).toEqual({ x: -50 });
  });
});
