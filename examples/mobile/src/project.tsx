/**
 * The one project the Timeline edits and the Export screen ships.
 *
 * Plain context and `useState` — no store library. There is exactly one piece
 * of shared state in this app, and reaching for Zustand or Redux to hold it
 * would teach the wrong lesson about what Orbit needs.
 *
 * `media` is kept BESIDE the project rather than inside it. Source lengths are
 * something the picker happened to measure, not something a project carries:
 * `VideoProject` has no field for them, and inventing one would mean this
 * example's JSON was no longer a real Orbit project.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { newProject } from './orbit/timeline';
import type { VideoProject } from './orbit/types';

/** Vertical 1080×1920 — what a phone shoots and what a feed wants. */
const START = () => newProject(1080, 1920, 30);

interface Ctx {
  project: VideoProject;
  setProject: (next: VideoProject) => void;
  reset: () => void;
  /** Source length in seconds, by local URI, for the trim clamps. */
  sourceDurationOf: (src: string) => number | undefined;
  rememberDuration: (src: string, seconds: number) => void;
}

const ProjectContext = createContext<Ctx | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<VideoProject>(START);
  const [media, setMedia] = useState<Record<string, number>>({});

  const rememberDuration = useCallback((src: string, seconds: number) => {
    setMedia((m) => (m[src] === seconds ? m : { ...m, [src]: seconds }));
  }, []);

  const sourceDurationOf = useCallback((src: string) => media[src], [media]);

  const reset = useCallback(() => {
    setProject(START());
    setMedia({});
  }, []);

  const value = useMemo(
    () => ({ project, setProject, reset, sourceDurationOf, rememberDuration }),
    [project, reset, sourceDurationOf, rememberDuration],
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): Ctx {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used inside <ProjectProvider>');
  return ctx;
}
