import { describe, expect, it } from 'vitest';
import { createStore } from '../store';
import { fromPolotnoJSON } from '../from-polotno';
import { migrateSceneGraphToDocument } from '../migrate';

describe('createStore', () => {
  it('initializes with one page and round-trips JSON', () => {
    const store = createStore({ width: 800, height: 600 });
    expect(store.state.doc.pages).toHaveLength(1);
    expect(store.state.doc.width).toBe(800);

    const json = store.toJSON();
    expect(json.schemaVersion).toBe(2);

    const store2 = createStore();
    store2.loadJSON(json);
    expect(store2.toJSON()).toEqual(json);
  });

  it('adds, updates and removes elements', () => {
    const store = createStore();
    const id = store.addElement({ type: 'text', text: 'Hello' });
    expect(store.activePage.children).toHaveLength(1);
    expect(store.state.selection).toEqual([id]);

    store.updateElement(id, { x: 50, y: 75 });
    const el = store.getElement(id)!;
    expect(el.x).toBe(50);
    expect(el.y).toBe(75);

    store.removeElement(id);
    expect(store.activePage.children).toHaveLength(0);
    expect(store.state.selection).toEqual([]);
  });

  it('coalesces a transaction into a single undo step', () => {
    const store = createStore();
    const id = store.addElement({ type: 'shape', shape: 'rect' });

    store.transaction(() => {
      for (let i = 1; i <= 100; i++) store.updateElement(id, { x: i });
    });
    expect(store.getElement(id)!.x).toBe(100);

    store.undo(); // undoes the whole drag in one step
    expect(store.getElement(id)!.x).toBe(0);

    store.redo();
    expect(store.getElement(id)!.x).toBe(100);
  });

  it('undo/redo across add', () => {
    const store = createStore();
    expect(store.canUndo).toBe(false);
    const id = store.addElement({ type: 'text' });
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.getElement(id)).toBeNull();
    expect(store.activePage.children).toHaveLength(0);

    store.redo();
    expect(store.activePage.children).toHaveLength(1);
  });

  it('groups and ungroups elements, preserving absolute positions', () => {
    const store = createStore();
    const a = store.addElement({ type: 'shape', x: 10, y: 10, width: 40, height: 40 });
    const b = store.addElement({ type: 'shape', x: 100, y: 60, width: 40, height: 40 });

    const groupId = store.group([a, b])!;
    expect(groupId).toBeTruthy();
    expect(store.activePage.children).toHaveLength(1);

    const group = store.getElement(groupId)!;
    expect(group.type).toBe('group');
    expect(group.x).toBe(10);
    expect(group.y).toBe(10);
    expect(group.width).toBe(130); // 100+40 - 10

    store.ungroup(groupId);
    expect(store.activePage.children).toHaveLength(2);
    const restoredA = store.getElement(a)!;
    expect(restoredA.x).toBe(10); // back to absolute
    expect(restoredA.y).toBe(10);
  });

  it('reorders z-index', () => {
    const store = createStore();
    const a = store.addElement({ type: 'shape' });
    const b = store.addElement({ type: 'shape' });
    expect(store.activePage.children.map((c) => c.id)).toEqual([a, b]);

    store.sendToBack(b);
    expect(store.activePage.children.map((c) => c.id)).toEqual([b, a]);

    store.bringToFront(b);
    expect(store.activePage.children.map((c) => c.id)).toEqual([a, b]);
  });

  it('applies agentic actions atomically and undoably', () => {
    const store = createStore();
    store.applyAction([
      { op: 'setBackground', background: { type: 'solid', color: '#000000' } },
      { op: 'addElement', element: { type: 'text', text: 'AI' } },
      { op: 'addElement', element: { type: 'shape', shape: 'star' } },
    ]);
    expect(store.activePage.children).toHaveLength(2);
    expect(store.activePage.background).toEqual({ type: 'solid', color: '#000000' });

    store.undo(); // whole action batch reverts in one step
    expect(store.activePage.children).toHaveLength(0);
    expect(store.activePage.background).toEqual({ type: 'solid', color: '#ffffff' });
  });

  it('manages pages', () => {
    const store = createStore();
    const p2 = store.addPage();
    expect(store.state.doc.pages).toHaveLength(2);
    expect(store.state.activePageId).toBe(p2);

    const dup = store.duplicatePage(p2)!;
    expect(store.state.doc.pages).toHaveLength(3);
    expect(dup).not.toBe(p2);

    store.deletePage(dup);
    expect(store.state.doc.pages).toHaveLength(2);
  });
});

