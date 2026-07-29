'use client';

/**
 * Autosave, and whether it is actually working.
 *
 * Every save used to be `void saveProject(...)` — fire and forget, from four
 * places in the video store and one in the still editor. A rejection there is
 * an unhandled promise rejection and nothing else: the user keeps editing, the
 * document is never written, and they find out when they come back tomorrow.
 *
 * That is not a hypothetical. IndexedDB refuses writes on quota, and a video
 * project carries its media, so it is the case most likely to hit. Private
 * browsing and a cleared origin do it too.
 *
 * So saves report. `persistProject` never rejects — a caller in a store action
 * has nowhere to put an error — but it records what happened, and the editor
 * bar shows it. Silence now means saved, rather than meaning nothing.
 */
import { create } from 'zustand';
import { saveProject } from './projects';
import type { ProjectKind } from './schema';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface SaveState {
  status: SaveStatus;
  /** The reason, kept for the UI — the user has to be able to act on it. */
  error?: string;
  /** When the last successful write landed, for "saved" to mean something. */
  at?: number;
}

export const useSaveState = create<SaveState>(() => ({ status: 'idle' }));

interface Row {
  id: string;
  kind: ProjectKind;
  name: string;
  data: unknown;
}

/*
 * Saves are debounced upstream but can still overlap — a slow write and a fast
 * edit. Only the newest may set the final status, or a stale success would
 * paint over a fresh failure and claim everything is fine.
 */
let ticket = 0;

export async function persistProject(row: Row): Promise<void> {
  const mine = ++ticket;
  useSaveState.setState({ status: 'saving' });
  try {
    await saveProject(row as Parameters<typeof saveProject>[0]);
    if (mine === ticket) useSaveState.setState({ status: 'saved', at: Date.now(), error: undefined });
  } catch (err) {
    if (mine !== ticket) return;
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NotAllowedError');
    useSaveState.setState({
      status: 'failed',
      error: quota
        ? 'This browser is out of storage for Orbit. Delete a project or some uploads to free space.'
        : err instanceof Error
          ? err.message
          : String(err),
    });
    // Still worth a console line: the banner is for the user, this is for
    // whoever they send the screenshot to.
    console.error('[orbit] autosave failed:', err);
  }
}
