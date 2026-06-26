import { describe, it, expect, vi } from 'vitest';
import { ViewportController } from '../viewport';

describe('ViewportController', () => {
  it('has default state', () => {
    const vp = new ViewportController();
    const state = vp.getState();
    expect(state.zoom).toBe(100);
  });

  it('sets zoom as percentage', () => {
    const vp = new ViewportController();
    vp.setZoom(150);
    expect(vp.getState().zoom).toBe(150);
  });

  it('clamps zoom to min/max', () => {
    const vp = new ViewportController();
    vp.setZoom(1);
    expect(vp.getState().zoom).toBe(5);
    vp.setZoom(600);
    expect(vp.getState().zoom).toBe(500);
  });

  it('zooms in and out', () => {
    const vp = new ViewportController();
    vp.setZoom(100);
    vp.zoomIn();
    expect(vp.getState().zoom).toBe(105);
    vp.zoomOut();
    expect(vp.getState().zoom).toBe(100);
  });

  it('calculates fit percentage', () => {
    const vp = new ViewportController();
    // 1000x800 canvas in 2000x1200 container = 1.0 scale (max 100%)
    const fit = vp.calculateFit(1000, 800, 2000, 1200);
    expect(fit).toBe(100);

    // 2000x1600 canvas in 1000x600 container = 0.25 scale
    const fit2 = vp.calculateFit(2000, 1600, 1000, 600);
    expect(fit2).toBeLessThan(100);
  });

  it('resets zoom to 100%', () => {
    const vp = new ViewportController();
    vp.setZoom(50);
    vp.resetZoom();
    expect(vp.getState().zoom).toBe(100);
  });

  it('notifies subscribers', () => {
    const vp = new ViewportController();
    const callback = vi.fn();
    const unsub = vp.subscribe(callback);
    vp.setZoom(150);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ zoom: 150 }));
    unsub();
  });
});
