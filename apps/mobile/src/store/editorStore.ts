/**
 * Editor state (zustand) for the multi-track model. Holds the project being
 * edited + transient UI state (selection by track+clip, playhead, zoom,
 * playback) and the screen router. Mutations run pure `editor-ops` over
 * `project.tracks` and persist the result.
 */
import { create } from "zustand";
import { syncDelete } from "../net/syncClient";
import { scheduleSync } from "./syncStore";
import { DEFAULT_SERVER } from "../constants";
import { createProject, projectDuration } from "../model/project";
import * as ops from "../model/editor-ops";
import { MIN_CLIP, newId } from "../model/editor-ops";
import {
  FULL_FRAME,
  type AudioTrackClip,
  type BlendMode,
  type ChromaKey,
  type ClipFilter,
  type ClipMagnifier,
  type ClipMask,
  type ClipMosaic,
  type ExportOutput,
  type Keyframe,
  type Motion,
  type Rect,
  type TextOverlay,
  type Transition,
  type VideoProject,
  type VisualTrackClip,
  type VolumePoint,
} from "../model/types";

/** Sentinel track id for the text/caption lane (overlays live on project.overlays, not tracks). */
export const OVERLAY_TRACK = "__overlays__";

const DEFAULT_PIP: Rect = { x: 0.52, y: 0.06, w: 0.44, h: 0.3 };
import {
  deleteProject as deleteStored,
  flushProjectSave,
  listProjects,
  loadProject,
  saveProject,
  saveProjectSoon,
  type StoredProject,
} from "../storage/projects";
import { saveUserTemplate, type StoredTemplate } from "../storage/templates";
import type { EditorTemplate } from "../templates";
import {
  DEFAULT_PREFS,
  loadSettings,
  saveSettings,
  type EditorPrefs,
  type ViewMode,
} from "../storage/settings";
import {
  exportProject,
  downloadToPhotos,
  uploadMedia,
  type ExportProgress,
} from "../net/renderClient";
import { getCredits, transcribe } from "../net/genClient";
import { downloadToMedia, videoThumbnail } from "../storage/media";
import { Alert, Share } from "react-native";

export type ExportStage =
  | "preparing"
  | "uploading"
  | "rendering"
  | "downloading"
  | "saving";

export interface ExportState {
  stage: ExportStage;
  /** Overall 0..1 across every stage, or null when nothing is measurable yet. */
  progress: number | null;
  /** Files sent, during the upload stage. */
  current?: number;
  total?: number;
}

/**
 * What share of the whole export each stage is worth.
 *
 * Rough by nature — an encode's share of the wall clock depends on the project
 * — but the ORDER and the dominance are right, and that is what a bar needs to
 * avoid the two lies: racing to 90% and then sitting there, or crawling and
 * then jumping to done. The render gets most of the bar because it takes most
 * of the time.
 */
const STAGE_SPAN: Record<ExportStage, [number, number]> = {
  preparing: [0, 0.04],
  uploading: [0.04, 0.18],
  rendering: [0.18, 0.9],
  downloading: [0.9, 0.97],
  saving: [0.97, 1],
};

export function exportProgressOf(p: ExportProgress): number {
  const [lo, hi] = STAGE_SPAN[p.stage];
  const within =
    p.stage === "uploading" && p.total
      ? (p.current ?? 0) / p.total
      : (p.fraction ?? 0);
  return lo + (hi - lo) * Math.max(0, Math.min(1, within));
}

/**
 * What to call each stage.
 *
 * These used to read "Uploading media 1/1…", "Rendering on server…" — the
 * implementation describing itself. Where the video is going and what is being
 * done to it is the user's business; that it happens to involve a server is
 * not.
 */
export function exportStageLabel(state: ExportState): string {
  switch (state.stage) {
    case "preparing":
      return "Getting your video ready";
    case "uploading":
      return state.total && state.total > 1
        ? `Sending your media · ${state.current ?? 0} of ${state.total}`
        : "Sending your media";
    case "rendering":
      return "Putting your video together";
    case "downloading":
      return "Bringing it back";
    case "saving":
      return "Saving to Photos";
  }
}

export type Screen =
  | "projects"
  | "discover"
  | "library"
  | "ai"
  | "profile"
  | "editor";
/** Editor sheets/panels — mirrors Vela's `panel` state machine. */
export type EditorPanel =
  | "insert"
  | "settings"
  | "filter"
  | "audio"
  | "texttrack"
  | "imagetrack"
  | "prefs"
  | "export"
  | "editmenu"
  | "textedit"
  | "textedit-font"
  | "textedit-size"
  | "textedit-color"
  | "textedit-stroke"
  | "transition"
  | "speed"
  | "volume"
  | "fx"
  | "motion"
  | "cutout"
  | "trim"
  | "keyframe"
  | "opacity"
  | "position"
  | "mask"
  | "mosaic"
  | "magnifier"
  | "story"
  | "voiceover"
  | "blend"
  | "curve"
  | "library"
  | "keys"
  | "soundfx"
  | "aigen"
  | "auth"
  | "genhistory"
  | "tts"
  | "buycredits"
  | "ai"
  | "addvisual";

/** Initial mode/source for the AI generate modal, set by the AI hub before opening it. */
export type AiIntent = { mode: "image" | "video"; source?: "text" | "photo" };
export type { EditorPrefs };
export interface Selection {
  trackId: string;
  clipId: string;
}
export interface GapSelection {
  trackId: string;
  start: number;
  end: number;
}

const DEFAULT_PX_PER_SEC = 40;

interface EditorState {
  screen: Screen;
  projects: StoredProject[];
  serverUrl: string;
  viewMode: ViewMode;
  rippleDelete: boolean;

  projectId: string | null;
  name: string;
  posterUri?: string;
  mediaDurations: Record<string, number>;
  /** Native dimensions of the first imported video (in-memory) — powers "Original" ratio. */
  sourceDims?: { width: number; height: number };
  project: VideoProject | null;
  selected: Selection | null;
  selectedGap: GapSelection | null;
  playheadSec: number;
  pxPerSec: number;
  isPlaying: boolean;
  /** Undo / redo history of project snapshots for the open project (not persisted). */
  past: VideoProject[];
  future: VideoProject[];

