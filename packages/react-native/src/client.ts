/**
 * Client side of the bridge — the typed API React Native code calls. It speaks
 * the protocol over any `Transport`, so it works the same against a real
 * WebView and against an in-memory transport in tests.
 */
import type { CanvasAction, Document, ID, Viewport } from '@layera-labs/model';
import {
  decode,
  encode,
  type OrbitCommand,
  type OrbitCommandResults,
  type OrbitExportFormat,
  type OrbitExportOptions,
} from './protocol';
import type { Transport } from './transport';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface OrbitClient {
  getDocument(): Promise<Document>;
  loadDocument(doc: Document): Promise<void>;
  applyOps(actions: CanvasAction[]): Promise<void>;
  export(format: OrbitExportFormat, options?: OrbitExportOptions): Promise<string>;
  select(ids: ID[]): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  setViewport(patch: Partial<Viewport>): Promise<void>;
  onReady(cb: () => void): () => void;
  onChange(cb: (doc: Document) => void): () => void;
  onSelectionChange(cb: (selection: ID[]) => void): () => void;
  onHistoryChange(cb: (state: { canUndo: boolean; canRedo: boolean }) => void): () => void;
  dispose(): void;
}

export function createOrbitClient(transport: Transport): OrbitClient {
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const listeners = {
    ready: new Set<() => void>(),
    change: new Set<(doc: Document) => void>(),
    selectionChange: new Set<(selection: ID[]) => void>(),
    historyChange: new Set<(state: { canUndo: boolean; canRedo: boolean }) => void>(),
  };

  const off = transport.subscribe((raw) => {
    const msg = decode(raw);
    if (!msg) return;
    if (msg.kind === 'orbit:res') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new Error(msg.error));
      return;
    }
    if (msg.kind === 'orbit:evt') {
      const e = msg.event;
      switch (e.type) {
        case 'ready':
          listeners.ready.forEach((c) => c());
          break;
        case 'change':
          listeners.change.forEach((c) => c(e.doc));
          break;
        case 'selectionChange':
          listeners.selectionChange.forEach((c) => c(e.selection));
          break;
        case 'historyChange':
          listeners.historyChange.forEach((c) => c({ canUndo: e.canUndo, canRedo: e.canRedo }));
          break;
        case 'error':
          break;
      }
    }
  });

  const send = <K extends OrbitCommand['type']>(
    command: Extract<OrbitCommand, { type: K }>,
  ): Promise<OrbitCommandResults[K]> => {
    const id = nextId++;
    return new Promise<OrbitCommandResults[K]>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      transport.post(encode({ kind: 'orbit:cmd', id, command }));
    });
  };

  const sub = <T>(set: Set<T>, cb: T): (() => void) => {
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  };

  return {
    getDocument: () => send({ type: 'getDocument' }),
    loadDocument: (doc) => send({ type: 'loadDocument', doc }),
    applyOps: (actions) => send({ type: 'applyOps', actions }),
    export: (format, options) => send({ type: 'export', format, options }),
    select: (ids) => send({ type: 'select', ids }),
    undo: () => send({ type: 'undo' }),
    redo: () => send({ type: 'redo' }),
    setViewport: (patch) => send({ type: 'setViewport', patch }),
    onReady: (cb) => sub(listeners.ready, cb),
    onChange: (cb) => sub(listeners.change, cb),
    onSelectionChange: (cb) => sub(listeners.selectionChange, cb),
    onHistoryChange: (cb) => sub(listeners.historyChange, cb),
    dispose: () => {
      off();
      pending.clear();
    },
  };
}
