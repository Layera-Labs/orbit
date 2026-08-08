/**
 * The one in-flight generation, and the loop watching it.
 *
 * Its own store rather than another wing of `editorStore`, for a reason that is
 * about behaviour and not tidiness: a generation runs for MINUTES on the
 * server, and the screen it was started from is not where the user will spend
 * them. Holding the job here means navigating away, opening a project and
 * coming back finds the same job still being watched — where a `useState` in
 * the screen would abandon it on unmount and leave a paid generation running
 * with nobody to collect it.
 *
 * One job at a time, deliberately. The server takes as many as the account can
 * afford, but a second one started from this screen would have nowhere to be
 * shown, and a list of concurrent generations is a feature nobody has asked
 * for yet. Starting another replaces the one on screen only once it has
 * settled — `busy` is what the button reads.
 */
import { create } from "zustand";
import {
  fetchGeneration,
  isSettled,
  pollDelay,
  startGeneration,
  type GenAspect,
  type GenerationJob,
} from "../net/generateClient";
import { GenError } from "../net/genClient";
import { useEditor } from "./editorStore";

export interface GenerateState {
  /** What the user typed. Kept in the store so a round trip to Profile does not lose it. */
  topic: string;
  notes: string;
  aspect: GenAspect;
  /** The job being watched, or null before the first start. */
  job: GenerationJob | null;
  /** Set while a start request is in flight — the button's disabled state. */
  starting: boolean;
  /** A failure to START, which is not the same as a job that ran and failed. */
  error: { kind: string; message: string } | null;
  /** Wall clock since the job was accepted, in seconds. Drives the elapsed readout. */
  elapsedSec: number;

  setTopic: (topic: string) => void;
  setNotes: (notes: string) => void;
  setAspect: (aspect: GenAspect) => void;
  start: () => Promise<void>;
  /** Watch an already-started job again — what the screen calls on mount. */
  resume: () => void;
  /** Back to an empty form, after a result has been taken somewhere. */
  reset: () => void;
}

/**
 * How many polls in a row may fail before the job is called lost.
 *
 * At the 4s ceiling that is a little over a minute and a half of silence —
 * long enough to ride out a redeploy or a tunnel, short enough that a server
 * which is not coming back stops being watched. The message says the video may
 * still be there, because it very well might: the job outlives this app.
 */
const MAX_POLL_MISSES = 25;

/**
 * The poll and the clock live OUTSIDE the store's state.
 *
 * Putting a timer id in state would make every tick a state change, and the
 * store is read by a screen that re-renders on it. They are also deliberately
 * module-level rather than per-job: there is one job, so there is one loop, and
 * a second `resume()` must cancel the first rather than run two loops that both
 * write the same field.
 */
let watching: string | null = null;
let stopped = false;
let clock: ReturnType<typeof setInterval> | null = null;

function stopClock(): void {
  if (clock) clearInterval(clock);
  clock = null;
}

export const useGenerate = create<GenerateState>((set, get) => ({
  topic: "",
  notes: "",
  aspect: "9:16",
  job: null,
  starting: false,
  error: null,
  elapsedSec: 0,

  setTopic: (topic) => set({ topic }),
  setNotes: (notes) => set({ notes }),
  setAspect: (aspect) => set({ aspect }),

  start: async () => {
    const { topic, notes, aspect, starting } = get();
    if (starting || !topic.trim()) return;
    set({ starting: true, error: null, job: null, elapsedSec: 0 });
    try {
      const base = useEditor.getState().serverUrl;
      const id = await startGeneration(base, {
        topic: topic.trim(),
        aspect,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      /*
       * A synthesized `queued` row rather than an immediate fetch. The server
       * has told us the job exists and its status; asking again to learn the
       * same thing costs a round trip against a rate-limited route and leaves
       * the screen with nothing to draw in the meantime.
       */
      set({
        starting: false,
        job: { id, status: "queued", createdAt: Date.now() },
      });
      get().resume();
    } catch (err) {
      const e = err instanceof GenError ? err : null;
      set({
        starting: false,
        error: {
          kind: e?.kind ?? "failed",
          message: e?.message ?? "Could not start the generation.",
        },
      });
    }
  },

  resume: () => {
    const job = get().job;
    if (!job || isSettled(job)) return;
    if (watching === job.id) return; // already being watched
    watching = job.id;
    stopped = false;

    stopClock();
    const startedAt = job.createdAt || Date.now();
    const tick = () => set({ elapsedSec: Math.floor((Date.now() - startedAt) / 1000) });
    tick();
    clock = setInterval(tick, 1000);

    void (async () => {
      let misses = 0;
      for (let attempt = 0; ; attempt++) {
        await new Promise((r) => setTimeout(r, pollDelay(attempt)));
        if (stopped || watching !== job.id) return;
        let next: GenerationJob;
        try {
          next = await fetchGeneration(useEditor.getState().serverUrl, job.id);
          misses = 0;
        } catch (err) {
          /*
           * A poll that fails is not a job that failed — the network dropped,
           * or the server restarted behind a proxy. So it keeps polling: the
           * work is still running and the credits are still held.
           *
           * Two things end it. A job the server will never answer for again,
           * which `fetchGeneration` reports by name; and a run of failures long
           * enough that nobody is coming — without that bound, a server taken
           * down mid-job leaves this loop and its clock running for as long as
           * the app is open, every four seconds, forever.
           */
          const gone =
            err instanceof GenError && err.message.includes("no longer on the server");
          if (!gone && ++misses < MAX_POLL_MISSES) continue;
          watching = null;
          stopClock();
          set({
            job: {
              ...job,
              status: "error",
              error: gone
                ? err instanceof Error
                  ? err.message
                  : String(err)
                : "Lost contact with the server. The video may still be waiting there.",
            },
          });
          return;
        }
        if (stopped || watching !== job.id) return;
        set({ job: next });
        if (isSettled(next)) {
          watching = null;
          stopClock();
          return;
        }
      }
    })();
  },

  reset: () => {
    stopped = true;
    watching = null;
    stopClock();
    set({ topic: "", notes: "", job: null, error: null, elapsedSec: 0, starting: false });
  },
}));
