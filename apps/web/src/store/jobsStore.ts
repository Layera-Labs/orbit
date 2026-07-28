'use client';

/**
 * Generation jobs.
 *
 * In the store rather than in the panel because the panel is now a dock you can
 * close: a job that lived in component state would be aborted by switching to
 * Uploads, and the credits are already spent server-side by then. The request
 * outlives the UI that started it.
 */
import { create } from 'zustand';
import { importRemote } from '@/db/media';
import { COST, credits, GenError, generateImage, generateVideo, speak } from '@/net/genClient';

export type GenMode = 'image' | 'video' | 'speech';

export interface Job {
  id: string;
  mode: GenMode;
  prompt: string;
  cost: number;
  startedAt: number;
  controller: AbortController;
  status: 'running' | 'error';
  error?: string;
}

export const MODES: {
  key: GenMode;
  label: string;
  cost: number;
  placeholder: string;
  /** Honest range copy. The service reports no progress, so a bar would lie. */
  expect: string;
}[] = [
  {
    key: 'image',
    label: 'Still',
    cost: COST.image,
    placeholder: 'A rain-soaked street at dusk, shot on 35mm, shallow depth of field…',
    expect: 'usually 10–40s',
  },
  {
    key: 'video',
    label: 'Motion',
    cost: COST.video,
    placeholder: 'Slow push through morning fog over still water…',
    expect: 'usually 60–180s',
  },
  {
    key: 'speech',
    label: 'Speech',
    cost: COST.tts,
    placeholder: 'The words you want spoken aloud.',
    expect: 'usually 5–20s',
  },
];

interface JobsState {
  jobs: Job[];
  balance: number | null;
  notice: string | null;
  /** Bumped whenever a generation lands, so media lists can re-read. */
  completedAt: number;

  run(mode: GenMode, prompt: string): Promise<void>;
  cancel(id: string): void;
  dismiss(id: string): void;
  refreshBalance(): void;
  clearNotice(): void;
}

export const useJobs = create<JobsState>((set, get) => ({
  jobs: [],
  balance: null,
  notice: null,
  completedAt: 0,

  run: async (mode, prompt) => {
    const text = prompt.trim();
    if (!text) return;
    const controller = new AbortController();
    const job: Job = {
      id: `job_${Date.now()}`,
      mode,
      prompt: text,
      cost: MODES.find((m) => m.key === mode)!.cost,
      startedAt: Date.now(),
      controller,
      status: 'running',
    };
    set({ jobs: [job, ...get().jobs], notice: null });

    try {
      const result =
        mode === 'image'
          ? await generateImage({ prompt: text }, controller.signal)
          : mode === 'video'
            ? await generateVideo({ prompt: text }, controller.signal)
            : await speak({ text }, controller.signal);

      // Pull the asset local immediately: the service serves generated files from
      // a temp dir it evicts, and a cross-origin URL would taint any canvas we
      // later draw it into — which would silently kill every thumbnail.
      await importRemote(result.url, {
        origin: 'ai',
        prompt: text,
        name: `${mode}-${Date.now()}`,
      });
      if (result.audioUrl)
        await importRemote(result.audioUrl, { origin: 'ai', prompt: `${text} (audio)` });

      set({
        jobs: get().jobs.filter((j) => j.id !== job.id),
        balance: result.balance ?? get().balance,
        completedAt: Date.now(),
      });
    } catch (err) {
      if (err instanceof GenError && err.kind === 'cancelled') {
        set({ jobs: get().jobs.filter((j) => j.id !== job.id) });
        return;
      }
      const message =
        err instanceof GenError ? err.message : `Generation failed: ${(err as Error).message}`;
      set({
        jobs: get().jobs.map((j) =>
          j.id === job.id ? { ...j, status: 'error' as const, error: message } : j,
        ),
        notice:
          err instanceof GenError && err.kind === 'not-configured'
            ? 'This render service has no generation provider configured. Set RUNWAY_API_TOKEN (stills and motion) or ELEVENLABS_API_KEY (speech) and restart it.'
            : get().notice,
      });
    }
  },

  cancel: (id) => {
    get().jobs.find((j) => j.id === id)?.controller.abort();
  },
  dismiss: (id) => set({ jobs: get().jobs.filter((j) => j.id !== id) }),
  refreshBalance: () => {
    // 404 when auth is off — `credits()` already maps that to null, which means
    // "no accounting here", not an error to surface.
    void credits().then((balance) => set({ balance }));
  },
  clearNotice: () => set({ notice: null }),
}));
