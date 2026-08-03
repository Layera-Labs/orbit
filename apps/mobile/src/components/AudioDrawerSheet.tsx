/** Persistent source drawer for music and audio timeline lanes. */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { BUNDLED_SFX } from "../content/assets";
import { SFX, type SfxItem } from "../content/catalog";
import { addBundledSfx, addCcItem } from "../content/library";
import type { CcCategory, CcItem } from "../content/openverse";
import { useCcSearch } from "../content/useCcSearch";
import { font, vela } from "../constants";
import { newId } from "../model/editor-ops";
import {
  addAudioHistory,
  loadAudioHistory,
  type AudioLibraryRecord,
} from "../storage/audioHistory";
import { copyIntoMedia, extFromUri } from "../storage/media";
import { formatDuration } from "../format/duration";
import { useEditor } from "../store/editorStore";
import { BottomSheet } from "./BottomSheet";
import { VIcon, type VIconName } from "./VIcon";
import { AI_GRADIENT, useAiLabelStyle, useAiShimmer } from "./aiShimmer";

type AudioTab =
  | "music"
  | "upload"
  | "ai"
  | "record"
  | "soundfx"
  | "stock"
  | "library";

type AudioUpload = {
  id: string;
  name: string;
  progress: number;
  status: "preparing" | "ready" | "failed";
  record?: AudioLibraryRecord;
};

type ProjectAudio = {
  id: string;
  name: string;
  url: string;
  durationSec: number;
};

type AudioSelection =
  | { type: "record"; id: string; record: AudioLibraryRecord }
  | { type: "project"; id: string; item: ProjectAudio }
  | { type: "sfx"; id: string; item: SfxItem }
  | { type: "cc"; id: string; item: CcItem };


/*
 * The same spine as the media drawer — Upload · Stock · AI, Library last — with
 * the three sources only audio has sitting between AI and Library. Two rails
 * that share four of their entries must not order those four differently; that
 * is how muscle memory built in one sheet misfires in the other.
 */