  // editor sheets + prefs + export
  panel: EditorPanel | null;
  /** Where the auth gate should return after a successful sign-in (AI Generate vs AI Voice). */
  authNext: EditorPanel;
  /** Initial mode/source the AI generate modal should open with (set by the AI hub). */
  aiIntent: AiIntent | null;
  /** Which tab the content library opens on. */
  libraryTab: "stickers" | "emoji" | "backgrounds" | "stock" | "generate";
  prefs: EditorPrefs;
  exporting: boolean;
  /** Where the export has got to, or null when none is running. */
  exportState: ExportState | null;

  // navigation / settings
  go: (screen: Screen) => void;
  refreshProjects: () => void;
  loadSettings: () => void;
  setServerUrl: (url: string) => void;
  setViewMode: (m: ViewMode) => void;
  setRippleDelete: (enabled: boolean) => void;
  newProject: (name: string, width: number, height: number) => void;
  /** Create + open a new project seeded from a built-in template. */
  newProjectFromTemplate: (tpl: EditorTemplate) => void;
  /** Create + open a new project cloned from a user-saved template. */
  newProjectFromStoredTemplate: (tpl: StoredTemplate) => void;
  /** Save the current project's structure as a reusable user template. */
  saveAsTemplate: () => void;
  /** Save a stored project (by id) as a reusable user template. */
  saveProjectAsTemplate: (id: string) => void;
  openProject: (id: string) => void;
  removeProject: (id: string) => void;
  removeProjects: (ids: string[]) => void;
  renameProject: (id: string, name: string) => void;
  duplicateProject: (id: string) => void;
  setProjectFolder: (id: string, folder: string) => void;
  setProjectsFolder: (ids: string[], folder: string) => void;
  closeEditor: () => void;

  // transient UI
  select: (sel: Selection | null) => void;
  selectGap: (gap: GapSelection | null) => void;
  setPlayhead: (sec: number) => void;
  setZoom: (pxPerSec: number) => void;
  setPlaying: (v: boolean) => void;
  setPoster: (uri: string) => void;
  /** Set the project poster from its first visual clip, if none is set yet. */
  ensurePoster: () => void;
  setMediaDuration: (src: string, sec: number) => void;
  setPanel: (panel: EditorPanel | null) => void;
  /** Open the content library on a specific tab. */
  openLibrary: (
    tab: "stickers" | "emoji" | "backgrounds" | "stock" | "generate",
  ) => void;
  /** Undo / redo the last project mutation. */
  undo: () => void;
  redo: () => void;
  setPref: <K extends keyof EditorPrefs>(key: K, value: EditorPrefs[K]) => void;
  exportToPhotos: (output?: ExportOutput) => Promise<void>;
  shareExport: (output?: ExportOutput) => Promise<void>;
  /** Export a stored project (by id, without opening it) and share the file. */
  shareProject: (id: string, output?: ExportOutput) => Promise<void>;
  /** Credit balance for this device (null = unknown / server unreachable). */
  credits: number | null;
  /** Refresh the credit balance from the render server. */
  refreshCredits: () => Promise<void>;
  /** Add a generated image (by URL) to the timeline. */
  insertImageFromUrl: (url: string) => Promise<void>;
  /** Add a generated video (by URL) to the timeline, plus an optional synced sound-effect clip. */
  insertVideoFromUrl: (
    url: string,
    audioUrl?: string,
    durationSec?: number,
  ) => Promise<void>;
  /** Add a generated voiceover (by URL) as an audio clip at the playhead. */
  insertVoiceoverFromUrl: (url: string) => Promise<void>;

  // helpers
  mainTrackId: () => string | null;

  // mutations
  apply: (fn: (p: VideoProject) => VideoProject) => void;
  /**
   * Transcribe the selected clip (or the project's first sound) and lay the
   * result down as captions. Resolves to a human-readable outcome; the sheet
   * shows it and does not need to know about HTTP.
   */
  autoCaption: () => Promise<string>;
  importVisual: (clips: VisualTrackClip[]) => void;
  importOverlay: (clips: VisualTrackClip[]) => void;
  importAudio: (clip: AudioTrackClip) => void;
  addText: () => void;
  editSelectedText: (text: string) => void;
  updateSelectedOverlay: (patch: Partial<TextOverlay>) => void;
  addLayer: () => void;
  splitAtPlayhead: () => void;
  duplicateSelected: () => void;
  removeSelected: () => void;
  /** Remove the selected element and close its interval on the same lane. */
  rippleDeleteSelected: () => void;
  /** Close the selected empty interval on its track. */
  removeSelectedGap: () => void;
  setClipStart: (trackId: string, clipId: string, start: number) => void;
  moveClipToTrack: (
    fromTrackId: string,
    toTrackId: string,
    clipId: string,
    start: number,
  ) => void;
  trimClip: (
    trackId: string,
    clipId: string,
    patch: { start?: number; trimIn?: number; duration?: number },
  ) => void;
  setClipRect: (trackId: string, clipId: string, rect: Rect) => void;
  setSelectedFilter: (filter: ClipFilter | undefined) => void;
  /** Apply a filter to the effects target (selected visual clip, else base clip at playhead). */
  applyClipFilter: (filter: ClipFilter | undefined) => void;
  /** Apply a Gaussian blur (FX) to the effects target. */
  applyClipBlur: (blur: number) => void;
  /** Apply static opacity to the effects target. */
  applyClipOpacity: (opacity: number) => void;
  /** Apply a placement rect to the effects target (Position tool). */
  applyClipRect: (rect: Rect) => void;
  /** Apply / clear a shape mask on the effects target. */
  applyClipMask: (mask: ClipMask | undefined) => void;
  /** Apply / clear a local mosaic region on the effects target. */
  applyClipMosaic: (mosaic: ClipMosaic | undefined) => void;
  /** Apply / clear a local magnifying lens on the effects target. */
  applyClipMagnifier: (magnifier: ClipMagnifier | undefined) => void;
  /** Set an authoring-only storyboard note on a visual clip (Story panel). */
  setClipNote: (trackId: string, clipId: string, note: string) => void;
  /** Move a visual clip to a new index on its track, repacking the sequence. */
  reorderClip: (trackId: string, from: number, to: number) => void;
  /** Add / remove the Story title card, shifting the timeline to make room. */
  setTitleCard: (on: boolean, text?: string) => void;
  /** Apply a blend mode to the effects target. */
  applyClipBlend: (blend: BlendMode) => void;
  /** Apply a Ken-Burns motion preset to the effects target. */
  applyClipMotion: (motion: Motion | undefined) => void;
  /** Apply / clear a chroma-key cutout on the effects target. */
  applyClipCutout: (cutout: ChromaKey | undefined) => void;
  /** Set (or clear) the keyframe track on the effects target. */
  applyClipKeyframes: (keyframes: Keyframe[] | undefined) => void;
  /** Apply speed to the effects target. */
  applyClipSpeed: (speed: number) => void;
  /** Apply volume to the selected clip (audio or video), else the base clip at playhead. */
  applyClipVolume: (volume: number) => void;
  /** Mute/unmute the main video track's original audio (all its video clips). */
  toggleMainMuted: () => void;
  /** Apply / clear a volume envelope on the selected clip (audio or video). */
  applyClipVolumeCurve: (curve: VolumePoint[] | undefined) => void;
  /** Set the project background (color / gradient / image). */
  applyBackground: (background: VideoProject["background"]) => void;
  setSelectedSpeed: (speed: number) => void;
  setSelectedVolume: (volume: number) => void;
  setSelectedTransition: (transition: Transition | undefined) => void;
  moveSelectedLayer: (dir: 1 | -1) => void;
  togglePiP: () => void;
  setRatio: (width: number, height: number) => void;
  setName: (name: string) => void;
  setSourceDims: (width: number, height: number) => void;
  /** Toggle HDR authoring (preview glow + default HDR10 export). */
  setHdr: (hdr: boolean) => void;
}

