/**
 * Host side of the bridge — runs inside the WebView next to the live editor.
 * Connects an `OrbitStore` to a transport so a remote client (React Native) can
 * drive it (apply ops, export, undo…) and observe it (change/selection/history).
 */
import type { OrbitStore } from '@orbit/model';
import {
  ORBIT_BRIDGE_PROTOCOL,
  decode,
  encode,
  type OrbitCommand,
  type OrbitEvent,
  type OrbitExportOptions,
} from './protocol';
import type { Transport } from './transport';

export interface HostExporters {
  /** Headless SVG export. Wire to `exportPageToSVG(store.activePage)` from `@orbit/render`. */
  svg?: (store: OrbitStore) => string;
  /** Raster export (png/jpeg) using the live Konva stage. */
  raster?: (
    format: 'png' | 'jpeg',
    options?: OrbitExportOptions,
  ) => Promise<string> | string;
}

export interface HostBridgeOptions {
  exporters?: HostExporters;
}

/** Connect a store to a transport. Returns a disposer that detaches everything. */
export function createHostBridge(
  store: OrbitStore,
  transport: Transport,
  opts: HostBridgeOptions = {},
): () => void {
  const emit = (event: OrbitEvent) => transport.post(encode({ kind: 'orbit:evt', event }));

  const reply = (id: number, run: () => unknown) => {
    Promise.resolve()
      .then(run)
      .then((value) => transport.post(encode({ kind: 'orbit:res', id, ok: true, value })))
      .catch((err) =>
        transport.post(
          encode({
            kind: 'orbit:res',
            id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      );
  };

  const handle = (command: OrbitCommand): unknown => {
    switch (command.type) {
      case 'getDocument':
        return store.toJSON();
      case 'loadDocument':
        store.loadJSON(command.doc);
        return undefined;
      case 'applyOps':
        store.applyAction(command.actions);
        return undefined;
      case 'select':
        store.select(command.ids);
        return undefined;
      case 'undo':
        store.undo();
        return undefined;
      case 'redo':
        store.redo();
        return undefined;
      case 'setViewport':
        store.setViewport(command.patch);
        return undefined;
      case 'export': {
        if (command.format === 'json') return JSON.stringify(store.toJSON());
        if (command.format === 'svg') {
          if (!opts.exporters?.svg) throw new Error('SVG export is not configured on the host');
          return opts.exporters.svg(store);
        }
        if (!opts.exporters?.raster) {
          throw new Error(`${command.format} export is not configured on the host`);
        }
        return opts.exporters.raster(command.format, command.options);
      }
    }
  };

  const offMessage = transport.subscribe((raw) => {
    const msg = decode(raw);
    if (!msg || msg.kind !== 'orbit:cmd') return;
    reply(msg.id, () => handle(msg.command));
  });

  const offChange = store.on('change', () => emit({ type: 'change', doc: store.toJSON() }));
  const offSelection = store.on('selectionChange', () =>
    emit({ type: 'selectionChange', selection: [...store.state.selection] }),
  );
  const offHistory = store.on('historyChange', () =>
    emit({ type: 'historyChange', canUndo: store.canUndo, canRedo: store.canRedo }),
  );

  emit({ type: 'ready', protocol: ORBIT_BRIDGE_PROTOCOL });

  return () => {
    offMessage();
    offChange();
    offSelection();
    offHistory();
  };
}
