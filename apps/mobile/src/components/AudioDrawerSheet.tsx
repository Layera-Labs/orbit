/** Persistent source drawer for music and audio timeline lanes. */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import Animated, {
  FadeInRight,
  FadeInUp,
  FadeOutLeft,
  LinearTransition,
} from "react-native-reanimated";
import { BUNDLED_SFX } from "../content/assets";
import { SFX, type SfxItem } from "../content/catalog";
import { addBundledSfx } from "../content/library";
import { font, vela } from "../constants";
import { newId } from "../model/editor-ops";
import {
  addAudioHistory,
  loadAudioHistory,
  type AudioLibraryRecord,
} from "../storage/audioHistory";
import { copyIntoMedia, extFromUri } from "../storage/media";
import { useEditor } from "../store/editorStore";
import { BottomSheet } from "./BottomSheet";
import { VIcon, type VIconName } from "./VIcon";

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
  | { type: "sfx"; id: string; item: SfxItem };

const AUDIO_TABS: Array<{
  key: AudioTab;
  label: string;
  icon: VIconName;
  color: string;
}> = [
  { key: "music", label: "Music", icon: "audio", color: "#5b4bff" },
  { key: "upload", label: "Upload", icon: "export", color: "#2f7bff" },
  { key: "ai", label: "AI", icon: "fx", color: "#a44cf2" },
  { key: "record", label: "Record", icon: "record", color: "#15b8a6" },
  { key: "soundfx", label: "Sound FX", icon: "soundfx", color: "#f39b3f" },
  { key: "stock", label: "Stock", icon: "gutterAudio", color: "#e84da0" },
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
  const [tab, setTab] = useState<AudioTab>("music");
  const [records, setRecords] = useState<AudioLibraryRecord[]>(() =>
    loadAudioHistory(),
  );
  const [uploads, setUploads] = useState<AudioUpload[]>([]);
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
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

  const preview = (source: string | number) => {
    try {
      player.replace(source);
      player.seekTo(0);
      player.play();
    } catch {}
  };

  const addSelected = async () => {
    if (!selection || adding) return;
    setAdding(true);
    try {
      if (selection.type === "sfx") {
        await addBundledSfx(BUNDLED_SFX[selection.item.id], selection.item.dur);
      } else {
        const item =
          selection.type === "record" ? selection.record : selection.item;
        importAudio({
          id: newId("a"),
          src: item.url,
          start: playheadSec,
          duration: item.durationSec ?? 0,
          volume: 0.85,
        });
      }
      setSelection(null);
      setNotice("Added to timeline");
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 1500);
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
                  />
                </View>
                <Text
                  style={[styles.railLabel, active && { color: item.color }]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Animated.View
          key={tab}
          entering={FadeInRight.duration(180)}
          exiting={FadeOutLeft.duration(120)}
          style={styles.panel}
        >
          {tab === "music" ? (
            <MusicPanel
              records={records}
              projectAudio={projectAudio}
              selectedId={selectedId}
              onUpload={chooseAudio}
              onPreview={preview}
              onSelect={setSelection}
            />
          ) : tab === "upload" ? (
            <UploadPanel
              uploads={uploads}
              records={records}
              selectedId={selectedId}
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
              onPreview={(item) => preview(BUNDLED_SFX[item.id])}
              onSelect={setSelection}
            />
          ) : tab === "stock" ? (
            <SfxPanel
              title="Stock audio"
              subtitle="Offline starter collection"
              items={SFX.slice(0, 8)}
              selectedId={selectedId}
              onPreview={(item) => preview(BUNDLED_SFX[item.id])}
              onSelect={setSelection}
            />
          ) : (
            <LibraryPanel
              records={records}
              selectedId={selectedId}
              onUpload={chooseAudio}
              onPreview={preview}
              onSelect={setSelection}
            />
          )}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerHint, notice && styles.successText]}>
          {notice ?? (selection ? "Ready to add" : "Select an audio preview")}
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

function MusicPanel({
  records,
  projectAudio,
  selectedId,
  onUpload,
  onPreview,
  onSelect,
}: {
  records: AudioLibraryRecord[];
  projectAudio: ProjectAudio[];
  selectedId?: string;
  onUpload: () => void;
  onPreview: (source: string) => void;
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
              onPreview={() => onPreview(record.url)}
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
              onPreview={() => onPreview(item.url)}
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
  onUpload,
  onPreview,
  onSelect,
}: {
  uploads: AudioUpload[];
  records: AudioLibraryRecord[];
  selectedId?: string;
  onUpload: () => void;
  onPreview: (source: string) => void;
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
                onPreview={() => onPreview(item.record!.url)}
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
              onPreview={() => onPreview(record.url)}
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
  onUpload,
  onPreview,
  onSelect,
}: {
  records: AudioLibraryRecord[];
  selectedId?: string;
  onUpload: () => void;
  onPreview: (source: string) => void;
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
            onPreview={() => onPreview(record.url)}
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
  onPreview,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  items: SfxItem[];
  selectedId?: string;
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
            onPreview={() => onPreview(item)}
            onPress={() => onSelect({ type: "sfx", id, item })}
          />
        );
      })}
    </ScrollView>
  );
}

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
    <Animated.View entering={FadeInUp.duration(220)} style={styles.emptyState}>
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
  selected,
  onPreview,
  onPress,
}: {
  index: number;
  name: string;
  meta: string;
  selected: boolean;
  onPreview: () => void;
  onPress: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index, 8) * 25).duration(180)}
      layout={LinearTransition.duration(160)}
      style={[styles.audioRow, selected && styles.audioRowSelected]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Preview ${name}`}
        onPress={onPreview}
        hitSlop={5}
        style={styles.playButton}
      >
        <VIcon name="play" size={13} color={vela.accent} />
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
          <Text style={styles.audioMeta}>{meta}</Text>
        </View>
        <Waveform />
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
    <Animated.View layout={LinearTransition} style={styles.uploadRow}>
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

function Waveform() {
  return (
    <View style={styles.waveform}>
      {[8, 15, 11, 20, 14, 18, 9, 16, 12].map((height, index) => (
        <View key={index} style={[styles.waveBar, { height }]} />
      ))}
    </View>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Audio";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

const styles = StyleSheet.create({
  sheet: {
    height: "72%",
    backgroundColor: vela.lightCard,
    paddingHorizontal: 8,
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
    backgroundColor: "#8c82ff",
  },
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
    paddingHorizontal: 8,
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
