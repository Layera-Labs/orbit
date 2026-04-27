import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PathEditor } from '../path-editor';

describe('PathEditor', () => {
  let editor: PathEditor;
  let mockCanvas: any;
  let mockPath: any;

  beforeEach(() => {
    editor = new PathEditor();
    mockCanvas = {
      add: vi.fn(),
      remove: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    mockPath = {
      path: [
        ['M', 10, 10],
        ['L', 50, 50],
        ['L', 100, 20],
      ],
      set: vi.fn(),
      setCoords: vi.fn(),
    };
    editor.setCanvas(mockCanvas);
  });

  it('starts editing and creates node handles', () => {
    editor.startEditing(mockPath);
    expect(mockCanvas.add).toHaveBeenCalledTimes(3);
    expect(editor.isActive()).toBe(true);
  });

  it('stops editing and removes handles', () => {
    editor.startEditing(mockPath);
    editor.stopEditing();
    expect(mockCanvas.remove).toHaveBeenCalledTimes(3);
    expect(editor.isActive()).toBe(false);
  });

  it('parses path data correctly', () => {
    editor.startEditing(mockPath);
    expect(mockCanvas.add).toHaveBeenCalledTimes(3);
  });

  it('updates path when handle moves', () => {
    const callback = vi.fn();
    editor.onChange(callback);
    editor.startEditing(mockPath);

    // Simulate the 'modified' event on first handle
    const firstCall = mockCanvas.add.mock.calls[0];
    const handle = firstCall[0];

    // Move handle
    handle.left = 20;
    handle.top = 20;
    handle.fire('modified');

    expect(mockPath.set).toHaveBeenCalled();
    expect(callback).toHaveBeenCalled();
  });

  it('builds correct SVG path data', () => {
    const callback = vi.fn();
    editor.onChange(callback);
    editor.startEditing(mockPath);

    const firstCall = mockCanvas.add.mock.calls[0];
    const handle = firstCall[0];
    handle.fire('modified');

    const pathData = callback.mock.calls[0][0];
    expect(pathData).toMatch(/^M\s+\d+\s+\d+(\s+L\s+\d+\s+\d+)*$/);
  });

  it('adds a new node', () => {
    editor.startEditing(mockPath);
    editor.addNodeAt(75, 75);
    expect(mockCanvas.add).toHaveBeenCalledTimes(4); // 3 original + 1 new
  });

  it('removes selected node', () => {
    editor.startEditing(mockPath);

    // Select first handle
    const firstHandle = mockCanvas.add.mock.calls[0][0];
    firstHandle.fire('selected');

    editor.removeSelectedNode();
    expect(mockCanvas.remove).toHaveBeenCalledWith(firstHandle);
  });

  it('does not remove node if only 2 remain', () => {
    // Start with 3 nodes, remove one → 2 left
    editor.startEditing(mockPath);
    const firstHandle = mockCanvas.add.mock.calls[0][0];
    firstHandle.fire('selected');
    editor.removeSelectedNode();

    // Try removing again (only 2 left)
    const remainingHandle = mockCanvas.add.mock.calls[1][0];
    remainingHandle.fire('selected');
    mockCanvas.remove.mockClear();
    editor.removeSelectedNode();
    expect(mockCanvas.remove).not.toHaveBeenCalled();
  });

  it('does not remove if no handle selected', () => {
    editor.startEditing(mockPath);
    mockCanvas.remove.mockClear();
    editor.removeSelectedNode();
    expect(mockCanvas.remove).not.toHaveBeenCalled();
  });

  it('ignores invalid path segments during parse', () => {
    const invalidPath = {
      path: [
        ['M', 10, 10],
        'invalid-segment',
        ['L', 50, 50],
      ],
      set: vi.fn(),
      setCoords: vi.fn(),
    };
    editor.startEditing(invalidPath);
    expect(mockCanvas.add).toHaveBeenCalledTimes(2);
  });
});