const AUDIO_TABS: Array<{
  key: AudioTab;
  label: string;
  icon: VIconName;
  color: string;
  gradient?: string[];
}> = [
  { key: "upload", label: "Upload", icon: "export", color: "#2f7bff" },
  /*
   * `grid`, not `gutterAudio` — that glyph is the same note as Music's, and
   * with Stock at 2 and Music at 4 the two sat in one glance wearing the same
   * mark. A rail is a legend; two entries that draw the same thing is the one
   * thing it may not do. A grid also says what this tab is: a catalogue to
   * browse, rather than another shelf of notes.
   */
  { key: "stock", label: "Stock", icon: "grid", color: "#e84da0" },
  { key: "ai", label: "AI", icon: "fx", color: "#a44cf2", gradient: AI_GRADIENT },
  { key: "music", label: "Music", icon: "audio", color: "#5b4bff" },
  { key: "record", label: "Record", icon: "record", color: "#15b8a6" },
  { key: "soundfx", label: "Sound FX", icon: "soundfx", color: "#f39b3f" },
  { key: "library", label: "Library", icon: "templates", color: "#8b5cf6" },
];

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function AudioDrawerSheet() {
  const project = useEditor((state) => state.project);
  const playheadSec = useEditor((state) => state.playheadSec);
  const importAudio = useEditor((state) => state.importAudio);
  const setPanel = useEditor((state) => state.setPanel);
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  /*
   * Which row this player is currently auditioning. There is one player for the
   * whole drawer, so without this the rows have no way to know that any of them
   * is playing — which is why every one of them used to show a play glyph while
   * audio came out of the speaker.
   */
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [tab, setTab] = useState<AudioTab>("upload");
  /*
   * One clock for the AI mark and its label, created here rather than inside
   * each so the light crosses both together. `tab === "ai"` is safe to read
   * outside the rail's map because exactly one entry carries a gradient.
   */
  const shimmer = useAiShimmer();
  const aiLabel = useAiLabelStyle(shimmer, tab === "ai");
  const [records, setRecords] = useState<AudioLibraryRecord[]>(() =>
    loadAudioHistory(),
  );
  const [uploads, setUploads] = useState<AudioUpload[]>([]);
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [adding, setAdding] = useState(false);

  const projectAudio: ProjectAudio[] = (project?.tracks ?? [])
    .filter((track) => track.kind === "audio")
    .flatMap((track, trackIndex) =>
      track.clips.map((clip, clipIndex) => ({
        id: `project-${track.id}-${clip.id}`,
        name: `Timeline audio ${trackIndex + 1}.${clipIndex + 1}`,
        url: clip.src,
        durationSec: clip.duration,
      })),
    );

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      try {
        player.remove();
      } catch {}
    };
    // The player instance is stable for the drawer lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUpload = (id: string, patch: Partial<AudioUpload>) => {
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const chooseAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled || !result.assets?.length) return;

    setTab("upload");
    const queued: AudioUpload[] = result.assets.map((asset, index) => ({
      id: `audio-up-${Date.now().toString(36)}-${index}`,
      name: asset.name || `Audio ${index + 1}`,
      progress: 0.08,
      status: "preparing",
    }));
    setUploads((current) => [...queued, ...current]);

    await Promise.all(
      result.assets.map(async (asset, index) => {
        const pending = queued[index];
        try {
          await wait(80);
          updateUpload(pending.id, { progress: 0.32 });
          const extension = extFromUri(asset.name || asset.uri, "m4a");
          const stableUrl = copyIntoMedia(asset.uri, extension);
          updateUpload(pending.id, { progress: 0.72 });
          await wait(110);
          const next = addAudioHistory({
            name: pending.name,
            url: stableUrl,
            source: "upload",
          });
          const record = next[0];
          setRecords(next);
          updateUpload(pending.id, {
            progress: 1,
            status: "ready",
            record,
          });
        } catch (error) {
          updateUpload(pending.id, { progress: 1, status: "failed" });
          Alert.alert(
            "Audio import failed",
            error instanceof Error ? error.message : String(error),
          );
        }
      }),
    );
  };

  /*
   * Audition a row, or stop the one already auditioning.
   *
   * The old version was `replace / seekTo(0) / play` with no state written at
   * all, so a tap started audio you then had no way to stop, and tapping the
   * same row again just restarted it.
   */
  const preview = (id: string, source: string | number) => {
    try {
      if (playingId === id) {
        player.pause();
        setPlayingId(null);
        return;
      }
      player.replace(source);
      player.seekTo(0);
      player.play();
      setPlayingId(id);
    } catch {
      setPlayingId(null);
    }
  };

  /*
   * Let the player have the last word. It stops on its own at the end of a
   * track, and `replace` can fail to load a file that has gone missing — in
   * both cases the row would otherwise keep showing a pause button for audio
   * nobody can hear.
   */
  useEffect(() => {
    if (!playingId) return;
    if (status.didJustFinish || (status.isLoaded && !status.playing)) {
      setPlayingId(null);
    }
  }, [playingId, status.didJustFinish, status.isLoaded, status.playing]);

  /** How far through the auditioned track we are, 0–1. Real, not decorative. */
  const previewProgress =
    status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  const addSelected = async () => {
    if (!selection || adding) return;
    setAdding(true);
    try {
      if (selection.type === "sfx") {
        await addBundledSfx(BUNDLED_SFX[selection.item.id], selection.item.dur);
      } else if (selection.type === "cc") {
        /*
         * A stock item is a remote url, so this one downloads before it can be
         * placed — `addCcItem` owns that, and the history write with it, so the
         * Library tab has the track the moment this returns. It answers false
         * rather than throwing when the download fails, and the clip editor
         * must not be opened on a clip that was never added.
         */
        if (!(await addCcItem(selection.item))) return;
        setRecords(loadAudioHistory());
      } else {
        const item =
          selection.type === "record" ? selection.record : selection.item;
        importAudio({
          id: newId("a"),
          src: item.url,
          start: playheadSec,
          duration: item.durationSec ?? 0,
          // Full, like the other two insert paths (bundled SFX and voiceover).
          // This one used to arrive at 0.85 for no stated reason, so the same
          // file was quieter depending on which drawer you found it in.
          volume: 1,
        });
      }
      setSelection(null);
      /*
       * Hand the new clip its own editor rather than just closing. `importAudio`
       * selects what it added, so the sheet opens on the right clip — and the
       * 260ms in `replaceDrawer` is there because RN otherwise leaves this
       * Modal on top of the one replacing it.
       */
      replaceDrawer(() => setPanel("audioclip"));
    } catch (error) {
      Alert.alert(
        "Could not add audio",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setAdding(false);
    }
  };

  const selectedId = selection?.id;
  const replaceDrawer = (open: () => void) => {
    setPanel(null);
    setTimeout(open, 260);
  };

  return (
    <BottomSheet
      onClose={() => setPanel(null)}
      style={styles.sheet}
      dim="#0006"
    >
      <View style={styles.handle} />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Add music</Text>
          <Text style={styles.subtitle}>
            Preview a source, then add it at the playhead.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close music drawer"
          onPress={() => setPanel(null)}
          hitSlop={10}
          style={styles.closeButton}
        >
          <VIcon name="close" size={18} color={vela.ink2} />
        </Pressable>
      </View>

      <View style={styles.workspace}>
        <View style={styles.rail}>
          {AUDIO_TABS.map((item) => {
            const active = item.key === tab;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setTab(item.key);
                  setSelection(null);
                }}
                style={[
                  styles.railItem,
                  active && { backgroundColor: `${item.color}14` },
                ]}
              >
                {active ? (
                  <View
                    style={[
                      styles.railIndicator,
                      { backgroundColor: item.color },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.railIcon,
                    {
                      backgroundColor: active
                        ? `${item.color}1c`
                        : vela.lightCard,
                    },
                  ]}
                >
                  <VIcon
                    name={item.icon}
                    size={18}
                    color={active ? item.color : vela.lightMuted}
                    sweep={item.gradient ? shimmer : undefined}
                    // Rides whether or not the tab is selected — that IS the
                    // highlight. On selection only, it would be a second
                    // selected-state rather than a mark that stands out.
                    gradient={item.gradient}
                  />
                </View>
                {/*
                  * The one animated label in the rail. `railLabel` still sets
                  * the type; only the colour travels, and the flat `item.color`
                  * rule is dropped for this entry because the animated style
                  * owns that channel for both states.
                  */}
                {item.gradient ? (
                  <Animated.Text
                    style={[styles.railLabel, aiLabel]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Animated.Text>
                ) : (
                  <Text
                    style={[styles.railLabel, active && { color: item.color }]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <Animated.View
          key={tab}
         
         
          style={styles.panel}
        >
          {tab === "music" ? (
            <MusicPanel
              records={records}
              projectAudio={projectAudio}
              selectedId={selectedId}
              playingId={playingId}
              progress={previewProgress}
              onUpload={chooseAudio}
              onPreview={preview}
              onSelect={setSelection}
            />
          ) : tab === "upload" ? (
            <UploadPanel
              uploads={uploads}
              records={records}
              selectedId={selectedId}
              playingId={playingId}
              progress={previewProgress}
              onUpload={chooseAudio}
              onPreview={preview}
              onSelect={setSelection}
            />
          ) : tab === "ai" ? (
            <ActionPanel
              icon="fx"
              title="Create with AI"
              detail="Generate music, voice, and sound ideas in AI Studio."
              action="Open AI Studio"
              onAction={() => replaceDrawer(() => setPanel("ai"))}
            />
          ) : tab === "record" ? (
            <ActionPanel
              icon="record"
              title="Record audio"
              detail="Capture a voiceover from the current playhead position."
              action="Start recording"
              onAction={() => replaceDrawer(() => setPanel("voiceover"))}
            />
          ) : tab === "soundfx" ? (
            <SfxPanel
              title="Sound effects"
              items={SFX}
              selectedId={selectedId}
              playingId={playingId}
              progress={previewProgress}
              onPreview={(item) => preview(item.id, BUNDLED_SFX[item.id])}
              onSelect={setSelection}
            />
          ) : tab === "stock" ? (
            <CcAudioPanel
              selectedId={selectedId}
              playingId={playingId}
              progress={previewProgress}
              onPreview={preview}
              onSelect={setSelection}
            />
          ) : (
            <LibraryPanel
              records={records}
              selectedId={selectedId}
              playingId={playingId}
              progress={previewProgress}
              onUpload={chooseAudio}
              onPreview={preview}
              onSelect={setSelection}
            />
          )}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHint}>
          {selection ? "Ready to add" : "Select an audio preview"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add audio to timeline"
          disabled={!selection || adding}
          onPress={addSelected}
          style={[
            styles.addButton,
            (!selection || adding) && styles.addButtonDisabled,
          ]}
        >
          {adding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <VIcon name="plus" size={16} color="#fff" />
          )}
          <Text style={styles.addButtonText}>
            {adding ? "Adding…" : "Add to timeline"}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function PanelHeading({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.panelHeading}>
      <View style={{ flex: 1 }}>
        <Text style={styles.panelTitle}>{title}</Text>
        {subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          hitSlop={8}
        >
          <Text style={styles.panelAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * What every row needs to know about the drawer's single shared player: which
 * row it is auditioning, how far through, and how to start or stop one.
 */
interface PreviewProps {
  playingId: string | null;
  progress: number;
  onPreview: (id: string, source: string) => void;
}

function MusicPanel({
  records,
  projectAudio,
  selectedId,
  playingId,
  progress,
  onUpload,
  onPreview,
  onSelect,
}: PreviewProps & {
  records: AudioLibraryRecord[];
  projectAudio: ProjectAudio[];
  selectedId?: string;
  onUpload: () => void;
  onSelect: (selection: AudioSelection) => void;
}) {
  const recent = records.slice(0, 5);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.panelScroll}
    >
      <PanelHeading title="Music" action="Upload" onAction={onUpload} />
      {recent.length === 0 && projectAudio.length === 0 ? (
        <ActionPanel
          icon="audio"
          title="Add your first track"
          detail="Upload music or choose a sound from the source rail."
          action="Choose audio"
          onAction={onUpload}
        />
      ) : (
        <>
          {recent.length > 0 ? (
            <Text style={styles.microTitle}>Recent</Text>
          ) : null}
          {recent.map((record, index) => (
            <AudioRow
              key={record.id}
              index={index}
              name={record.name}
              meta="Uploaded"
              selected={selectedId === record.id}
              playing={playingId === record.id}
              progress={progress}
              onPreview={() => onPreview(record.id, record.url)}
              onPress={() =>
                onSelect({ type: "record", id: record.id, record })
              }
            />
          ))}
          {projectAudio.length > 0 ? (
            <Text style={styles.microTitle}>In this project</Text>
          ) : null}
          {projectAudio.map((item, index) => (
            <AudioRow
              key={item.id}
              index={index + recent.length}
              name={item.name}
              meta={formatDuration(item.durationSec)}
              selected={selectedId === item.id}
              playing={playingId === item.id}
              progress={progress}
              onPreview={() => onPreview(item.id, item.url)}
              onPress={() => onSelect({ type: "project", id: item.id, item })}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function UploadPanel({
  uploads,
  records,
  selectedId,
  playingId,
  progress,
  onUpload,
  onPreview,
  onSelect,
}: PreviewProps & {
  uploads: AudioUpload[];
  records: AudioLibraryRecord[];
  selectedId?: string;
  onUpload: () => void;
  onSelect: (selection: AudioSelection) => void;
}) {
  const queuedIds = new Set(
    uploads.map((item) => item.record?.id).filter(Boolean),
  );
  const older = records
    .filter((record) => !queuedIds.has(record.id))
    .slice(0, 8);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.panelScroll}
    >
      <PanelHeading title="Upload" action="Choose audio" onAction={onUpload} />
      {uploads.length === 0 && older.length === 0 ? (
        <ActionPanel
          icon="export"
          title="Upload from Files"
          detail="The picker returns here with progress and a reusable track."
          action="Choose audio"
          onAction={onUpload}
        />
      ) : (
        <>
          {uploads.map((item, index) =>
            item.status === "ready" && item.record ? (
              <AudioRow
                key={item.id}
                index={index}
                name={item.name}
                meta="Ready"
                selected={selectedId === item.record.id}
                playing={playingId === item.record.id}
                progress={progress}
                onPreview={() => onPreview(item.record!.id, item.record!.url)}
                onPress={() =>
                  onSelect({
                    type: "record",
                    id: item.record!.id,
                    record: item.record!,
                  })
                }
              />
            ) : (
              <UploadProgressRow key={item.id} item={item} />
            ),
          )}
          {older.map((record, index) => (
            <AudioRow
              key={record.id}
              index={index + uploads.length}
              name={record.name}
              meta="Uploaded"
              selected={selectedId === record.id}
              playing={playingId === record.id}
              progress={progress}
              onPreview={() => onPreview(record.id, record.url)}
              onPress={() =>
                onSelect({ type: "record", id: record.id, record })
              }
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function LibraryPanel({
  records,
  selectedId,
  playingId,
  progress,
  onUpload,
  onPreview,
  onSelect,
}: PreviewProps & {
  records: AudioLibraryRecord[];
  selectedId?: string;
  onUpload: () => void;
  onSelect: (selection: AudioSelection) => void;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.panelScroll}
    >
      <PanelHeading title="Audio library" action="Upload" onAction={onUpload} />
      {records.length === 0 ? (
        <ActionPanel
          icon="templates"
          title="Library is empty"
          detail="Uploaded tracks are saved here for every project."
          action="Upload audio"
          onAction={onUpload}
        />
      ) : (
        records.map((record, index) => (
          <AudioRow
            key={record.id}
            index={index}
            name={record.name}
            meta={record.source === "upload" ? "Upload" : record.source}
            selected={selectedId === record.id}
            playing={playingId === record.id}
            progress={progress}
            onPreview={() => onPreview(record.id, record.url)}
            onPress={() => onSelect({ type: "record", id: record.id, record })}
          />
        ))
      )}
    </ScrollView>
  );
}

function SfxPanel({
  title,
  subtitle,
  items,
  selectedId,
  playingId,
  progress,
  onPreview,
  onSelect,
}: Omit<PreviewProps, "onPreview"> & {
  title: string;
  subtitle?: string;
  items: SfxItem[];
  selectedId?: string;
  /** Bundled effects are `require`d modules, not urls, so the row hands back
   *  the item and the drawer resolves it. */
  onPreview: (item: SfxItem) => void;
  onSelect: (selection: AudioSelection) => void;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.panelScroll}
    >
      <PanelHeading title={title} subtitle={subtitle} />
      {items.map((item, index) => {
        const id = `sfx-${item.id}`;
        return (
          <AudioRow
            key={item.id}
            index={index}
            name={item.label}
            meta={formatDuration(item.dur)}
            selected={selectedId === id}
            // The drawer keys playback by the bare `item.id`; `id` above carries
            // an "sfx-" prefix because selection ids share one namespace.
            playing={playingId === item.id}
            progress={progress}
            onPreview={() => onPreview(item)}
            onPress={() => onSelect({ type: "sfx", id, item })}
          />
        );
      })}
    </ScrollView>
  );
}

/**
 * Stock: CC0 music and sound, auditioned before it is added.
 *
 * This tab used to be `SFX.slice(0, 8)` — the first eight of the same bundled
 * effects the Sound FX tab already shows, under a heading that called them
 * "Stock audio". Two tabs, one pack, and nothing about the word "stock" was
 * true. It is Openverse now, filtered to `license=cc0` (see
 * `content/openverse.ts`), which needs no API key and so has content in it on a
 * fresh install.
 *
 * Music and Sound are the same corpus split by LENGTH, not by category —
 * Openverse reports no category at all for the Freesound records that make up
 * every CC0 track, so `category=music` returns nothing and reads exactly like
 * "there is no CC0 music". The reason lives in `openverse.ts`; what matters
 * here is that the two chips are a real distinction and not a label.
 *
 * Auditioning streams the remote url straight into the drawer's one shared
 * player, so nothing is downloaded until it is actually chosen.
 */
function CcAudioPanel({
  selectedId,
  playingId,
  progress,
  onPreview,
  onSelect,
}: PreviewProps & {
  selectedId?: string;
  onSelect: (selection: AudioSelection) => void;
}) {
  const { category, setCategory, query, setQuery, submit, items, loading, error } =
    useCcSearch("music");

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.panelScroll}
    >
      <PanelHeading
        title="Stock"
        subtitle="Public domain (CC0) · free to use, no credit needed"
      />
      <View style={styles.ccControls}>
        {CC_AUDIO_KINDS.map((k) => (
          <Pressable
            key={k.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: category === k.key }}
            onPress={() => setCategory(k.key)}
            style={[styles.ccChip, category === k.key && styles.ccChipOn]}
          >
            <Text
              style={[
                styles.ccChipText,
                category === k.key && { color: vela.accent },
              ]}
            >
              {k.label}
            </Text>
          </Pressable>
        ))}
        <TextInput
          style={styles.ccInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          returnKeyType="search"
          placeholder="Search…"
          placeholderTextColor={vela.lightMuted}
          autoCapitalize="none"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search stock audio"
          onPress={submit}
          style={styles.ccSearchButton}
        >
          <VIcon name="search" size={15} color={vela.onAccent} />
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.ccError}>{error}</Text>
      ) : loading ? (
        <View style={styles.ccBusy}>
          <ActivityIndicator color={vela.accent} />
        </View>
      ) : !items.length ? (
        <Text style={styles.emptyDetail}>
          Nothing found for that. Try another word.
        </Text>
      ) : (
        items.map((item, index) => {
          // Selection ids share one namespace across every panel in the drawer;
          // playback is keyed by the bare id, as it is for the bundled effects.
          const id = `cc-${item.id}`;
          return (
            <AudioRow
              key={item.id}
              index={index}
              name={item.title}
              meta={`${formatDuration(item.durationSec ?? 0)} · ${item.creator || "Unknown"}`}
              verbatimMeta
              selected={selectedId === id}
              playing={playingId === item.id}
              progress={progress}
              onPreview={() => onPreview(item.id, item.url)}
              onPress={() => onSelect({ type: "cc", id, item })}
            />
          );
        })
      )}
    </ScrollView>
  );
}

const CC_AUDIO_KINDS: { key: CcCategory; label: string }[] = [
  { key: "music", label: "Music" },
  { key: "audio", label: "Sound" },
];

function ActionPanel({
  icon,
  title,
  detail,
  action,
  onAction,
}: {
  icon: VIconName;
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Animated.View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <VIcon name={icon} size={24} color={vela.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action}
        onPress={onAction}
        style={styles.emptyAction}
      >
        <Text style={styles.emptyActionText}>{action}</Text>
      </Pressable>
    </Animated.View>
  );
}

function AudioRow({
  index,
  name,
  meta,
  verbatimMeta,
  selected,
  playing,
  progress,
  onPreview,
  onPress,
}: {
  index: number;
  name: string;
  meta: string;
  /**
   * Leave `meta` exactly as given. The row title-cases it by default, which
   * suits "upload · 0:12" and does not suit a person's handle — `larval1977`
   * is not `Larval1977`, and a credit line that edits the name is not a credit.
   */
  verbatimMeta?: boolean;
  selected: boolean;
  playing: boolean;
  progress: number;
  onPreview: () => void;
  onPress: () => void;
}) {
  return (
    <Animated.View
     
     
      style={[styles.audioRow, selected && styles.audioRowSelected]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? `Stop ${name}` : `Preview ${name}`}
        accessibilityState={{ selected: playing }}
        onPress={onPreview}
        hitSlop={5}
        style={styles.playButton}
      >
        <VIcon name={playing ? "pause" : "play"} size={13} color={vela.accent} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${meta}`}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={styles.audioSelect}
      >
        <View style={styles.audioCopy}>
          <Text style={styles.audioName} numberOfLines={1}>
            {name}
          </Text>
          <Text
            style={[styles.audioMeta, verbatimMeta && styles.audioMetaVerbatim]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        </View>
        <Waveform playing={playing} progress={progress} />
        {selected ? (
          <View style={styles.selectedBadge}>
            <VIcon name="check" size={11} color="#fff" />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function UploadProgressRow({ item }: { item: AudioUpload }) {
  return (
    <Animated.View style={styles.uploadRow}>
      {item.status === "failed" ? (
        <VIcon name="close" size={18} color={vela.danger} />
      ) : (
        <ActivityIndicator color={vela.accent} size="small" />
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.uploadCopyRow}>
          <Text style={styles.audioName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.progressLabel}>
            {item.status === "failed"
              ? "Failed"
              : `${Math.round(item.progress * 100)}%`}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(item.progress * 100)}%` },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * The bars beside a row.
 *
 * One fixed shape for every row, deliberately. We cannot read a file's real
 * peaks here — expo-audio exposes no PCM — and giving each row a different
 * made-up shape would look like information while being decoration.
 *
 * What IS real is the colour split: while a row is auditioning, bars behind the
 * playhead take the accent and the rest stay muted, so the movement reports
 * actual position rather than just wiggling. The heights animate on top of that
 * to read as level.
 */
const WAVE_BARS = [8, 15, 11, 20, 14, 18, 9, 16, 12];

function Waveform({
  playing,
  progress,
}: {
  playing: boolean;
  progress: number;
}) {
  return (
    <View style={styles.waveform}>
      {WAVE_BARS.map((height, index) => (
        <WaveBar
          key={index}
          height={height}
          index={index}
          playing={playing}
          // Bars are lit left-to-right as playback advances.
          played={playing && progress > index / WAVE_BARS.length}
        />
      ))}
    </View>
  );
}

function WaveBar({
  height,
  index,
  playing,
  played,
}: {
  height: number;
  index: number;
  playing: boolean;
  played: boolean;
}) {
  /*
   * Rests at 1, i.e. full height. The bars are on screen and readable whether or
   * not this animation ever runs — the design rule is that motion may only move
   * something already visible, never decide whether it exists.
   */
  const scale = useSharedValue(1);

  useEffect(() => {
    if (playing) {
      // Each bar gets its own period, so the row reads as a level meter rather
      // than nine bars bouncing in lockstep.
      scale.value = withRepeat(
        withTiming(0.45, {
          duration: 380 + index * 43,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 160 });
    }
    return () => cancelAnimation(scale);
  }, [playing, index, scale]);

  const animated = useAnimatedStyle(() => ({ height: height * scale.value }));

  return (
    <Animated.View
      style={[
        styles.waveBar,
        played ? styles.waveBarPlayed : null,
        { height },
        animated,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    height: "72%",
    backgroundColor: vela.lightCard,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 10,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: vela.lightMuted3,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 21 },
  subtitle: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 11.5,
    marginTop: 2,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  workspace: { flex: 1, flexDirection: "row", minHeight: 0 },
  rail: {
    width: 72,
    backgroundColor: vela.lightSurface,
    borderRadius: 18,
    padding: 4,
    gap: 2,
    justifyContent: "space-between",
  },
  railItem: {
    minHeight: 49,
    flex: 1,
    maxHeight: 57,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    overflow: "hidden",
  },
  railIndicator: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
  },
  railIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  railLabel: {
    color: vela.lightMuted,
    fontFamily: font.semibold,
    fontSize: 8.5,
  },
  panel: { flex: 1, paddingLeft: 10, minWidth: 0 },
  panelScroll: { paddingBottom: 12, gap: 8 },
  panelHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 31,
    gap: 8,
  },
  panelTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 15 },
  panelSubtitle: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 9.5,
    marginTop: 1,
  },
  panelAction: { color: vela.accent, fontFamily: font.bold, fontSize: 11.5 },
  microTitle: {
    color: vela.lightMuted,
    fontFamily: font.bold,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginTop: 2,
  },
  audioRow: {
    minHeight: 58,
    borderRadius: 13,
    backgroundColor: vela.lightSurface,
    borderWidth: 1.5,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    padding: 7,
    gap: 8,
  },
  audioRowSelected: {
    borderColor: vela.accent,
    backgroundColor: vela.accentSoft,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: vela.lightCard,
    alignItems: "center",
    justifyContent: "center",
  },
  audioSelect: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  audioCopy: { flex: 1, minWidth: 74 },
  audioName: { color: vela.ink2, fontFamily: font.bold, fontSize: 11.5 },
  audioMeta: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 9.5,
    marginTop: 2,
    textTransform: "capitalize",
  },
  audioMetaVerbatim: { textTransform: "none" },
  /*
   * The Stock controls: two category chips, a field and a search button, on one
   * line. `flexWrap` because "Music" and "Sound" plus a usable field do not fit
   * across a 320pt sheet, and a field clipped by the edge is worse than one on
   * a second row.
   */
  ccControls: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  ccChip: {
    paddingHorizontal: 11,
    height: 30,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  ccChipOn: { backgroundColor: vela.accentSoft },
  ccChipText: { color: vela.ink2, fontFamily: font.bold, fontSize: 11.5 },
  ccInput: {
    flexGrow: 1,
    flexBasis: 110,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: vela.lightSurface,
    color: vela.ink,
    fontFamily: font.medium,
    fontSize: 11.5,
  },
  ccSearchButton: {
    width: 34,
    height: 30,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ccBusy: { height: 96, alignItems: "center", justifyContent: "center" },
  ccError: {
    color: vela.danger,
    fontFamily: font.medium,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 2,
  },
  waveform: {
    width: 58,
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    // The lighter step of the accent hue, so a resting row is quiet. Was a
    // hardcoded #8c82ff, a hair off the token it was clearly reaching for.
    backgroundColor: vela.accent2,
  },
  /** Behind the playhead: the full accent, so position is legible at a glance. */
  waveBarPlayed: { backgroundColor: vela.accent },
  selectedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadRow: {
    minHeight: 58,
    borderRadius: 13,
    backgroundColor: vela.lightSurface,
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 10,
  },
  uploadCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  progressLabel: {
    color: vela.accent,
    fontFamily: font.bold,
    fontSize: 9.5,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: vela.lightBorder,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: vela.accent,
  },
  emptyState: {
    minHeight: 235,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  emptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: vela.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  emptyTitle: { color: vela.ink2, fontFamily: font.bold, fontSize: 13.5 },
  emptyDetail: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 4,
  },
  emptyAction: {
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: vela.accentSoft,
  },
  emptyActionText: {
    color: vela.accent,
    fontFamily: font.bold,
    fontSize: 11.5,
  },
  footer: {
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: vela.lightBorder,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerHint: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 11 },
  successText: { color: "#159b72" },
  addButton: {
    minWidth: 138,
    height: 38,
    borderRadius: 12,
    backgroundColor: vela.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addButtonDisabled: { opacity: 0.35 },
  addButtonText: { color: "#fff", fontFamily: font.bold, fontSize: 12.5 },
});
