import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DrawController } from '../draw-tool';

const mockCtx = {
  clearRect: vi.fn(),
  globalAlpha: 1,
  lineCap: '',
  lineJoin: '',
  strokeStyle: '',
  globalCompositeOperation: '',
  lineWidth: 0,
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
};

describe('DrawController', () => {
  let controller: DrawController;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => {
      if (type === '2d') return mockCtx as any;
      return null;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,test');

    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    controller = new DrawController();
    controller.init(container);
  });

  afterEach(() => {
    controller.destroy();
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('creates overlay canvas on init', () => {
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas!.style.position).toBe('absolute');
    expect(canvas!.style.zIndex).toBe('10');
  });

  it('removes canvas on destroy', () => {
    controller.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('resizes canvas', () => {
    controller.resize(1920, 1080);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
  });

  it('sets and gets options', () => {
    controller.setOptions({ strokeWidth: 10, color: '#ff0000', mode: 'highlighter' });
    const opts = controller.getOptions();
    expect(opts.strokeWidth).toBe(10);
    expect(opts.color).toBe('#ff0000');
    expect(opts.mode).toBe('highlighter');
    expect(opts.opacity).toBe(1); // unchanged default
  });

  it('activates and deactivates pointer events', () => {
    const canvas = container.querySelector('canvas')!;
    controller.activate();
    expect(canvas.style.pointerEvents).toBe('auto');
    expect(canvas.style.cursor).toBe('crosshair');
    controller.deactivate();
    expect(canvas.style.pointerEvents).toBe('none');
    expect(canvas.style.cursor).toBe('default');
  });

  it('clears canvas', () => {
    controller.clear();
    expect(mockCtx.clearRect).toHaveBeenCalledWith(
      0, 0,
      expect.any(Number), expect.any(Number)
    );
  });

  it('calls onComplete with data URL after pointer up', () => {
    const callback = vi.fn();
    controller.onComplete(callback);
    controller.activate();

    const canvas = container.querySelector('canvas')!;
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);

    // Simulate draw
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pressure: 0.5 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 110, clientY: 110, pressure: 0.5 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 110, clientY: 110 }));

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0]).toMatch(/^data:image\/png;/);
  });

  it('uses pressure-sensitive stroke width with stylus', () => {
    controller.setOptions({ strokeWidth: 10, pressureSensitive: true });
    controller.activate();

    const canvas = container.querySelector('canvas')!;
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);

    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, pressure: 1, pointerType: 'pen',
    }));

    // pressure 1.0 → strokeWidth * (0.2 + 1.0 * 0.8) = 10 * 1.0 = 10
    expect(mockCtx.lineWidth).toBe(10);
  });

  it('ignores pressure for mouse input', () => {
    controller.setOptions({ strokeWidth: 10, pressureSensitive: true });
    controller.activate();

    const canvas = container.querySelector('canvas')!;
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);

    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, pressure: 0.2, pointerType: 'mouse',
    }));

    expect(mockCtx.lineWidth).toBe(10); // ignores pressure, uses default
  });

  it('uses multiply composite operation for highlighter mode', () => {
    controller.setOptions({ mode: 'highlighter' });
    controller.activate();

    const canvas = container.querySelector('canvas')!;
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);

    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100 }));

    expect(mockCtx.globalCompositeOperation).toBe('multiply');
  });
});
