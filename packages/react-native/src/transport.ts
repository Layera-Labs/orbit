/**
 * Transports move serialized bridge messages between the two sides. The bridge
 * is transport-agnostic so it can run over react-native-webview in production
 * and over an in-memory pair in tests / same-process embedding.
 */
export interface Transport {
  /** Send a serialized message to the other side. */
  post(message: string): void;
  /** Register a receiver; returns an unsubscribe function. */
  subscribe(handler: (message: string) => void): () => void;
}

/** A linked pair of in-memory transports — `[clientSide, hostSide]`. */
export function memoryTransportPair(): [Transport, Transport] {
  const aHandlers = new Set<(m: string) => void>();
  const bHandlers = new Set<(m: string) => void>();
  // Deliver on a microtask to mirror the async nature of real postMessage.
  const deliver = (handlers: Set<(m: string) => void>, m: string) =>
    queueMicrotask(() => handlers.forEach((h) => h(m)));
  const a: Transport = {
    post: (m) => deliver(bHandlers, m),
    subscribe: (h) => {
      aHandlers.add(h);
      return () => aHandlers.delete(h);
    },
  };
  const b: Transport = {
    post: (m) => deliver(aHandlers, m),
    subscribe: (h) => {
      bHandlers.add(h);
      return () => bHandlers.delete(h);
    },
  };
  return [a, b];
}

/** The slice of a react-native-webview ref the native transport needs. */
export interface WebViewHandle {
  injectJavaScript(script: string): void;
}

/**
 * RN-side transport over a react-native-webview ref. Wire the WebView's
 * `onMessage` to `transport.receive(e.nativeEvent.data)`.
 */
export interface NativeTransport extends Transport {
  /** Feed an incoming `onMessage` payload into the bridge. */
  receive(data: string): void;
}

export function createNativeTransport(getWebView: () => WebViewHandle | null): NativeTransport {
  const handlers = new Set<(m: string) => void>();
  return {
    post: (m) => {
      // Hand the message to the page's receiver hook (installed host-side).
      const js = `window.__orbitReceive && window.__orbitReceive(${JSON.stringify(m)}); true;`;
      getWebView()?.injectJavaScript(js);
    },
    subscribe: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    receive: (data) => handlers.forEach((h) => h(data)),
  };
}

interface ReactNativeWebViewGlobal {
  postMessage(data: string): void;
}

/**
 * Host-side (WebView) transport. Runs inside the embedded web build: outgoing
 * messages go to RN via `window.ReactNativeWebView.postMessage`; incoming ones
 * arrive through the `window.__orbitReceive` hook the native side injects.
 */
export function createWebViewHostTransport(): Transport {
  const handlers = new Set<(m: string) => void>();
  const g = globalThis as unknown as {
    ReactNativeWebView?: ReactNativeWebViewGlobal;
    __orbitReceive?: (data: string) => void;
  };
  g.__orbitReceive = (data: string) => handlers.forEach((h) => h(data));
  return {
    post: (m) => g.ReactNativeWebView?.postMessage(m),
    subscribe: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
}
