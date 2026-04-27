/**
 * CollaborationManager - Multi-user sync via Yjs CRDTs + WebSocket
 * Simplified: Yjs for document sync, WebSocket JSON for cursor presence
 */

import * as Y from 'yjs';

export interface CollaborationConfig {
  websocketUrl: string;
  roomId: string;
  userId: string;
  userName: string;
  userColor: string;
}

export interface PeerCursor {
  userId: string;
  userName: string;
  userColor: string;
  x: number;
  y: number;
  timestamp: number;
}

export class CollaborationManager {
  private config: CollaborationConfig;
  private ydoc: Y.Doc;
  private ws: WebSocket | null = null;
  private connected = false;
  private onPeersChangeCallback: ((peers: PeerCursor[]) => void) | null = null;
  private onSyncCallback: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private peers: Map<string, PeerCursor> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: CollaborationConfig) {
    this.config = config;
    this.ydoc = new Y.Doc();
  }

  connect(): void {
    if (this.connected || this.ws) return;

    const url = `${this.config.websocketUrl}?room=${encodeURIComponent(this.config.roomId)}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.connected = true;
      // Send initial sync step
      const state = Y.encodeStateAsUpdate(this.ydoc);
      this.send({ type: 'sync', data: Array.from(state) });
      // Start heartbeat
      this.heartbeatInterval = setInterval(() => {
        this.send({ type: 'ping', userId: this.config.userId, timestamp: Date.now() });
      }, 5000);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'sync' && message.data) {
          const update = new Uint8Array(message.data);
          Y.applyUpdate(this.ydoc, update);
          this.onSyncCallback?.();
        }
        if (message.type === 'cursor' && message.data) {
          const cursor = message.data as PeerCursor;
          this.peers.set(cursor.userId, cursor);
          this.onPeersChangeCallback?.(Array.from(this.peers.values()));
        }
        if (message.type === 'leave' && message.userId) {
          this.peers.delete(message.userId);
          this.onPeersChangeCallback?.(Array.from(this.peers.values()));
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };

    // Subscribe to Yjs updates and broadcast
    this.ydoc.on('update', (update: Uint8Array) => {
      if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'sync', data: Array.from(update) });
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'leave', userId: this.config.userId });
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.peers.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  updateCursor(x: number, y: number): void {
    if (!this.connected || !this.ws) return;
    this.send({
      type: 'cursor',
      data: {
        userId: this.config.userId,
        userName: this.config.userName,
        userColor: this.config.userColor,
        x,
        y,
        timestamp: Date.now(),
      },
    });
  }

  getPeers(): PeerCursor[] {
    return Array.from(this.peers.values());
  }

  onPeersChange(callback: (peers: PeerCursor[]) => void): void {
    this.onPeersChangeCallback = callback;
  }

  onSync(callback: () => void): void {
    this.onSyncCallback = callback;
  }

  getYDoc(): Y.Doc {
    return this.ydoc;
  }

  private send(message: Record<string, any>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
