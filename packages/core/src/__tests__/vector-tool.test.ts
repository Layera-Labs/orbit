import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VectorDrawTool } from '../vector-tool';

describe('VectorDrawTool', () => {
  let tool: VectorDrawTool;
  let mockCanvas: any;

  beforeEach(() => {
    tool = new VectorDrawTool();
    mockCanvas = {
      on: vi.fn(),
      off: vi.fn(),
      selection: true,
      getObjects: vi.fn(() => []),
      getPointer: vi.fn(() => ({ x: 100, y: 100 })),
      add: vi.fn(),
      remove: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    tool.setCanvas(mockCanvas);
  });

  it('sets and gets options', () => {
    tool.setOptions({ strokeWidth: 8, color: '#ff0000', simplifyTolerance: 5 });
    const opts = tool.getOptions();
    expect(opts.strokeWidth).toBe(8);
    expect(opts.color).toBe('#ff0000');
    expect(opts.simplifyTolerance).toBe(5);
    expect(opts.opacity).toBe(1);
  });

  it('activates by attaching mouse events and disabling selection', () => {
    tool.activate();
    expect(mockCanvas.on).toHaveBeenCalledWith('mouse:down', expect.any(Function));
    expect(mockCanvas.on).toHaveBeenCalledWith('mouse:move', expect.any(Function));
    expect(mockCanvas.on).toHaveBeenCalledWith('mouse:up', expect.any(Function));
    expect(mockCanvas.selection).toBe(false);
  });

  it('deactivates by removing events and restoring selection', () => {
    tool.deactivate();
    expect(mockCanvas.off).toHaveBeenCalledWith('mouse:down', expect.any(Function));
    expect(mockCanvas.off).toHaveBeenCalledWith('mouse:move', expect.any(Function));
    expect(mockCanvas.off).toHaveBeenCalledWith('mouse:up', expect.any(Function));
    expect(mockCanvas.selection).toBe(true);
  });

  it('starts drawing on mouse down', () => {
    tool.activate();
    const downHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:down')[1];
    downHandler({ e: { pointerType: 'mouse' } });
    expect(mockCanvas.getPointer).toHaveBeenCalled();
  });

  it('completes drawing and calls callback on mouse up', () => {
    const callback = vi.fn();
    tool.onComplete(callback);
    tool.activate();

    const downHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:down')[1];
    const moveHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:move')[1];
    const upHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:up')[1];

    // Draw a simple line
    downHandler({ e: { pointerType: 'mouse' } });
    mockCanvas.getPointer.mockReturnValueOnce({ x: 100, y: 100 });
    moveHandler({ e: { pointerType: 'mouse' } });
    mockCanvas.getPointer.mockReturnValueOnce({ x: 150, y: 150 });
    moveHandler({ e: { pointerType: 'mouse' } });
    upHandler();

    expect(callback).toHaveBeenCalledOnce();
    const pathData = callback.mock.calls[0][0];
    expect(pathData).toMatch(/^M/);
  });

  it('does not call callback for very short strokes (< 2 points)', () => {
    const callback = vi.fn();
    tool.onComplete(callback);
    tool.activate();

    const downHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:down')[1];
    const upHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:up')[1];

    downHandler({ e: { pointerType: 'mouse' } });
    upHandler();

    expect(callback).not.toHaveBeenCalled();
  });

  it('simplifies path based on tolerance', () => {
    tool.setOptions({ simplifyTolerance: 50 });
    const callback = vi.fn();
    tool.onComplete(callback);
    tool.activate();

    const downHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:down')[1];
    const moveHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:move')[1];
    const upHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:up')[1];

    // Draw many close points
    downHandler({ e: { pointerType: 'mouse' } });
    for (let i = 0; i < 20; i++) {
      mockCanvas.getPointer.mockReturnValueOnce({ x: 100 + i * 2, y: 100 });
      moveHandler({ e: { pointerType: 'mouse' } });
    }
    upHandler();

    expect(callback).toHaveBeenCalledOnce();
    const pathData = callback.mock.calls[0][0];
    // With high tolerance, should simplify to very few points
    const segments = pathData.split('L').length;
    expect(segments).toBeLessThan(10);
  });

  it('adjusts tolerance based on average pressure', () => {
    tool.setOptions({ simplifyTolerance: 4, pressureSensitive: true });
    const callback = vi.fn();
    tool.onComplete(callback);
    tool.activate();

    const downHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:down')[1];
    const moveHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:move')[1];
    const upHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:up')[1];

    // Simulate stylus with high pressure
    downHandler({ e: { pointerType: 'pen', pressure: 1.0 } });
    for (let i = 0; i < 10; i++) {
      mockCanvas.getPointer.mockReturnValueOnce({ x: 100 + i * 5, y: 100 });
      moveHandler({ e: { pointerType: 'pen', pressure: 1.0 } });
    }
    upHandler();

    expect(callback).toHaveBeenCalled();
    // High pressure → lower tolerance (1.5 - 1.0 * 0.5 = 1.0 multiplier)
    // So tolerance = 4 * 1.0 = 4 (less simplification)
  });

  it('ignores pressure for mouse events', () => {
    tool.setOptions({ pressureSensitive: true });
    tool.activate();

    const downHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:down')[1];
    downHandler({ e: { pointerType: 'mouse', pressure: 0.9 } });

    const callback = vi.fn();
    tool.onComplete(callback);
    const upHandler = mockCanvas.on.mock.calls.find((c: any[]) => c[0] === 'mouse:up')[1];
    upHandler();
    // Should still work, pressure ignored for mouse
    expect(callback).not.toHaveBeenCalled(); // only 1 point
  });
});
