import { describe, it, expect, vi } from 'vitest';
import { ViewportController } from '../viewport';

describe('ViewportController', () => {
  it('has default state', () => {
    const vp = new ViewportController();
    const state = vp.getState();
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
    expect(state.rotation).toBe(0);
  });

  it('sets zoom', () => {
    const vp = new ViewportController();
    vp.setZoom(2);
    expect(vp.getState().zoom).toBe(2);
  });

  it('clamps zoom to min/max', () => {
    const vp = new ViewportController();
    vp.setZoom(0.01);
    expect(vp.getState().zoom).toBe(0.1);
    vp.setZoom(100);
    expect(vp.getState().zoom).toBe(5);
  });

  it('pans', () => {
    const vp = new ViewportController();
    vp.pan(100, 50);
    expect(vp.getState().panX).toBe(100);
    expect(vp.getState().panY).toBe(50);
  });

  it('centers the canvas at the current zoom', () => {
    const vp = new ViewportController();
    vp.setZoom(0.5);
    vp.centerCanvas(1000, 800, 1600, 1000);
    expect(vp.getState()).toMatchObject({ zoom: 0.5, panX: 550, panY: 300 });
  });

  it('notifies subscribers', () => {
    const vp = new ViewportController();
    const callback = vi.fn();
    const unsub = vp.subscribe(callback);
    vp.setZoom(1.5);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ zoom: 1.5 }));
    unsub();
  });

});
