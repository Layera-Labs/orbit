/**
 * ExportJobPoller — Polls export job status via SSE with fallback to polling
 */

import type { ExportJob } from '@layera-labs/shared';

export type JobStatusCallback = (job: ExportJob) => void;
export type JobErrorCallback = (error: Error) => void;

export class ExportJobPoller {
  private eventSource: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;
  private onStatus: JobStatusCallback;
  private onError: JobErrorCallback;

  constructor(onStatus: JobStatusCallback, onError: JobErrorCallback) {
    this.onStatus = onStatus;
    this.onError = onError;
  }

  start(eventsUrl: string, statusUrl: string): void {
    this.stop();

    // Try SSE first
    try {
      this.eventSource = new EventSource(eventsUrl);

      this.eventSource.onmessage = (e) => {
        try {
          const job = JSON.parse(e.data) as ExportJob;
          this.onStatus(job);
          if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
            this.stop();
          }
        } catch (err) {
          // ignore parse errors
        }
      };

      this.eventSource.onerror = () => {
        // SSE failed, fall back to polling
        this.eventSource?.close();
        this.eventSource = null;
        this.startPolling(statusUrl);
      };
    } catch {
      // SSE not supported, fall back to polling
      this.startPolling(statusUrl);
    }
  }

  private startPolling(statusUrl: string): void {
    this.pollTimer = setInterval(async () => {
      try {
        const response = await fetch(statusUrl);
        if (!response.ok) throw new Error(`Poll failed: ${response.statusText}`);
        const job = (await response.json()) as ExportJob;
        this.onStatus(job);
        if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
          this.stop();
        }
      } catch (err) {
        this.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }, 2000);
  }

  stop(): void {
    this.eventSource?.close();
    this.eventSource = null;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }
}
