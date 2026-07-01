/**
 * Editor state (zustand) for the multi-track model. Holds the project being
 * edited + transient UI state (selection by track+clip, playhead, zoom,
 * playback) and the screen router. Mutations run pure `editor-ops` over
 * `project.tracks` and persist the result.
 */
import { create } from 'zustand';
import { DEFAULT_SERVER } from '../constants';
import { createProject, projectDuration } from '../model/project';
import * as ops from '../model/editor-ops';
import { MIN_CLIP, newId } from '../model/editor-ops';
import { FULL_FRAME, type AudioTrackClip, type BlendMode, type ChromaKey, type ClipFilter, type ClipMask, type ExportOutput, type Keyframe, type Motion, type Rect, type TextOverlay, type Transition, type VideoProject, type VisualTrackClip, type VolumePoint } from '../model/types';

/** Sentinel track id for the text/caption lane (overlays live on project.overlays, not tracks). */
export const OVERLAY_TRACK = '__overlays__';

const DEFAULT_PIP: Rect = { x: 0.52, y: 0.06, w: 0.44, h: 0.3 };
import {
  deleteProject as deleteStored,
  listProjects,
  loadProject,
  saveProject,
  type StoredProject,
} from '../storage/projects';
import { saveUserTemplate, type StoredTemplate } from '../storage/templates';
import type { EditorTemplate } from '../templates';
import { loadSettings, saveSettings } from '../storage/settings';
import { exportProject, downloadToPhotos, type ExportProgress } from '../net/renderClient';
import { Alert, Share } from 'react-native';

function progressLabel(p: ExportProgress): string {
  return p.stage === 'uploading'
    ? `Uploading media ${p.current ?? 1}/${p.total ?? 1}…`
    : p.stage === 'rendering'
      ? 'Rendering on server…'
      : p.stage === 'downloading'
        ? 'Downloading…'
        : 'Saving…';
}

export type Screen = 'projects' | 'discover' | 'editor' | 'quick';
/** Editor sheets/panels — mirrors Vela's `panel` state machine. */
export type EditorPanel = 'insert' | 'settings' | 'filter' | 'audio' | 'prefs' | 'export' | 'editmenu' | 'textedit' | 'transition' | 'speed' | 'volume' | 'fx' | 'motion' | 'cutout' | 'trim' | 'keyframe' | 'opacity' | 'position' | 'mask' | 'voiceover' | 'blend' | 'curve' | 'library';
export interface EditorPrefs {
  mainTrack: 'Quick' | 'Pro';
  linkage: boolean;
  snapping: boolean;
  previewFps: number;
}
export interface Selection {
  trackId: string;
  clipId: string;
}

const DEFAULT_PX_PER_SEC = 40;

interface EditorState {
  screen: Screen;
  projects: StoredProject[];
  serverUrl: string;

  projectId: string | null;
  name: string;
  posterUri?: string;
  mediaDurations: Record<string, number>;
  /** Native dimensions of the first imported video (in-memory) — powers "Original" ratio. */
  sourceDims?: { width: number; height: number };
  project: VideoProject | null;
  selected: Selection | null;
  playheadSec: number;
  pxPerSec: number;
  isPlaying: boolean;
  /** Undo / redo history of project snapshots for the open project (not persisted). */
  past: VideoProject[];
  future: VideoProject[];

  // editor sheets + prefs + export
  panel: EditorPanel | null;
  prefs: EditorPrefs;
  exporting: boolean;
  exportMsg: string;

  // navigation / settings
  go: (screen: Screen) => void;
  refreshProjects: () => void;
  loadSettings: () => void;
  setServerUrl: (url: string) => void;
  newProject: (name: string, width: number, height: number) => void;
  /** Create + open a new project seeded from a built-in template. */
  newProjectFromTemplate: (tpl: EditorTemplate) => void;
  /** Create + open a new project cloned from a user-saved template. */
  newProjectFromStoredTemplate: (tpl: StoredTemplate) => void;
  /** Save the current project's structure as a reusable user template. */
  saveAsTemplate: () => void;
  openProject: (id: string) => void;
  removeProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  duplicateProject: (id: string) => void;
  setProjectFolder: (id: string, folder: string) => void;
  closeEditor: () => void;

