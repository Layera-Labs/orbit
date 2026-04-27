import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CollaborationManager } from '../collaboration';
import * as Y from 'yjs';

describe('CollaborationManager', () => {
  let manager: CollaborationManager;
  let mockWs: any;

  const config = {
    websocketUrl: 'wss://collab.orbit.ai',
    roomId: 'room-123',
    userId: 'user-456',
    userName: 'Alice',
    userColor: '#3b82f6',
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 0, // CONNECTING
      binaryType: 'arraybuffer',
      onopen: null as any,
      onmessage: null as any,
      onclose: null as any,
      onerror: null as any,
    };

    const MockWebSocket = vi.fn(() => mockWs);
    MockWebSocket.OPEN = 1;
    MockWebSocket.CONNECTING = 0;
    MockWebSocket.CLOSING = 2;
    MockWebSocket.CLOSED = 3;
    vi.stubGlobal('WebSocket', MockWebSocket);

    manager = new CollaborationManager(config);
  });

  afterEach(() => {
    manager.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates WebSocket with room query param', () => {
    manager.connect();
    expect(WebSocket).toHaveBeenCalledWith(
      'wss://collab.orbit.ai?room=room-123'
    );
  });

  it('sends initial sync on open', () => {
    manager.connect();
    mockWs.readyState = 1; // OPEN
    mockWs.onopen();

    expect(mockWs.send).toHaveBeenCalled();
    const sent = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sent.type).toBe('sync');
  });

  it('starts heartbeat on open', () => {
    manager.connect();
    mockWs.readyState = 1;
    mockWs.onopen();

    // Fast-forward 5 seconds
    vi.advanceTimersByTime(5000);

    const pings = mockWs.send.mock.calls.filter(
      (c: any[]) => JSON.parse(c[0]).type === 'ping'
    );
    expect(pings.length).toBeGreaterThanOrEqual(1);
  });

  it('reconnects on close after 3 seconds', () => {
    manager.connect();
    mockWs.readyState = 1;
    mockWs.onopen();

    mockWs.onclose();
    expect(manager.isConnected()).toBe(false);

    vi.advanceTimersByTime(3000);
    expect(WebSocket).toHaveBeenCalledTimes(2);
  });

  it('handles sync messages', () => {
    const onSync = vi.fn();
    manager.onSync(onSync);
    manager.connect();

    const ydoc = new Y.Doc();
    const update = Array.from(Y.encodeStateAsUpdate(ydoc));
    mockWs.onmessage({
      data: JSON.stringify({ type: 'sync', data: update }),
    });

    expect(onSync).toHaveBeenCalled();
  });

  it('handles cursor messages', () => {
    const onPeersChange = vi.fn();
    manager.onPeersChange(onPeersChange);
    manager.connect();

    mockWs.onmessage({
      data: JSON.stringify({
        type: 'cursor',
        data: {
          userId: 'user-789',
          userName: 'Bob',
          userColor: '#ff0000',
          x: 100,
          y: 200,
          timestamp: Date.now(),
        },
      }),
    });

    const peers = onPeersChange.mock.calls[0][0];
    expect(peers).toHaveLength(1);
    expect(peers[0].userName).toBe('Bob');
  });

  it('handles leave messages', () => {
    const onPeersChange = vi.fn();
    manager.onPeersChange(onPeersChange);
    manager.connect();

    // Add peer first
    mockWs.onmessage({
      data: JSON.stringify({
        type: 'cursor',
        data: { userId: 'user-789', userName: 'Bob', userColor: '#ff0000', x: 0, y: 0, timestamp: Date.now() },
      }),
    });

    // Then remove
    mockWs.onmessage({
      data: JSON.stringify({ type: 'leave', userId: 'user-789' }),
    });

    const peers = onPeersChange.mock.calls[1][0];
    expect(peers).toHaveLength(0);
  });

  it('sends cursor position', () => {
    manager.connect();
    mockWs.readyState = 1;
    mockWs.onopen();

    manager.updateCursor(150, 250);

    const sent = JSON.parse(mockWs.send.mock.calls.find(
      (c: any[]) => JSON.parse(c[0]).type === 'cursor'
    )[0]);
    expect(sent.type).toBe('cursor');
    expect(sent.data.x).toBe(150);
    expect(sent.data.y).toBe(250);
  });

  it('does not send cursor when disconnected', () => {
    manager.updateCursor(100, 100);
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it('disconnects cleanly', () => {
    manager.connect();
    mockWs.readyState = 1;
    mockWs.onopen();

    manager.disconnect();
    expect(mockWs.close).toHaveBeenCalled();
    expect(manager.isConnected()).toBe(false);
    expect(manager.getPeers()).toHaveLength(0);
  });

  it('sends leave message on disconnect', () => {
    manager.connect();
    mockWs.readyState = 1;
    mockWs.onopen();

    manager.disconnect();
    const leaveCall = mockWs.send.mock.calls.find(
      (c: any[]) => JSON.parse(c[0]).type === 'leave'
    );
    expect(leaveCall).toBeDefined();
  });

  it('ignores non-JSON messages', () => {
    manager.connect();
    const onSync = vi.fn();
    manager.onSync(onSync);

    mockWs.onmessage({ data: 'not-json' });
    expect(onSync).not.toHaveBeenCalled();
  });

  it('does not double-connect', () => {
    manager.connect();
    manager.connect();
    expect(WebSocket).toHaveBeenCalledTimes(1);
  });

  it('exposes Y.Doc', () => {
    const ydoc = manager.getYDoc();
    expect(ydoc).toBeDefined();
    expect(ydoc.store).toBeDefined();
  });
});
