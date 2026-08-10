'use client';

/**
 * Video editor state.
 *
 * The timeline mutations themselves live in `@layera-labs/video` — they are
 * pure `VideoProject → VideoProject` functions and belong with the model they
 * edit, so a second client cannot reinvent them slightly differently. What is
 * genuinely this app's stays here: the undo stack, the autosave, and the id
 * generator the package refuses to own.
 *
 * `apply` is the single write path: it runs an op, pushes history, and persists.
 */
import { create } from 'zustand';
import * as ops from '@layera-labs/video/browser';
import {
  projectDuration,
  type IdFactory,
  type VideoProject,
} from '@layera-labs/video/browser';
import { newId } from '@/db/idb';
import { persistProject } from '@/db/persist';

const HISTORY_LIMIT = 60;

interface VideoState {
  projectId: string | null;
  name: string;
  project: VideoProject | null;
  selection: string | null;
  past: VideoProject[];
  future: VideoProject[];

  load(id: string, name: string, project: VideoProject): void;
  /** Keep the name the next `apply` will persist in step with a rename. */
  setName(name: string): void;
  apply(op: (p: VideoProject) => VideoProject): void;
  /**
   * Update the document with NO history entry and NO write to disk.
   *
   * For the frames of a continuous gesture — dragging a caption across the
   * canvas is sixty of these a second, and `apply` would push sixty history
   * entries and sixty IndexedDB writes for one movement. Pair it with `commit`,
   * which turns the whole run into a single undoable step.
   */
  stage(op: (p: VideoProject) => VideoProject): void;
  /** End a staged run: `before` becomes the one state undo returns to. */
  commit(before: VideoProject): void;
  select(id: string | null): void;
  undo(): void;
  redo(): void;
}

export const useVideo = create<VideoState>((set, get) => ({
  projectId: null,
  name: '',
  project: null,
  selection: null,
  past: [],
  future: [],

  load: (id, name, project) =>
    set({ projectId: id, name, project, selection: null, past: [], future: [] }),

  setName: (name) => set({ name }),

  apply: (op) => {
    const { project, projectId, name, past } = get();
    if (!project) return;
    const next = op(project);
    // Bail by identity so a no-op edit does not push history or hit the disk.
    if (next === project) return;
    set({
      project: next,
      past: [...past, project].slice(-HISTORY_LIMIT),
      future: [],
    });
    if (projectId) void persistProject({ id: projectId, kind: 'video', name, data: next });
  },

  stage: (op) => {
    const { project } = get();
    if (!project) return;
    const next = op(project);
    if (next !== project) set({ project: next });
  },

  commit: (before) => {
    const { project, projectId, name, past } = get();
    // Nothing moved — a click that happened to be a one-pixel drag should not
    // put a step in the history someone then has to undo.
    if (!project || project === before) return;
    set({ past: [...past, before].slice(-HISTORY_LIMIT), future: [] });
    if (projectId) void persistProject({ id: projectId, kind: 'video', name, data: project });
  },

  select: (id) => set({ selection: id }),

  undo: () => {
    const { past, future, project, projectId, name } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
    if (projectId) void persistProject({ id: projectId, kind: 'video', name, data: prev });
  },

  redo: () => {
    const { past, future, project, projectId, name } = get();
    if (!future.length || !project) return;
    const next = future[0];
    set({ project: next, past: [...past, project!], future: future.slice(1) });
    if (projectId) void persistProject({ id: projectId, kind: 'video', name, data: next });
  },
}));

/* ------------------------------------------------------------------ ops --- */

/*
 * The editing operations now live in `@layera-labs/video` — see `edit.ts` there
 * for why. What stays here is the part that is genuinely this app's: the undo
 * stack, the autosave, and the id generator.
 *
 * Re-exported under their original names so every call site reads unchanged,
 * and so there is still exactly ONE place this app imports an edit from.
 */
export {
  addOverlay,
  byStart,
  findClip,
  findOverlay,
  findTextOverlay,
  mainTrack,
  moveClip,
  nextOverlayLayer,
  overlayLabel,
  patchClip,
  removeClip,
  removeOverlay,
  removeTrackGap,
  reorderClip,
  rippleDeleteClip,
  rippleDeleteOverlay,
  setClipRect,
  setClipTrack,
  setClipTransform,
  setElementAnim,
  setFrame,
  setTransition,
  trimClip,
  updateOverlay,
} from '@layera-labs/video/browser';

/**
 * Bind this app's id generator to the seven ops that mint one.
 *
 * The package refuses to invent ids — nothing in it reads a clock or a random
 * source, because a render is meant to be reproducible. The variadic tuple
 * keeps each wrapped signature exactly as it was, so callers pass what they
 * always passed and the `IdFactory` never appears at a call site.
 */
const withIds =
  <A extends unknown[], R>(fn: (...args: [...A, IdFactory]) => R) =>
  (...args: A): R =>
    fn(...args, newId);

export const appendVisual = withIds(ops.appendVisual);
export const appendAudio = withIds(ops.appendAudio);
export const splitAt = withIds(ops.splitAt);
export const addOverlayClip = withIds(ops.addOverlayClip);
export const addVisualTrack = withIds(ops.addVisualTrack);
export const duplicateClip = withIds(ops.duplicateClip);
export const duplicateOverlay = withIds(ops.duplicateOverlay);

export const totalDuration = projectDuration;
