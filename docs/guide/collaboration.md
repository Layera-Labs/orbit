# Collaboration

> **This page documents v1.** It is accurate: v1 is published, feature-complete
> and in maintenance, and the APIs below are the ones it ships. What it is not
> is the current SDK — new work goes into v2 (`@layera-labs/orbit-model`,
> `-render`, `-providers`, `-editor`), which has a different architecture and a
> different API. Start at [installation](./installation.md) if you are choosing.

Orbit supports real-time multi-user editing via Yjs CRDTs and WebSocket sync.

## Setup

Enable collaboration in the engine config:

```ts
const engine = new OrbitEngine({
  width: 1080,
  height: 1080,
  collaboration: {
    roomId: 'design-123',
    userId: 'user-456',
    userName: 'Alice',
    userColor: '#3b82f6',
    websocketUrl: 'wss://collab.orbit.ai',
  },
});
```

## Features

### Real-Time Sync

All layer operations (add, remove, update, reorder) sync across connected clients within milliseconds.

### Cursor Presence

Each user sees others' cursors as colored dots with name labels. Cursors update in real-time as users move their mice over the canvas.

### Conflict Resolution

Yjs CRDTs guarantee eventual consistency. Simultaneous edits by multiple users merge automatically without data loss.

### Offline Support

Edits made while offline are queued and synchronized once the connection is restored.

### Auto-Reconnect

The `CollaborationManager` automatically reconnects with exponential backoff if the WebSocket drops. A 5-second heartbeat keeps the connection alive.

## Cursor API

```ts
// Send your cursor position
engine.renderer.setPeerCursor(userId, { x, y }, userName, userColor);

// Listen to peer cursor updates
engine.on('peerCursor', ({ userId, x, y, name, color }) => {
  // Update UI
});
```

## WebSocket Protocol

Messages are JSON-encoded:

```ts
interface SyncMessage {
  type: 'sync' | 'cursor' | 'ping' | 'leave';
  data: any;
}
```

- `sync`: Yjs state vector or update
- `cursor`: `{ userId, x, y, name, color }`
- `ping`: Heartbeat every 5 seconds
- `leave`: User disconnected

## Stale Cursor Cleanup

Cursors for disconnected users are removed after 30 seconds of inactivity.

## Security

- WebSocket connections require a valid JWT token
- Room access is controlled by your backend
- All sync data is end-to-end encrypted via TLS

## Limitations

- Video/audio playback is not synchronized across users (each client plays independently)
- Export operations are local-only
- Maximum 50 concurrent users per room recommended

## Building Your Own Backend

You can implement your own WebSocket server:

1. Accept Yjs `update` messages and broadcast to room members
2. Store Yjs document state in your database
3. Authenticate connections via JWT

The `CollaborationManager` is backend-agnostic — it only requires a WebSocket that speaks the simple JSON protocol above.
