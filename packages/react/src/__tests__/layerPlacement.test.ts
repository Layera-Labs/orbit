import { describe, expect, it } from 'vitest';
import { OrbitEngine } from '@layera-labs/orbit-core';
import {
  createBackgroundLayer,
  createCenteredTextLayer,
  createImageLayer,
  createShapeLayer,
  createVideoLayer,
  getCenteredLayerPosition,
} from '../utils/layerPlacement';

describe('layer placement helpers', () => {
  it('centers arbitrary layer sizes in the scene', () => {
    const engine = new OrbitEngine({ width: 1000, height: 800 });
    expect(getCenteredLayerPosition(engine, 200, 100)).toEqual({ x: 400, y: 350 });
  });

  it('creates centered text, image, video, and shape layers', () => {
    const engine = new OrbitEngine({ width: 1000, height: 800 });

    const text = createCenteredTextLayer(engine, { text: 'Heading', fontSize: 40, width: 320, height: 80 });
    expect(text).toMatchObject({ type: 'text', x: 340, y: 360, width: 320, height: 80 });

    const image = createImageLayer(engine, 'image.png', 2000, 1000);
    expect(image).toMatchObject({ type: 'image', x: 140, y: 220, width: 720, height: 360 });

    const video = createVideoLayer(engine, 'video.mp4', 640, 360, 10);
    expect(video).toMatchObject({ type: 'video', x: 180, y: 220, width: 640, height: 360 });

    const shape = createShapeLayer(engine, { shape: 'rectangle', width: 200, height: 100 });
    expect(shape).toMatchObject({ type: 'shape', x: 400, y: 350, width: 200, height: 100 });
  });

  it('auto-sizes text layers when no explicit size is provided', () => {
    const engine = new OrbitEngine({ width: 1000, height: 800 });

    const text = createCenteredTextLayer(engine, { text: 'Title', fontSize: 48 });

    expect(text.width).toBeLessThan(220);
    expect(text.height).toBeGreaterThanOrEqual(60);
    expect(text.x).toBe((1000 - text.width) / 2);
  });

  it('creates full-artboard background layers', () => {
    const engine = new OrbitEngine({ width: 1200, height: 675 });
    const background = createBackgroundLayer(engine, '#f8fafc');

    expect(background).toMatchObject({
      type: 'shape',
      name: 'Background',
      x: 0,
      y: 0,
      width: 1200,
      height: 675,
    });
    expect(background.content).toMatchObject({ type: 'shape', shape: 'rectangle', fill: '#f8fafc' });
  });
});
