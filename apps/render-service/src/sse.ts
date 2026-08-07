import type { Response } from "express";

/**
 * Server-sent events, with the three things that actually make one survive.
 *
 * SSE is a trivial wire format — `data: <line>\n\n` — and almost all of the
 * difficulty is in what sits between the two ends.
 *
 * `X-Accel-Buffering: no` is the one that is invisible until it is not. nginx
 * buffers a proxied response by default, so every event is held until the
 * buffer fills or the stream ends: the client sees NOTHING for the whole
 * render and then everything at once, which reads as "SSE does not work here"
 * rather than as a proxy setting. This service is deployed behind aaPanel's
 * nginx, so it is not hypothetical.
 *
 * Compression is disabled for the same reason — a compressor holds bytes back
 * waiting for a block to be worth emitting, which is exactly wrong for a stream
 * of 80-byte messages.
 *
 * And a heartbeat, because an idle connection is a connection something in the
 * middle will close. A render can spend minutes between progress reports; a
 * comment line costs two bytes and keeps every timeout in the path from firing.
 */

/** Comment lines. Ignored by `EventSource`, invisible to `onmessage`. */
const HEARTBEAT = ": ping\n\n";

export interface SseStream {
  /** Send one event. Returns false once the client has gone. */
  send(data: unknown): boolean;
  /** Finish normally. */
  close(): void;
  /** Run when the client disconnects. */
  onClose(fn: () => void): void;
}

export function openSse(res: Response, heartbeatMs = 20_000): SseStream {
  let open = true;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  /*
   * Something has to reach the client immediately. Browsers do not resolve the
   * EventSource connection until the first byte arrives, and a proxy is far
   * more likely to hold an empty response open than one that has started.
   */
  res.write(HEARTBEAT);
  res.flushHeaders?.();

  const beat = setInterval(() => {
    if (open) res.write(HEARTBEAT);
  }, heartbeatMs);
  // An interval on a stream nobody is reading must not hold the process open.
  beat.unref?.();

  const closers: (() => void)[] = [];
  const shutdown = () => {
    if (!open) return;
    open = false;
    clearInterval(beat);
    for (const fn of closers) fn();
  };
  // The client navigating away, closing the tab, or calling `.close()`.
  res.on("close", shutdown);

  return {
    send(data: unknown): boolean {
      if (!open) return false;
      /*
       * A newline inside the payload would end the event early and split it
       * across two messages, which the client then fails to parse. JSON escapes
       * them, so this is safe for objects — but it is the reason the payload is
       * always serialised here rather than accepting a pre-formatted string.
       */
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    },
    close(): void {
      if (!open) return;
      shutdown();
      res.end();
    },
    onClose(fn: () => void): void {
      if (!open) fn();
      else closers.push(fn);
    },
  };
}