// Undo history: coalesce a burst of mutations (e.g. a drag's per-frame updates)
// within this window into a single entry; cap total snapshots.
const HISTORY_COALESCE_MS = 450;
const HISTORY_MAX = 60;
let lastHistoryAt = 0;

export const useEditor = create<EditorState>((set, get) => ({
  screen: "projects",
  projects: [],
  serverUrl: DEFAULT_SERVER,
  viewMode: "list",
  rippleDelete: false,
  projectId: null,
  name: "",
  posterUri: undefined,
  mediaDurations: {},
  sourceDims: undefined,
  project: null,
  selected: null,
  selectedGap: null,
  playheadSec: 0,
  pxPerSec: DEFAULT_PX_PER_SEC,
  isPlaying: false,
  credits: null,
  past: [],
  future: [],
  panel: null,
  authNext: "aigen",
  aiIntent: null,
  libraryTab: "emoji",
  prefs: DEFAULT_PREFS,
  exporting: false,
  exportState: null,

  go: (screen) => set({ screen }),
  refreshProjects: () => set({ projects: listProjects() }),
  loadSettings: () => {
    const s = loadSettings();
    set({
      serverUrl: s.serverUrl,
      viewMode: s.viewMode,
      rippleDelete: s.rippleDelete,
      prefs: s.prefs,
    });
  },
  setServerUrl: (url) => {
    const serverUrl = url.trim() || DEFAULT_SERVER;
    set({ serverUrl });
    saveSettings({
      serverUrl,
      viewMode: get().viewMode,
      rippleDelete: get().rippleDelete,
      prefs: get().prefs,
    });
  },
  setViewMode: (viewMode) => {
    set({ viewMode });
    saveSettings({
      serverUrl: get().serverUrl,
      viewMode,
      rippleDelete: get().rippleDelete,
      prefs: get().prefs,
    });
  },
  setRippleDelete: (rippleDelete) => {
    set({ rippleDelete });
    saveSettings({
      serverUrl: get().serverUrl,
      viewMode: get().viewMode,
      rippleDelete,
      prefs: get().prefs,
    });
  },

  newProject: (name, width, height) => {
    const id = newId("proj");
    const base = createProject({ id, width, height });
    const project: VideoProject = {
      ...base,
      schemaVersion: 2,
      tracks: ops.newProjectTracks(),
    };
    saveProject({
      id,
      name,
      updatedAt: Date.now(),
      project,
      mediaDurations: {},
    });
    set({
      projectId: id,
      name,
      posterUri: undefined,
      mediaDurations: {},
      sourceDims: undefined,
      project,
      selected: null,
      selectedGap: null,
      playheadSec: 0,
      isPlaying: false,
      pxPerSec: DEFAULT_PX_PER_SEC,
      past: [],
      future: [],
      panel: null,
      screen: "editor",
    });
  },

  newProjectFromTemplate: (tpl) => {
    const id = newId("proj");
    const base = createProject({
      id,
      width: tpl.width,
      height: tpl.height,
      background: tpl.background,
    });
    const overlays = tpl.texts.map((o) => ({
      ...o,
      id: newId("ov"),
      type: "text" as const,
    }));
    const project: VideoProject = {
      ...base,
      schemaVersion: 2,
      tracks: ops.newProjectTracks(),
      overlays,
    };
    saveProject({
      id,
      name: tpl.name,
      updatedAt: Date.now(),
      project,
      mediaDurations: {},
    });
    set({
      projectId: id,
      name: tpl.name,
      posterUri: undefined,
      mediaDurations: {},
      sourceDims: undefined,
      project,
      selected: null,
      selectedGap: null,
      playheadSec: 0,
      isPlaying: false,
      pxPerSec: DEFAULT_PX_PER_SEC,
      past: [],
      future: [],
      panel: null,
      screen: "editor",
    });
  },

  newProjectFromStoredTemplate: (tpl) => {
    const id = newId("proj");
    const project: VideoProject = {
      ...JSON.parse(JSON.stringify(tpl.project)),
      id,
      schemaVersion: 2,
    };
    saveProject({
      id,
      name: tpl.name,
      updatedAt: Date.now(),
      project,
      mediaDurations: {},
    });
    set({
      projectId: id,
      name: tpl.name,
      posterUri: undefined,
      mediaDurations: {},
      sourceDims: undefined,
      project,
      selected: null,
      selectedGap: null,
      playheadSec: 0,
      isPlaying: false,
      pxPerSec: DEFAULT_PX_PER_SEC,
      past: [],
      future: [],
      panel: null,
      screen: "editor",
    });
  },

  saveAsTemplate: () => {
    const { project, name } = get();
    if (!project) return;
    saveUserTemplate({
      id: newId("tpl"),
      name: `${name} (template)`,
      createdAt: Date.now(),
      project,
    });
  },

  saveProjectAsTemplate: (id) => {
    const stored = loadProject(id);
    if (!stored) return;
    saveUserTemplate({
      id: newId("tpl"),
      name: `${stored.name} (template)`,
      createdAt: Date.now(),
      project: stored.project,
    });
  },

  openProject: (id) => {
    // Land any deferred edit to the project being left before reading from disk.
    flushProjectSave();
    const stored = loadProject(id);
    if (!stored) return;
    const project = ops.ensureTracks(stored.project); // migrate legacy → tracks
    set({
      projectId: id,
      name: stored.name,
      posterUri: stored.posterUri,
      mediaDurations: stored.mediaDurations ?? {},
      sourceDims: undefined,
      project,
      selected: null,
      selectedGap: null,
      playheadSec: 0,
      isPlaying: false,
      pxPerSec: DEFAULT_PX_PER_SEC,
      past: [],
      future: [],
      panel: null,
      screen: "editor",
    });
    get().ensurePoster(); // backfill a poster for older projects saved without one
  },

  // Flush BEFORE deleting: a queued write would otherwise fire afterwards and
  // put the file the user just deleted straight back.
  removeProject: (id) => {
    flushProjectSave();
    deleteStored(id);
    // Tell the cloud too, or the next pull helpfully restores it.
    void syncDelete(get().serverUrl, id);
    set({ projects: listProjects() });
  },

  removeProjects: (ids) => {
    flushProjectSave();
    ids.forEach((id) => {
      deleteStored(id);
      void syncDelete(get().serverUrl, id);
    });
    set({ projects: listProjects() });
  },

  renameProject: (id, name) => {
    const stored = loadProject(id);
    if (!stored) return;
    const clean = name.trim() || "Untitled";
    saveProject({ ...stored, name: clean, updatedAt: Date.now() });
    set({ projects: listProjects() });
    if (get().projectId === id) set({ name: clean });
  },

  setProjectFolder: (id, folder) => {
    const stored = loadProject(id);
    if (!stored) return;
    const f = folder.trim() || "Default";
    saveProject({ ...stored, folder: f });
    set({ projects: listProjects() });
  },

  setProjectsFolder: (ids, folder) => {
    const f = folder.trim() || "Default";
    ids.forEach((id) => {
      const stored = loadProject(id);
      if (stored) saveProject({ ...stored, folder: f });
    });
    set({ projects: listProjects() });
  },

  duplicateProject: (id) => {
    const stored = loadProject(id);
    if (!stored) return;
    const nid = newId("proj");
    saveProject({
      id: nid,
      name: `${stored.name} copy`,
      updatedAt: Date.now(),
      project: { ...stored.project, id: nid },
      posterUri: stored.posterUri,
      mediaDurations: stored.mediaDurations ?? {},
    });
    set({ projects: listProjects() });
  },

  closeEditor: () =>
    set({
      screen: "projects",
      isPlaying: false,
      panel: null,
      selected: null,
      selectedGap: null,
      projects: listProjects(),
    }),

  select: (sel) => set({ selected: sel, selectedGap: null }),
  selectGap: (selectedGap) => set({ selected: null, selectedGap }),
  setPlayhead: (sec) => set({ playheadSec: Math.max(0, sec) }),
  setZoom: (pxPerSec) =>
    set({ pxPerSec: Math.max(8, Math.min(400, pxPerSec)) }),
  setPlaying: (v) => set({ isPlaying: v }),
  setPoster: (uri) => {
    set({ posterUri: uri });
    const { projectId, name, project, mediaDurations } = get();
    if (projectId && project)
      saveProject({
        id: projectId,
        name,
        updatedAt: Date.now(),
        project,
        posterUri: uri,
        mediaDurations,
      });
  },
  ensurePoster: () => {
    if (get().posterUri) return;
    const { project } = get();
    const mainId = get().mainTrackId();
    const main = project && mainId ? ops.findTrack(project, mainId) : undefined;
    const first =
      main && main.kind === "visual"
        ? (main.clips[0] as VisualTrackClip | undefined)
        : undefined;
    if (!first) return;
    if (first.type === "image") get().setPoster(first.src);
    else
      void videoThumbnail(first.src, 0).then((t) => {
        if (t && !get().posterUri) get().setPoster(t);
      });
  },
  setMediaDuration: (src, sec) => {
    const mediaDurations = { ...get().mediaDurations, [src]: sec };
    set({ mediaDurations });
    const { projectId, name, project, posterUri } = get();
    if (projectId && project)
      saveProject({
        id: projectId,
        name,
        updatedAt: Date.now(),
        project,
        posterUri,
        mediaDurations,
      });
  },

  setPanel: (panel) => set({ panel }),
  openLibrary: (libraryTab) => set({ libraryTab, panel: "library" }),
  setPref: (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });
    saveSettings({
      serverUrl: get().serverUrl,
      viewMode: get().viewMode,
      rippleDelete: get().rippleDelete,
      prefs,
    });
  },

  exportToPhotos: async (output) => {
    const { project, serverUrl, exporting } = get();
    if (!project || exporting) return;
    const clipCount = (project.tracks ?? []).reduce(
      (n, t) => n + t.clips.length,
      0,
    );
    if (clipCount === 0 && project.overlays.length === 0) {
      Alert.alert("Nothing to export", "Import a clip first.");
      return;
    }
    set({ panel: null, exporting: true, exportState: { stage: "preparing", progress: 0 } });
    try {
      const url = await exportProject(
        serverUrl,
        project,
        (p) => set({ exportState: { ...p, progress: exportProgressOf(p) } }),
        output,
      );
      await downloadToPhotos(url, Date.now(), (p) =>
        set({ exportState: { ...p, progress: exportProgressOf(p) } }),
      );
      set({ exporting: false });
      Alert.alert("Exported", "Your video was saved to Photos.");
    } catch (e) {
      set({ exporting: false });
      Alert.alert("Export failed", e instanceof Error ? e.message : String(e));
    }
  },

  shareExport: async (output) => {
    const { project, serverUrl, exporting } = get();
    if (!project || exporting) return;
    const clipCount = (project.tracks ?? []).reduce(
      (n, t) => n + t.clips.length,
      0,
    );
    if (clipCount === 0 && project.overlays.length === 0) {
      Alert.alert("Nothing to share", "Import a clip first.");
      return;
    }
    set({ panel: null, exporting: true, exportState: { stage: "preparing", progress: 0 } });
    try {
      const url = await exportProject(
        serverUrl,
        project,
        (p) => set({ exportState: { ...p, progress: exportProgressOf(p) } }),
        output,
      );
      const fileUri = await downloadToPhotos(url, Date.now(), (p) =>
        set({ exportState: { ...p, progress: exportProgressOf(p) } }),
      );
      set({ exporting: false });
      await Share.share({ url: fileUri });
    } catch (e) {
      set({ exporting: false });
      Alert.alert("Share failed", e instanceof Error ? e.message : String(e));
    }
  },

  shareProject: async (id, output) => {
    const { serverUrl, exporting } = get();
    if (exporting) return;
    const stored = loadProject(id);
    if (!stored) return;
    const project = ops.ensureTracks(stored.project);
    const clipCount = (project.tracks ?? []).reduce(
      (n, t) => n + t.clips.length,
      0,
    );
    if (clipCount === 0 && project.overlays.length === 0) {
      Alert.alert("Nothing to share", "This project has no clips yet.");
      return;
    }
    set({ exporting: true, exportState: { stage: "preparing", progress: 0 } });
    try {
      const url = await exportProject(
        serverUrl,
        project,
        (p) => set({ exportState: { ...p, progress: exportProgressOf(p) } }),
        output,
      );
      const fileUri = await downloadToPhotos(url, Date.now(), (p) =>
        set({ exportState: { ...p, progress: exportProgressOf(p) } }),
      );
      set({ exporting: false });
      await Share.share({ url: fileUri });
    } catch (e) {
      set({ exporting: false });
      Alert.alert("Share failed", e instanceof Error ? e.message : String(e));
    }
  },

  refreshCredits: async () => {
    set({ credits: await getCredits(get().serverUrl) });
  },

  insertImageFromUrl: async (url) => {
    const src = await downloadToMedia(url, "jpg");
    get().importVisual([
      { id: newId("img"), type: "image", src, start: 0, duration: 4 },
    ]);
  },

  insertVideoFromUrl: async (url, audioUrl, durationSec) => {
    const dur = durationSec && durationSec > 0 ? durationSec : 5;
    const p = get().project;
    const mainId = get().mainTrackId();
    const main = p && mainId ? ops.findTrack(p, mainId) : undefined;
    // Where importVisual will append the video — so a paired audio clip lines up.
    const startAt = main && main.kind === "visual" ? ops.trackEnd(main) : 0;
    const src = await downloadToMedia(url, "mp4");
    get().setMediaDuration(src, dur);
    get().importVisual([
      {
        id: newId("v"),
        type: "video",
        src,
        start: 0,
        duration: dur,
        trimIn: 0,
        volume: 1,
      },
    ]);
    if (audioUrl) {
      const asrc = await downloadToMedia(audioUrl, "mp3");
      get().importAudio({
        id: newId("a"),
        src: asrc,
        start: startAt,
        duration: dur,
        volume: 1,
      });
    }
  },

  insertVoiceoverFromUrl: async (url) => {
    const src = await downloadToMedia(url, "mp3");
    // duration 0 → importAudio applies a sensible fallback (as with imported music).
    get().importAudio({
      id: newId("a"),
      src,
      start: get().playheadSec ?? 0,
      duration: 0,
      volume: 0.9,
    });
  },

  mainTrackId: () =>
    get().project?.tracks?.find((t) => t.kind === "visual")?.id ?? null,

  autoCaption: async () => {
    const { project, selected, serverUrl } = get();
    if (!project) return "Nothing to caption yet.";

    /*
     * What gets transcribed, in order of what the user most likely means: the
     * clip they have selected, then the first sound on the timeline, then the
     * first clip of the main track. Captions follow speech, and speech is
     * usually in a voiceover — but if they picked a clip, that is the answer.
     */
    const visual = project.tracks?.filter((t) => t.kind === "visual") ?? [];
    const audio = project.tracks?.filter((t) => t.kind === "audio") ?? [];
    const chosen =
      (selected &&
        [...visual, ...audio]
          .flatMap((t) => t.clips.map((c) => ({ clip: c, track: t })))
          .find((x) => x.clip.id === selected.clipId)) ||
      audio.flatMap((t) => t.clips.map((c) => ({ clip: c, track: t })))[0] ||
      visual.flatMap((t) => t.clips.map((c) => ({ clip: c, track: t })))[0];

    const src = chosen?.clip.src;
    if (!src) return "Add a clip or a sound first.";

    // The clip is a local file; the service needs a token. This is the same
    // upload the export path does, so a clip captioned then exported is
    // uploaded once.
    const token = await uploadMedia(serverUrl, src);
    const { lines } = await transcribe(serverUrl, token);
    if (!lines.length) return "No speech found in that clip.";

    // The transcript is relative to the audio; the overlays are absolute.
    get().apply((p) => ops.setAutoCaptions(p, lines, chosen.clip.start));
    return `Added ${lines.length} caption${lines.length === 1 ? "" : "s"}.`;
  },

  apply: (fn) => {
    const { project, projectId, name, posterUri, mediaDurations, past } = get();
    if (!project || !projectId) return;
    const next = fn(project);
    const now = Date.now();
    // Push the pre-mutation state, coalescing rapid successive mutations (drags).
    const coalesce =
      past.length > 0 && now - lastHistoryAt < HISTORY_COALESCE_MS;
    lastHistoryAt = now;
    set({
      project: next,
      past: coalesce ? past : [...past, project].slice(-HISTORY_MAX),
      future: [],
      selectedGap: null,
    });
    // Deferred: this runs on every pointer event of a drag, and the write is
    // synchronous. See `saveProjectSoon`.
    saveProjectSoon({
      id: projectId,
      name,
      updatedAt: Date.now(),
      project: next,
      posterUri,
      mediaDurations,
    });
    /*
     * Disk first, cloud after. The write above is what protects the work; this
     * only makes it available elsewhere, so it is scheduled and allowed to fail
     * — and a burst of edits collapses into one pass rather than one request
     * per pointer event.
     */
    scheduleSync();
  },

  undo: () => {
    const {
      past,
      future,
      project,
      projectId,
      name,
      posterUri,
      mediaDurations,
    } = get();
    if (!past.length || !project || !projectId) return;
    const previous = past[past.length - 1];
    lastHistoryAt = 0;
    set({
      past: past.slice(0, -1),
      future: [...future, project],
      project: previous,
      selected: null,
      selectedGap: null,
    });
    saveProject({
      id: projectId,
      name,
      updatedAt: Date.now(),
      project: previous,
      posterUri,
      mediaDurations,
    });
  },
  redo: () => {
    const {
      past,
      future,
      project,
      projectId,
      name,
      posterUri,
      mediaDurations,
    } = get();
    if (!future.length || !project || !projectId) return;
    const upcoming = future[future.length - 1];
    lastHistoryAt = 0;
    set({
      future: future.slice(0, -1),
      past: [...past, project],
      project: upcoming,
      selected: null,
      selectedGap: null,
    });
    saveProject({
      id: projectId,
      name,
      updatedAt: Date.now(),
      project: upcoming,
      posterUri,
      mediaDurations,
    });
  },

  importVisual: (clips) => {
    const mainId = get().mainTrackId();
    if (!mainId) return;
    const gap = get().selectedGap;
    const fillsGap = gap?.trackId === mainId;
    get().apply((p) => {
      let np = p;
      const main = ops.findTrack(np, mainId);
      let start = fillsGap ? gap.start : main ? ops.trackEnd(main) : 0;
      let remaining = fillsGap ? gap.end - gap.start : Number.POSITIVE_INFINITY;
      for (const c of clips) {
        if (remaining <= 0.001) break;
        const duration = Math.min(c.duration, remaining);
        np = ops.addVisualClip(np, mainId, { ...c, start, duration });
        start += duration;
        remaining -= duration;
      }
      return np;
    });
    get().ensurePoster(); // first visual → project poster (covers picked + AI-inserted media)
  },

  importOverlay: (clips) => {
    const at = get().playheadSec;
    get().apply((p) => {
      let np = p;
      const trackId = newId("trk");
      np = ops.addTrack(np, "visual", trackId);
      let start = at;
      for (const c of clips) {
        np = ops.addVisualClip(np, trackId, {
          ...c,
          start,
          rect: c.rect ?? DEFAULT_PIP,
        });
        start += c.duration;
      }
      return np;
    });
  },

  importAudio: (clip) => {
    get().apply((p) => {
      let np = p;
      const existing = (np.tracks ?? []).find((t) => t.kind === "audio");
      let trackId: string;
      if (!existing) {
        trackId = newId("trk");
        np = ops.addTrack(np, "audio", trackId);
      } else {
        trackId = existing.id;
      }
      const duration =
        clip.duration && clip.duration > 0
          ? clip.duration
          : Math.max(5, projectDuration(np));
      return ops.addAudioClip(np, trackId, {
        ...clip,
        start: clip.start ?? 0,
        duration,
      });
    });
  },

  addText: () => {
    const { project, playheadSec } = get();
    if (!project) return;
    const id = newId("txt");
    // New captions land on their own lane on top of any existing ones.
    const layer = project.overlays.length
      ? ops.maxOverlayLayer(project) + 1
      : 0;
    const overlay: TextOverlay = {
      id,
      type: "text",
      text: "Your text",
      start: playheadSec,
      end: playheadSec + 3,
      x: 0.5,
      y: 0.42,
      fontSize: Math.round(project.width * 0.07),
      color: "#ffffff",
      align: "center",
      bold: true,
      animation: "fade",
      layer,
    };
    get().apply((p) => ops.addOverlay(p, overlay));
    set({ selected: { trackId: OVERLAY_TRACK, clipId: id } });
  },

  editSelectedText: (text) => {
    const s = get().selected;
    if (!s || s.trackId !== OVERLAY_TRACK) return;
    get().apply((p) => ops.updateOverlay(p, s.clipId, { text }));
  },

  updateSelectedOverlay: (patch) => {
    const s = get().selected;
    if (!s || s.trackId !== OVERLAY_TRACK) return;
    get().apply((p) => ops.updateOverlay(p, s.clipId, patch));
  },

  addLayer: () => get().apply((p) => ops.addTrack(p, "visual")),

  splitAtPlayhead: () => {
    const { selected, playheadSec, project } = get();
    if (!project) return;
    let target = selected;
    if (!target) {
      for (const t of [...(project.tracks ?? [])].reverse()) {
        const c = ops.clipAtTime(t, playheadSec);
        if (c) {
          target = { trackId: t.id, clipId: c.id };
          break;
        }
      }
    }
    if (!target) return;
    set({ selected: target });
    get().apply((p) =>
      ops.splitClipAt(p, target!.trackId, target!.clipId, playheadSec),
    );
  },

  duplicateSelected: () => {
    const { selected, project } = get();
    if (!selected || !project) return;
    if (selected.trackId === OVERLAY_TRACK) {
      const o = project.overlays.find((x) => x.id === selected.clipId);
      if (!o) return;
      const id = newId("txt");
      const dur = o.end - o.start;
      get().apply((p) =>
        ops.addOverlay(p, { ...o, id, start: o.end, end: o.end + dur }),
      );
      set({ selected: { trackId: OVERLAY_TRACK, clipId: id } });
      return;
    }
    const track = ops.findTrack(project, selected.trackId);
    const clip = track?.clips.find((c) => c.id === selected.clipId);
    if (!track || !clip) return;
    if (track.kind === "visual") {
      const id = newId("v");
      get().apply((p) =>
        ops.rippleInsertClip(p, track.id, {
          ...(clip as VisualTrackClip),
          id,
          start: clip.start + clip.duration,
        }),
      );
      set({ selected: { trackId: track.id, clipId: id } });
    } else {
      const id = newId("a");
      get().apply((p) =>
        ops.rippleInsertClip(p, track.id, {
          ...(clip as AudioTrackClip),
          id,
          start: clip.start + clip.duration,
        }),
      );
      set({ selected: { trackId: track.id, clipId: id } });
    }
  },

  removeSelected: () => {
    const s = get().selected;
    if (!s) return;
    if (s.trackId === OVERLAY_TRACK)
      get().apply((p) => ops.removeOverlay(p, s.clipId));
    else
      get().apply((p) => {
        const { linkage, mainTrack } = get().prefs;
        const isMain = s.trackId === get().mainTrackId();
        // Track Linkage: elements inside a main clip's span go with it.
        let next =
          linkage && isMain
            ? ops.removeMainClipLinked(p, s.trackId, s.clipId)
            : ops.removeClip(p, s.trackId, s.clipId);
        // Quick main-track mode keeps the sequence fluid — no gap left behind.
        if (isMain && mainTrack === "Quick")
          next = ops.packVisualTrack(next, s.trackId);
        return ops.pruneEmptyTracks(next);
      });
    set({ selected: null });
  },

  rippleDeleteSelected: () => {
    const selected = get().selected;
    const project = get().project;
    if (!selected || !project) return;

    let start = 0;
    if (selected.trackId === OVERLAY_TRACK) {
      const overlay = project.overlays.find(
        (item) => item.id === selected.clipId,
      );
      if (!overlay) return;
      start = overlay.start;
      get().apply((p) => ops.rippleDeleteOverlay(p, selected.clipId));
    } else {
      const track = ops.findTrack(project, selected.trackId);
      const clip = track?.clips.find((item) => item.id === selected.clipId);
      if (!clip) return;
      start = clip.start;
      get().apply((p) =>
        ops.pruneEmptyTracks(
          ops.rippleDeleteClip(p, selected.trackId, selected.clipId),
        ),
      );
    }
    set({ selected: null, playheadSec: start });
  },

  removeSelectedGap: () => {
    const gap = get().selectedGap;
    if (!gap) return;
    get().apply((p) => ops.removeTrackGap(p, gap.trackId, gap.start, gap.end));
    set({ selectedGap: null, playheadSec: gap.start });
  },

  setClipStart: (trackId, clipId, start) => {
    if (trackId === OVERLAY_TRACK) {
      get().apply((p) => {
        const o = p.overlays.find((x) => x.id === clipId);
        if (!o) return p;
        const s = Math.max(0, start);
        return ops.updateOverlay(p, clipId, {
          start: s,
          end: s + (o.end - o.start),
        });
      });
      return;
    }
    get().apply((p) => {
      const { linkage, mainTrack } = get().prefs;
      const isMain = trackId === get().mainTrackId();
      let next =
        linkage && isMain
          ? ops.moveMainClipLinked(p, trackId, clipId, start)
          : ops.setClipStart(p, trackId, clipId, start);
      // In Quick mode a drag reorders the sequence rather than leaving a gap.
      if (isMain && mainTrack === "Quick")
        next = ops.packVisualTrack(next, trackId);
      return next;
    });
  },
  moveClipToTrack: (fromTrackId, toTrackId, clipId, start) =>
    get().apply((p) =>
      ops.pruneEmptyTracks(
        ops.moveClipToTrack(p, fromTrackId, toTrackId, clipId, start),
      ),
    ),
  trimClip: (trackId, clipId, patch) => {
    if (trackId === OVERLAY_TRACK) {
      get().apply((p) => {
        const o = p.overlays.find((x) => x.id === clipId);
        if (!o) return p;
        const start =
          patch.start !== undefined ? Math.max(0, patch.start) : o.start;
        const duration = Math.max(MIN_CLIP, patch.duration ?? o.end - o.start);
        return ops.updateOverlay(p, clipId, { start, end: start + duration });
      });
      return;
    }
    get().apply((p) => ops.trimClip(p, trackId, clipId, patch));
  },
  setClipRect: (trackId, clipId, rect) =>
    get().apply((p) => ops.setClipRect(p, trackId, clipId, rect)),

  setSelectedFilter: (filter) => {
    const s = get().selected;
    if (!s || s.trackId === OVERLAY_TRACK) return;
    get().apply((p) => ops.setClipFilter(p, s.trackId, s.clipId, filter));
  },
  applyClipFilter: (filter) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipFilter(p, t.trackId, t.clipId, filter));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipBlur: (blur) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipBlur(p, t.trackId, t.clipId, blur));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipOpacity: (opacity) => {
    const overlay = selectedOverlay();
    if (overlay) {
      get().apply((p) => ops.updateOverlay(p, overlay.id, { opacity }));
      return;
    }
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipOpacity(p, t.trackId, t.clipId, opacity));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipRect: (rect) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipRect(p, t.trackId, t.clipId, rect));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipMask: (mask) => {
    const overlay = selectedOverlay();
    if (overlay) {
      get().apply((p) => ops.updateOverlay(p, overlay.id, { mask }));
      return;
    }
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipMask(p, t.trackId, t.clipId, mask));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipMosaic: (mosaic) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipMosaic(p, t.trackId, t.clipId, mosaic));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipMagnifier: (magnifier) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipMagnifier(p, t.trackId, t.clipId, magnifier));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  setClipNote: (trackId, clipId, note) => {
    get().apply((p) => ops.setClipNote(p, trackId, clipId, note));
  },
  reorderClip: (trackId, from, to) => {
    get().apply((p) => ops.reorderVisualClips(p, trackId, from, to));
  },
  setTitleCard: (on, text) => {
    get().apply((p) =>
      on ? ops.addTitleCard(p, text?.trim() || "Title") : ops.removeTitleCard(p),
    );
  },
  applyClipBlend: (blend) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipBlend(p, t.trackId, t.clipId, blend));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipMotion: (motion) => {
    const sel = get().selected;
    if (sel && sel.trackId === OVERLAY_TRACK) {
      const id = sel.clipId;
      get().apply((p) =>
        ops.updateOverlay(p, id, {
          motion: motion && motion.type !== "none" ? motion : undefined,
        }),
      );
      return;
    }
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipMotion(p, t.trackId, t.clipId, motion));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipCutout: (cutout) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipCutout(p, t.trackId, t.clipId, cutout));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipKeyframes: (keyframes) => {
    const sel = get().selected;
    if (sel && sel.trackId === OVERLAY_TRACK) {
      const id = sel.clipId;
      const kfs =
        keyframes && keyframes.length
          ? [...keyframes].sort((a, b) => a.t - b.t)
          : undefined;
      get().apply((p) => ops.updateOverlay(p, id, { keyframes: kfs }));
      return;
    }
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipKeyframes(p, t.trackId, t.clipId, keyframes));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipSpeed: (speed) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipSpeed(p, t.trackId, t.clipId, speed));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipVolume: (volume) => {
    const s = get().selected;
    let target =
      s && s.trackId !== OVERLAY_TRACK
        ? { trackId: s.trackId, clipId: s.clipId }
        : null;
    if (!target) {
      const t = effectsTarget();
      if (t) target = { trackId: t.trackId, clipId: t.clipId };
    }
    if (!target) return;
    const tt = target;
    get().apply((p) => ops.setClipVolume(p, tt.trackId, tt.clipId, volume));
    set({ selected: tt });
  },
  toggleMainMuted: () => {
    const mainId = get().mainTrackId();
    const project = get().project;
    const main = project && mainId ? ops.findTrack(project, mainId) : undefined;
    if (!main || main.kind !== "visual") return;
    const videos = main.clips.filter((c) => c.type === "video");
    if (!videos.length) return;
    const next = videos.every((c) => (c.volume ?? 1) === 0) ? 1 : 0; // unmute if all muted, else mute
    get().apply((p) => {
      let np = p;
      for (const c of videos) np = ops.setClipVolume(np, mainId!, c.id, next);
      return np;
    });
  },
  applyClipVolumeCurve: (curve) => {
    const s = get().selected;
    let target =
      s && s.trackId !== OVERLAY_TRACK
        ? { trackId: s.trackId, clipId: s.clipId }
        : null;
    if (!target) {
      const t = effectsTarget();
      if (t) target = { trackId: t.trackId, clipId: t.clipId };
    }
    if (!target) return;
    const tt = target;
    get().apply((p) => ops.setClipVolumeCurve(p, tt.trackId, tt.clipId, curve));
    set({ selected: tt });
  },
  applyBackground: (background) => {
    get().apply((p) => ops.setBackground(p, background));
  },
  setSelectedSpeed: (speed) => {
    const s = get().selected;
    if (!s || s.trackId === OVERLAY_TRACK) return;
    get().apply((p) => ops.setClipSpeed(p, s.trackId, s.clipId, speed));
  },
  setSelectedVolume: (volume) => {
    const s = get().selected;
    if (!s || s.trackId === OVERLAY_TRACK) return;
    get().apply((p) => ops.setClipVolume(p, s.trackId, s.clipId, volume));
  },
  setSelectedTransition: (transition) => {
    const s = get().selected;
    if (!s || s.trackId === OVERLAY_TRACK) return;
    get().apply((p) =>
      ops.setClipTransition(p, s.trackId, s.clipId, transition),
    );
  },

  moveSelectedLayer: (dir) => {
    const { selected, project } = get();
    if (!selected || !project) return;
    // Text overlays stack by `layer` rather than by track.
    if (selected.trackId === OVERLAY_TRACK) {
      const o = project.overlays.find((x) => x.id === selected.clipId);
      if (!o) return;
      get().apply((p) =>
        ops.setOverlayLayer(p, selected.clipId, (o.layer ?? 0) + dir),
      );
      return;
    }
    const visual = (project.tracks ?? []).filter((t) => t.kind === "visual");
    const fromIdx = visual.findIndex((t) => t.id === selected.trackId);
    if (fromIdx < 0) return; // audio clips don't layer (yet)
    const targetIdx = fromIdx + dir;
    if (targetIdx < 0) return;
    let np = project;
    let toId: string;
    if (targetIdx >= visual.length) {
      toId = newId("trk");
      np = ops.addTrack(np, "visual", toId);
    } else {
      toId = visual[targetIdx].id;
    }
    np = ops.pruneEmptyTracks(
      ops.moveClipToTrack(np, selected.trackId, toId, selected.clipId),
    );
    const { projectId, name, posterUri, mediaDurations } = get();
    set({ project: np, selected: { trackId: toId, clipId: selected.clipId } });
    if (projectId)
      saveProject({
        id: projectId,
        name,
        updatedAt: Date.now(),
        project: np,
        posterUri,
        mediaDurations,
      });
  },

  togglePiP: () => {
    const { selected, project } = get();
    if (!selected || !project) return;
    const track = ops.findTrack(project, selected.trackId);
    if (!track || track.kind !== "visual") return;
    const clip = track.clips.find((c) => c.id === selected.clipId);
    if (!clip) return;
    const r = clip.rect;
    const isPip = !!r && (r.w < 0.99 || r.h < 0.99 || r.x > 0.01 || r.y > 0.01);
    get().apply((p) =>
      ops.setClipRect(
        p,
        selected.trackId,
        selected.clipId,
        isPip ? FULL_FRAME : DEFAULT_PIP,
      ),
    );
  },

  setRatio: (width, height) =>
    get().apply((p) => ops.setProjectRatio(p, width, height)),

  setHdr: (hdr) => get().apply((p) => ({ ...p, hdr })),

  setName: (name) => {
    const clean = name.trim() || "Untitled";
    set({ name: clean });
    const { projectId, project, posterUri, mediaDurations } = get();
    if (projectId && project)
      saveProject({
        id: projectId,
        name: clean,
        updatedAt: Date.now(),
        project,
        posterUri,
        mediaDurations,
      });
  },

  setSourceDims: (width, height) => set({ sourceDims: { width, height } }),
}));

