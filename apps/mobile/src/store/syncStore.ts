/**
 * When sync runs on the phone, and what it last did.
 *
 * Scheduling lives here rather than in a screen so an edit can ask for a sync
 * "soon" without knowing or caring whether one is already running. Only one
 * pass is ever in flight: two overlapping passes would race on the watermark
 * and could push the same project twice.
 */
import { create } from 'zustand';
import { syncNow, type SyncStatus } from '../net/syncClient';
import { useEditor } from './editorStore';

interface SyncState {
  status: SyncStatus;
  run: () => Promise<void>;
  schedule: () => void;
}

/** Long enough that a burst of edits is one sync, short enough to feel current. */
const QUIET_MS = 5000;

let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useSync = create<SyncState>((set) => ({
  status: { state: 'off' },

  run: () => {
    if (inFlight) return inFlight;
    set({ status: { state: 'syncing' } });
    inFlight = syncNow(useEditor.getState().serverUrl)
      .then((status) => {
        set({ status });
        // A pull can replace projects on disk; the list on screen has to notice.
        if (status.state === 'ok' && status.pulled + status.conflicts > 0)
          void useEditor.getState().refreshProjects();
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  schedule: () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void useSync.getState().run(), QUIET_MS);
  },
}));

/** Callable from the editor store without importing the store into itself. */
export const scheduleSync = (): void => useSync.getState().schedule();