  // transient UI
  select: (sel: Selection | null) => void;
  setPlayhead: (sec: number) => void;
  setZoom: (pxPerSec: number) => void;
  setPlaying: (v: boolean) => void;
  setPoster: (uri: string) => void;
  setMediaDuration: (src: string, sec: number) => void;
  setPanel: (panel: EditorPanel | null) => void;
  /** Undo / redo the last project mutation. */
  undo: () => void;
  redo: () => void;
  setPref: <K extends keyof EditorPrefs>(key: K, value: EditorPrefs[K]) => void;
  exportToPhotos: (output?: ExportOutput) => Promise<void>;
  shareExport: (output?: ExportOutput) => Promise<void>;

  // helpers
  mainTrackId: () => string | null;

  // mutations
  apply: (fn: (p: VideoProject) => VideoProject) => void;
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
  setClipStart: (trackId: string, clipId: string, start: number) => void;
  moveClipToTrack: (fromTrackId: string, toTrackId: string, clipId: string, start: number) => void;
  trimClip: (trackId: string, clipId: string, patch: { start?: number; trimIn?: number; duration?: number }) => void;
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
  /** Apply / clear a volume envelope on the selected clip (audio or video). */
  applyClipVolumeCurve: (curve: VolumePoint[] | undefined) => void;
  /** Set the project background (color / gradient / image). */
  applyBackground: (background: VideoProject['background']) => void;
  setSelectedSpeed: (speed: number) => void;
  setSelectedVolume: (volume: number) => void;
  setSelectedTransition: (transition: Transition | undefined) => void;
  moveSelectedLayer: (dir: 1 | -1) => void;
  togglePiP: () => void;
  setRatio: (width: number, height: number) => void;
  setName: (name: string) => void;
  setSourceDims: (width: number, height: number) => void;
}

// Undo history: coalesce a burst of mutations (e.g. a drag's per-frame updates)
// within this window into a single entry; cap total snapshots.
const HISTORY_COALESCE_MS = 450;
const HISTORY_MAX = 60;
let lastHistoryAt = 0;