/**
 * The clip an effect (filter/speed/...) should target: the selected visual clip
 * if there is one, otherwise the base track's clip at the playhead.
 */
export function effectsTarget(): {
  trackId: string;
  clipId: string;
  clip: VisualTrackClip;
} | null {
  const { selected, project, playheadSec } = useEditor.getState();
  const tracks = project?.tracks ?? [];
  if (selected) {
    const tr = tracks.find((t) => t.id === selected.trackId);
    if (tr && tr.kind === "visual") {
      const clip = tr.clips.find((c) => c.id === selected.clipId);
      if (clip) return { trackId: tr.id, clipId: clip.id, clip };
    }
  }
  const base = tracks.find((t) => t.kind === "visual");
  if (base && base.kind === "visual") {
    const clip = ops.clipAtTime(base, playheadSec) as
      | VisualTrackClip
      | undefined;
    if (clip) return { trackId: base.id, clipId: clip.id, clip };
  }
  return null;
}

/** The selected text overlay (caption), or null when the selection isn't text. */
export function selectedOverlay(): TextOverlay | null {
  const { selected, project } = useEditor.getState();
  if (!selected || selected.trackId !== OVERLAY_TRACK) return null;
  return (
    (project?.overlays ?? []).find((o) => o.id === selected.clipId) ?? null
  );
}