describe('migrateSceneGraphToDocument', () => {
  it('migrates a legacy SceneGraph, baking scale into size', () => {
    const doc = migrateSceneGraphToDocument({
      width: 800,
      height: 600,
      background: { type: 'solid', value: '#222222' },
      root: [
        { id: 'a', type: 'text', x: 10, y: 20, width: 100, height: 40, scaleX: 2, scaleY: 1, content: { text: 'Hi', fontSize: 30, color: '#fff' } },
        { id: 'b', type: 'shape', x: 0, y: 0, width: 50, height: 50, content: { shape: 'ellipse', fill: '#0f0' } },
      ],
    });

    expect(doc.width).toBe(800);
    expect(doc.pages[0].background).toEqual({ type: 'solid', color: '#222222' });
    const [text, shape] = doc.pages[0].children;
    expect(text.type).toBe('text');
    expect(text.width).toBe(200); // 100 * scaleX 2
    expect((text as Extract<typeof text, { type: 'text' }>).fill).toBe('#fff');
    expect(shape.type).toBe('shape');

    // loadable
    const store = createStore();
    store.loadJSON(doc);
    expect(store.activePage.children).toHaveLength(2);
  });
});

describe('fromPolotnoJSON', () => {
  it('converts a Polotno template into an editable document', () => {
    const doc = fromPolotnoJSON({
      width: 1080,
      height: 1080,
      pages: [
        {
          background: '#ff0000',
          children: [
            { type: 'text', text: 'Hi', x: 10, y: 20, fontSize: 48, fill: '#fff' },
            { type: 'image', src: 'https://x/y.png', x: 0, y: 0, width: 200, height: 200 },
            { type: 'figure', subType: 'ellipse', fill: '#0f0', x: 5, y: 5 },
          ],
        },
      ],
    });

    expect(doc.pages).toHaveLength(1);
    const [text, image, shape] = doc.pages[0].children;
    expect(text.type).toBe('text');
    expect(image.type).toBe('image');
    expect(shape.type).toBe('shape');
    expect(doc.pages[0].background).toEqual({ type: 'solid', color: '#ff0000' });

    // Loadable into a store
    const store = createStore();
    store.loadJSON(doc);
    expect(store.activePage.children).toHaveLength(3);
  });
});

describe('align & distribute', () => {
  it('aligns the selection to its own bounds (left then right)', () => {
    const store = createStore({ width: 1000, height: 1000 });
    const a = store.addElement({ type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 50 });
    const b = store.addElement({ type: 'shape', shape: 'rect', x: 200, y: 200, width: 40, height: 40 });

    store.alignSelection([a, b], 'left'); // minX = 0
    expect(store.getElement(a)!.x).toBe(0);
    expect(store.getElement(b)!.x).toBe(0);

    store.alignSelection([a, b], 'right'); // maxX = 100
    expect(store.getElement(a)!.x).toBe(0); // 100 - 100
    expect(store.getElement(b)!.x).toBe(60); // 100 - 40
  });

  it('aligns an element to the page center', () => {
    const store = createStore({ width: 1000, height: 1000 });
    const a = store.addElement({ type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100 });
    store.alignToPage([a], 'center-h');
    expect(store.getElement(a)!.x).toBe(450);
    store.alignToPage([a], 'center-v');
    expect(store.getElement(a)!.y).toBe(450);
  });

  it('distributes 3 elements evenly, reverting in one undo step', () => {
    const store = createStore({ width: 1000, height: 1000 });
    const a = store.addElement({ type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 10 });
    const b = store.addElement({ type: 'shape', shape: 'rect', x: 50, y: 0, width: 100, height: 10 });
    const c = store.addElement({ type: 'shape', shape: 'rect', x: 400, y: 0, width: 100, height: 10 });

    store.distribute([a, b, c], 'horizontal'); // span 500, sizes 300, gap 100
    expect(store.getElement(a)!.x).toBe(0);
    expect(store.getElement(b)!.x).toBe(200);
    expect(store.getElement(c)!.x).toBe(400);

    store.undo(); // whole distribute reverts at once
    expect(store.getElement(b)!.x).toBe(50);
  });

  it('is a no-op for align with <2 and distribute with <3', () => {
    const store = createStore();
    const a = store.addElement({ type: 'shape', shape: 'rect', x: 5, y: 5 });
    store.alignSelection([a], 'left');
    expect(store.getElement(a)!.x).toBe(5);
    store.distribute([a], 'horizontal');
    expect(store.getElement(a)!.x).toBe(5);
  });
});
