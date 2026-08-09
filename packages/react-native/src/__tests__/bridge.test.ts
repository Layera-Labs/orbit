import { describe, expect, it } from 'vitest';
import { createStore } from '@layera-labs/model';
import { createHostBridge } from '../host-bridge';
import { createOrbitClient } from '../client';
import { memoryTransportPair } from '../transport';
import { decode, encode, isOrbitMessage } from '../protocol';

/** Wire a real store + host bridge to a client over an in-memory transport. */
function wire() {
  const [clientT, hostT] = memoryTransportPair();
  const store = createStore({ width: 200, height: 200 });
  const stopHost = createHostBridge(store, hostT, {
    exporters: { svg: (s) => `<svg data-count="${s.activePage.children.length}"></svg>` },
  });
  const client = createOrbitClient(clientT);
  return { store, client, dispose: () => { stopHost(); client.dispose(); } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('protocol', () => {
  it('encodes/decodes envelopes and rejects junk', () => {
    const msg = { kind: 'orbit:cmd', id: 1, command: { type: 'undo' } } as const;
    expect(isOrbitMessage(msg)).toBe(true);
    expect(decode(encode(msg))).toEqual(msg);
    expect(decode('not json')).toBeNull();
    expect(isOrbitMessage({ kind: 'other' })).toBe(false);
    expect(isOrbitMessage(null)).toBe(false);
  });
});

describe('bridge end-to-end (in-memory transport)', () => {
  it('applies ops on the client and mutates the host store', async () => {
    const { store, client, dispose } = wire();
    await client.applyOps([{ op: 'addElement', element: { type: 'text', text: 'Hi' } }]);
    expect(store.activePage.children).toHaveLength(1);
    const doc = await client.getDocument();
    expect(doc.pages[0].children).toHaveLength(1);
    dispose();
  });

  it('round-trips loadDocument', async () => {
    const { client, dispose } = wire();
    const seed = createStore({ width: 50, height: 50 });
    seed.addElement({ type: 'shape', shape: 'star' });
    const doc = seed.toJSON();
    await client.loadDocument(doc);
    const back = await client.getDocument();
    expect(back.width).toBe(50);
    expect(back.pages[0].children).toHaveLength(1);
    dispose();
  });

  it('streams change events to onChange', async () => {
    const { client, dispose } = wire();
    let calls = 0;
    let lastCount = 0;
    client.onChange((doc) => {
      calls++;
      lastCount = doc.pages[0].children.length;
    });
    await client.applyOps([{ op: 'addElement', element: { type: 'shape', shape: 'rect' } }]);
    await flush();
    expect(calls).toBeGreaterThan(0);
    expect(lastCount).toBe(1);
    dispose();
  });

  it('exports svg and json through the bridge', async () => {
    const { client, dispose } = wire();
    await client.applyOps([{ op: 'addElement', element: { type: 'shape', shape: 'rect' } }]);
    const svg = await client.export('svg');
    expect(svg).toContain('<svg');
    expect(svg).toContain('data-count="1"');
    const json = await client.export('json');
    expect(JSON.parse(json).schemaVersion).toBe(2);
    dispose();
  });

  it('rejects unconfigured raster export', async () => {
    const { client, dispose } = wire();
    await expect(client.export('png')).rejects.toThrow(/not configured/);
    dispose();
  });

  it('drives selection from the client', async () => {
    const { store, client, dispose } = wire();
    const id = store.addElement({ type: 'shape', shape: 'rect' });
    let observed: string[] = [];
    client.onSelectionChange((sel) => { observed = sel; });
    await client.select([id]);
    await flush();
    expect(store.state.selection).toEqual([id]);
    expect(observed).toEqual([id]);
    dispose();
  });
});