export const useEditor = create<EditorState>((set, get) => ({
  screen: 'projects',
  projects: [],
  serverUrl: DEFAULT_SERVER,
  projectId: null,
  name: '',
  posterUri: undefined,
  mediaDurations: {},
  sourceDims: undefined,
  project: null,
  selected: null,
  playheadSec: 0,
  pxPerSec: DEFAULT_PX_PER_SEC,
  isPlaying: false,
  past: [],
  future: [],
  panel: null,
  prefs: { mainTrack: 'Quick', linkage: true, snapping: false, previewFps: 30 },
  exporting: false,
  exportMsg: '',

  go: (screen) => set({ screen }),
  refreshProjects: () => set({ projects: listProjects() }),
  loadSettings: () => set({ serverUrl: loadSettings().serverUrl }),
  setServerUrl: (url) => {
    const serverUrl = url.trim() || DEFAULT_SERVER;
    set({ serverUrl });
    saveSettings({ serverUrl });
  },

  newProject: (name, width, height) => {
    const id = newId('proj');
    const base = createProject({ id, width, height });
    const project: VideoProject = { ...base, schemaVersion: 2, tracks: ops.newProjectTracks() };
    saveProject({ id, name, updatedAt: Date.now(), project, mediaDurations: {} });
    set({
      projectId: id,
      name,
      posterUri: undefined,
      mediaDurations: {},
      sourceDims: undefined,
      project,
      selected: null,
      playheadSec: 0,
      isPlaying: false,
      pxPerSec: DEFAULT_PX_PER_SEC,
      past: [],
      future: [],
      panel: null,
      screen: 'editor',
    });
  },

  newProjectFromTemplate: (tpl) => {
    const id = newId('proj');
    const base = createProject({ id, width: tpl.width, height: tpl.height, background: tpl.background });
    const overlays = tpl.texts.map((o) => ({ ...o, id: newId('ov'), type: 'text' as const }));
    const project: VideoProject = { ...base, schemaVersion: 2, tracks: ops.newProjectTracks(), overlays };
    saveProject({ id, name: tpl.name, updatedAt: Date.now(), project, mediaDurations: {} });
    set({
      projectId: id,
      name: tpl.name,
      posterUri: undefined,
      mediaDurations: {},
      sourceDims: undefined,
      project,
      selected: null,
      playheadSec: 0,
      isPlaying: false,
      pxPerSec: DEFAULT_PX_PER_SEC,
      past: [],
      future: [],
      panel: null,
      screen: 'editor',
    });
  },

  newProjectFromStoredTemplate: (tpl) => {
    const id = newId('proj');
    const project: VideoProject = { ...JSON.parse(JSON.stringify(tpl.project)), id, schemaVersion: 2 };
    saveProject({ id, name: tpl.name, updatedAt: Date.now(), project, mediaDurations: {} });
    set({
      projectId: id,
      name: tpl.name,
      posterUri: undefined,
      mediaDurations: {},
      sourceDims: undefined,
      project,
      selected: null,
      playheadSec: 0,
      isPlaying: false,
      pxPerSec: DEFAULT_PX_PER_SEC,
      past: [],
      future: [],
      panel: null,
      screen: 'editor',
    });
  },

  saveAsTemplate: () => {
    const { project, name } = get();
    if (!project) return;
    saveUserTemplate({ id: newId('tpl'), name: `${name} (template)`, createdAt: Date.now(), project });
  },

  openProject: (id) => {
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
      playheadSec: 0,
      isPlaying: false,
      pxPerSec: DEFAULT_PX_PER_SEC,
      past: [],
      future: [],
      panel: null,
      screen: 'editor',
    });
  },

  removeProject: (id) => {
    deleteStored(id);
    set({ projects: listProjects() });
  },

  renameProject: (id, name) => {
    const stored = loadProject(id);
    if (!stored) return;
    const clean = name.trim() || 'Untitled';
    saveProject({ ...stored, name: clean, updatedAt: Date.now() });
    set({ projects: listProjects() });
    if (get().projectId === id) set({ name: clean });
  },

  setProjectFolder: (id, folder) => {
    const stored = loadProject(id);
    if (!stored) return;
    const f = folder.trim() || 'Default';
    saveProject({ ...stored, folder: f });
    set({ projects: listProjects() });
  },

  duplicateProject: (id) => {
    const stored = loadProject(id);
    if (!stored) return;
    const nid = newId('proj');
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

  closeEditor: () => set({ screen: 'projects', isPlaying: false, panel: null, projects: listProjects() }),

  select: (sel) => set({ selected: sel }),
  setPlayhead: (sec) => set({ playheadSec: Math.max(0, sec) }),
  setZoom: (pxPerSec) => set({ pxPerSec: Math.max(8, Math.min(400, pxPerSec)) }),
  setPlaying: (v) => set({ isPlaying: v }),
  setPoster: (uri) => {
    set({ posterUri: uri });
    const { projectId, name, project, mediaDurations } = get();
    if (projectId && project) saveProject({ id: projectId, name, updatedAt: Date.now(), project, posterUri: uri, mediaDurations });
  },
  setMediaDuration: (src, sec) => {
    const mediaDurations = { ...get().mediaDurations, [src]: sec };
    set({ mediaDurations });
    const { projectId, name, project, posterUri } = get();
    if (projectId && project) saveProject({ id: projectId, name, updatedAt: Date.now(), project, posterUri, mediaDurations });
  },

  setPanel: (panel) => set({ panel }),
  setPref: (key, value) => set((s) => ({ prefs: { ...s.prefs, [key]: value } })),

  exportToPhotos: async (output) => {
    const { project, serverUrl, exporting } = get();
    if (!project || exporting) return;
    const clipCount = (project.tracks ?? []).reduce((n, t) => n + t.clips.length, 0);
    if (clipCount === 0 && project.overlays.length === 0) {
      Alert.alert('Nothing to export', 'Import a clip first.');
      return;
    }
    set({ panel: null, exporting: true, exportMsg: 'Preparing…' });
    try {
      const url = await exportProject(serverUrl, project, (p) => set({ exportMsg: progressLabel(p) }), output);
      await downloadToPhotos(url, Date.now(), (p) => set({ exportMsg: progressLabel(p) }));
      set({ exporting: false });
      Alert.alert('Exported', 'Your video was saved to Photos.');
    } catch (e) {
      set({ exporting: false });
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  },

  shareExport: async (output) => {
    const { project, serverUrl, exporting } = get();
    if (!project || exporting) return;
    const clipCount = (project.tracks ?? []).reduce((n, t) => n + t.clips.length, 0);
    if (clipCount === 0 && project.overlays.length === 0) {
      Alert.alert('Nothing to share', 'Import a clip first.');
      return;
    }
    set({ panel: null, exporting: true, exportMsg: 'Preparing…' });
    try {
      const url = await exportProject(serverUrl, project, (p) => set({ exportMsg: progressLabel(p) }), output);
      const fileUri = await downloadToPhotos(url, Date.now(), (p) => set({ exportMsg: progressLabel(p) }));
      set({ exporting: false });
      await Share.share({ url: fileUri });
    } catch (e) {
      set({ exporting: false });
      Alert.alert('Share failed', e instanceof Error ? e.message : String(e));
    }
  },

  mainTrackId: () => get().project?.tracks?.find((t) => t.kind === 'visual')?.id ?? null,

  apply: (fn) => {
    const { project, projectId, name, posterUri, mediaDurations, past } = get();
    if (!project || !projectId) return;
    const next = fn(project);
    const now = Date.now();
    // Push the pre-mutation state, coalescing rapid successive mutations (drags).
    const coalesce = past.length > 0 && now - lastHistoryAt < HISTORY_COALESCE_MS;
    lastHistoryAt = now;
    set({ project: next, past: coalesce ? past : [...past, project].slice(-HISTORY_MAX), future: [] });
    saveProject({ id: projectId, name, updatedAt: Date.now(), project: next, posterUri, mediaDurations });
  },

  undo: () => {
    const { past, future, project, projectId, name, posterUri, mediaDurations } = get();
    if (!past.length || !project || !projectId) return;
    const previous = past[past.length - 1];
    lastHistoryAt = 0;
    set({ past: past.slice(0, -1), future: [...future, project], project: previous, selected: null });
    saveProject({ id: projectId, name, updatedAt: Date.now(), project: previous, posterUri, mediaDurations });
  },
  redo: () => {
    const { past, future, project, projectId, name, posterUri, mediaDurations } = get();
    if (!future.length || !project || !projectId) return;
    const upcoming = future[future.length - 1];
    lastHistoryAt = 0;
    set({ future: future.slice(0, -1), past: [...past, project], project: upcoming, selected: null });
    saveProject({ id: projectId, name, updatedAt: Date.now(), project: upcoming, posterUri, mediaDurations });
  },

  importVisual: (clips) => {
    const mainId = get().mainTrackId();
    if (!mainId) return;
    get().apply((p) => {
      let np = p;
      const main = ops.findTrack(np, mainId);
      let start = main ? ops.trackEnd(main) : 0;
      for (const c of clips) {
        np = ops.addVisualClip(np, mainId, { ...c, start });
        start += c.duration;
      }
      return np;
    });
  },

  importOverlay: (clips) => {
    const at = get().playheadSec;
    get().apply((p) => {
      let np = p;
      const trackId = newId('trk');
      np = ops.addTrack(np, 'visual', trackId);
      let start = at;
      for (const c of clips) {
        np = ops.addVisualClip(np, trackId, { ...c, start, rect: DEFAULT_PIP });
        start += c.duration;
      }
      return np;
    });
  },

  importAudio: (clip) => {
    get().apply((p) => {
      let np = p;
      const existing = (np.tracks ?? []).find((t) => t.kind === 'audio');
      let trackId: string;
      if (!existing) {
        trackId = newId('trk');
        np = ops.addTrack(np, 'audio', trackId);
      } else {
        trackId = existing.id;
      }
      const duration = clip.duration && clip.duration > 0 ? clip.duration : Math.max(5, projectDuration(np));
      return ops.addAudioClip(np, trackId, { ...clip, start: clip.start ?? 0, duration });
    });
  },

  addText: () => {
    const { project, playheadSec } = get();
    if (!project) return;
    const id = newId('txt');
    const overlay: TextOverlay = {
      id,
      type: 'text',
      text: 'Your text',
      start: playheadSec,
      end: playheadSec + 3,
      x: 0.5,
      y: 0.42,
      fontSize: Math.round(project.width * 0.07),
      color: '#ffffff',
      align: 'center',
      bold: true,
      animation: 'fade',
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

  addLayer: () => get().apply((p) => ops.addTrack(p, 'visual')),

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
    get().apply((p) => ops.splitClipAt(p, target!.trackId, target!.clipId, playheadSec));
  },

  duplicateSelected: () => {
    const { selected, project } = get();
    if (!selected || !project) return;
    if (selected.trackId === OVERLAY_TRACK) {
      const o = project.overlays.find((x) => x.id === selected.clipId);
      if (!o) return;
      const id = newId('txt');
      const dur = o.end - o.start;
      get().apply((p) => ops.addOverlay(p, { ...o, id, start: o.end, end: o.end + dur }));
      set({ selected: { trackId: OVERLAY_TRACK, clipId: id } });
      return;
    }
    const track = ops.findTrack(project, selected.trackId);
    const clip = track?.clips.find((c) => c.id === selected.clipId);
    if (!track || !clip) return;
    if (track.kind === 'visual') {
      const id = newId('v');
      get().apply((p) => ops.addVisualClip(p, track.id, { ...(clip as VisualTrackClip), id, start: clip.start + clip.duration }));
      set({ selected: { trackId: track.id, clipId: id } });
    } else {
      const id = newId('a');
      get().apply((p) => ops.addAudioClip(p, track.id, { ...(clip as AudioTrackClip), id, start: clip.start + clip.duration }));
      set({ selected: { trackId: track.id, clipId: id } });
    }
  },

  removeSelected: () => {
    const s = get().selected;
    if (!s) return;
    if (s.trackId === OVERLAY_TRACK) get().apply((p) => ops.removeOverlay(p, s.clipId));
    else get().apply((p) => ops.pruneEmptyTracks(ops.removeClip(p, s.trackId, s.clipId)));
    set({ selected: null });
  },

  setClipStart: (trackId, clipId, start) => {
    if (trackId === OVERLAY_TRACK) {
      get().apply((p) => {
        const o = p.overlays.find((x) => x.id === clipId);
        if (!o) return p;
        const s = Math.max(0, start);
        return ops.updateOverlay(p, clipId, { start: s, end: s + (o.end - o.start) });
      });
      return;
    }
    get().apply((p) => ops.setClipStart(p, trackId, clipId, start));
  },
  moveClipToTrack: (fromTrackId, toTrackId, clipId, start) =>
    get().apply((p) => ops.pruneEmptyTracks(ops.moveClipToTrack(p, fromTrackId, toTrackId, clipId, start))),
  trimClip: (trackId, clipId, patch) => {
    if (trackId === OVERLAY_TRACK) {
      get().apply((p) => {
        const o = p.overlays.find((x) => x.id === clipId);
        if (!o) return p;
        const start = patch.start !== undefined ? Math.max(0, patch.start) : o.start;
        const duration = Math.max(MIN_CLIP, patch.duration ?? o.end - o.start);
        return ops.updateOverlay(p, clipId, { start, end: start + duration });
      });
      return;
    }
    get().apply((p) => ops.trimClip(p, trackId, clipId, patch));
  },
  setClipRect: (trackId, clipId, rect) => get().apply((p) => ops.setClipRect(p, trackId, clipId, rect)),

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
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipMask(p, t.trackId, t.clipId, mask));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipBlend: (blend) => {
    const t = effectsTarget();
    if (!t) return;
    get().apply((p) => ops.setClipBlend(p, t.trackId, t.clipId, blend));
    set({ selected: { trackId: t.trackId, clipId: t.clipId } });
  },
  applyClipMotion: (motion) => {
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
    let target = s && s.trackId !== OVERLAY_TRACK ? { trackId: s.trackId, clipId: s.clipId } : null;
    if (!target) {
      const t = effectsTarget();
      if (t) target = { trackId: t.trackId, clipId: t.clipId };
    }
    if (!target) return;
    const tt = target;
    get().apply((p) => ops.setClipVolume(p, tt.trackId, tt.clipId, volume));
    set({ selected: tt });
  },
  applyClipVolumeCurve: (curve) => {
    const s = get().selected;
    let target = s && s.trackId !== OVERLAY_TRACK ? { trackId: s.trackId, clipId: s.clipId } : null;
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
    get().apply((p) => ops.setClipTransition(p, s.trackId, s.clipId, transition));
  },

  moveSelectedLayer: (dir) => {
    const { selected, project } = get();
    if (!selected || !project) return;
    const visual = (project.tracks ?? []).filter((t) => t.kind === 'visual');
    const fromIdx = visual.findIndex((t) => t.id === selected.trackId);
    if (fromIdx < 0) return; // audio clips don't layer (yet)
    const targetIdx = fromIdx + dir;
    if (targetIdx < 0) return;
    let np = project;
    let toId: string;
    if (targetIdx >= visual.length) {
      toId = newId('trk');
      np = ops.addTrack(np, 'visual', toId);
    } else {
      toId = visual[targetIdx].id;
    }
    np = ops.pruneEmptyTracks(ops.moveClipToTrack(np, selected.trackId, toId, selected.clipId));
    const { projectId, name, posterUri, mediaDurations } = get();
    set({ project: np, selected: { trackId: toId, clipId: selected.clipId } });
    if (projectId) saveProject({ id: projectId, name, updatedAt: Date.now(), project: np, posterUri, mediaDurations });
  },

  togglePiP: () => {
    const { selected, project } = get();
    if (!selected || !project) return;
    const track = ops.findTrack(project, selected.trackId);
    if (!track || track.kind !== 'visual') return;
    const clip = track.clips.find((c) => c.id === selected.clipId);
    if (!clip) return;
    const r = clip.rect;
    const isPip = !!r && (r.w < 0.99 || r.h < 0.99 || r.x > 0.01 || r.y > 0.01);
    get().apply((p) => ops.setClipRect(p, selected.trackId, selected.clipId, isPip ? FULL_FRAME : DEFAULT_PIP));
  },

  setRatio: (width, height) => get().apply((p) => ops.setProjectRatio(p, width, height)),

  setName: (name) => {
    const clean = name.trim() || 'Untitled';
    set({ name: clean });
    const { projectId, project, posterUri, mediaDurations } = get();
    if (projectId && project) saveProject({ id: projectId, name: clean, updatedAt: Date.now(), project, posterUri, mediaDurations });
  },

  setSourceDims: (width, height) => set({ sourceDims: { width, height } }),
}));

/**
 * The clip an effect (filter/speed/...) should target: the selected visual clip
 * if there is one, otherwise the base track's clip at the playhead.
 */
export function effectsTarget(): { trackId: string; clipId: string; clip: VisualTrackClip } | null {
  const { selected, project, playheadSec } = useEditor.getState();
  const tracks = project?.tracks ?? [];
  if (selected) {
    const tr = tracks.find((t) => t.id === selected.trackId);
    if (tr && tr.kind === 'visual') {
      const clip = tr.clips.find((c) => c.id === selected.clipId);
      if (clip) return { trackId: tr.id, clipId: clip.id, clip };
    }
  }
  const base = tracks.find((t) => t.kind === 'visual');
  if (base && base.kind === 'visual') {
    const clip = ops.clipAtTime(base, playheadSec) as VisualTrackClip | undefined;
    if (clip) return { trackId: base.id, clipId: clip.id, clip };
  }
  return null;
}
