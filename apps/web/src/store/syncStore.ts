'use client';

/**
 * When sync runs, and what it last did.
 *
 * Sync is a background thing that must never block an edit, so this owns the
 * scheduling rather than any component: a save asks for a sync "soon" and gets
 * coalesced, and only one pass is ever in flight — two overlapping passes would
 * race on the watermark and could push the same project twice.
 */
import { create } from 'zustand';
import { syncNow, type SyncStatus } from '@/db/sync';

interface SyncState {
  status: SyncStatus;
  /** Run now, unless a pass is already going. */
  run(): Promise<void>;
  /** Run once the edits stop. Repeated calls collapse into one. */
  schedule(): void;
}

/** Long enough that a burst of edits is one sync, short enough to feel current. */
const QUIET_MS = 4000;

let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useSync = create<SyncState>((set) => ({
  status: { state: 'off' },

  run: () => {
    if (inFlight) return inFlight;
    set({ status: { state: 'syncing' } });
    inFlight = syncNow()
      .then((status) => {
        set({ status });
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  schedule: () => {
    clearTimeout(timer);
    timer = setTimeout(() => void useSync.getState().run(), QUIET_MS);
  },
}));
