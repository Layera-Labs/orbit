# @orbit/react-native

React Native embedding for the Orbit v2 editor. The editor itself runs as the
web build (`@orbit/editor`) inside a `react-native-webview`; this package is the
**typed bridge** between your RN code and that WebView.

```
┌────────────── React Native ──────────────┐        ┌──────── WebView (web build) ────────┐
│  createOrbitClient(transport)             │  ⇄    │  createHostBridge(store, transport) │
│   .loadDocument / .applyOps / .export …   │ JSON  │   ↳ drives the live OrbitStore      │
│   .onChange / .onSelectionChange …        │       │   ↳ exporters: svg / raster         │
└───────────────────────────────────────────┘        └─────────────────────────────────────┘
```

The bridge is transport-agnostic and fully unit-tested over an in-memory
transport (see `src/__tests__/bridge.test.ts`). Production uses two transports:
`createNativeTransport` (RN side) and `createWebViewHostTransport` (web side).

## Status

- ✅ **Bridge core** — protocol, host bridge, client, transports — implemented and tested headlessly.
- ⏳ **Integration glue** below (the `<WebView>` component, the web-build entry, native pickers) is wiring that requires a device/Expo runtime to exercise. Verify on a real mid-range Android per the roadmap.

## 1. Web build entry (runs inside the WebView)

Add an entry to the web build that mounts the editor and attaches the host bridge:

```tsx
import { createRoot } from 'react-dom/client';
import { OrbitEditor } from '@orbit/editor';
import { createStore } from '@orbit/model';
import { exportPageToSVG } from '@orbit/render';
import { createHostBridge, createWebViewHostTransport } from '@orbit/react-native';

const store = createStore({ width: 1080, height: 1080 });

createHostBridge(store, createWebViewHostTransport(), {
  exporters: {
    svg: (s) => exportPageToSVG(s.activePage),
    // raster uses the live Konva stage; expose it from the editor and call stage.toDataURL(...)
    raster: (format, opts) => rasterFromStage(format, opts),
  },
});

createRoot(document.getElementById('root')!).render(
  <OrbitEditor store={store} providers={/* … */} />,
);
```

Bundle this to a single self-contained HTML file (e.g. `vite build` +
`vite-plugin-singlefile`) and ship it as an RN asset so it loads offline.

## 2. RN component

```tsx
import { useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import { WebView } from 'react-native-webview';
import { createNativeTransport, createOrbitClient, type OrbitClient } from '@orbit/react-native';
import html from './orbit-web-build.html'; // the bundle from step 1

export const OrbitEditorView = forwardRef<OrbitClient>((_props, ref) => {
  const webRef = useRef<WebView>(null);
  const transport = useMemo(() => createNativeTransport(() => webRef.current), []);
  const client = useMemo(() => createOrbitClient(transport), [transport]);
  useImperativeHandle(ref, () => client, [client]);

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={(e) => transport.receive(e.nativeEvent.data)}
    />
  );
});
```

Usage:

```tsx
const editor = useRef<OrbitClient>(null);
// …
await editor.current?.applyOps([{ op: 'addElement', element: { type: 'text', text: 'Hi' } }]);
const svg = await editor.current?.export('svg');
editor.current?.onChange((doc) => persist(doc));
```

## 3. Native integrations (host-owned)

Image/video picker, camera, share sheet, and file save are RN concerns — wire
them with Expo modules (`expo-image-picker`, `expo-camera`, `expo-sharing`,
`expo-file-system`) and feed results in as ops, e.g. after picking an image:

```ts
await editor.current?.applyOps([
  { op: 'addElement', element: { type: 'image', src: pickedUri, naturalWidth: w, naturalHeight: h } },
]);
```
