/**
 * Persistent media drawer for visual timeline lanes. A compact left rail keeps
 * the source stable while the right panel swaps between AI history, uploads,
 * ratio-aware stock search, and the user's local media library.
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeInRight,
  FadeOutLeft,
  LinearTransition,
  ZoomIn,
} from "react-native-reanimated";
import { font, vela, ratioLabel } from "../constants";
import { newId } from "../model/editor-ops";
import type { VisualTrackClip } from "../model/types";
import { openAi } from "../store/aiActions";
import { useEditor } from "../store/editorStore";
import { addHistory, loadHistory, type GenRecord } from "../storage/genHistory";
import {
  copyIntoMedia,
  downloadToMedia,
  videoThumbnail,
} from "../storage/media";
import {
  isMissingKey,
  searchStock,
  triggerUnsplashDownload,
  type StockItem,
  type StockKind,
} from "../content/stock";
import type { StockProvider } from "../content/keys";
import { BottomSheet } from "./BottomSheet";
import { VIcon, type VIconName } from "./VIcon";

type DrawerMode = "main" | "overlay";
type DrawerTab = "ai" | "upload" | "stock" | "library";

type UploadItem = {
  id: string;
  kind: "image" | "video";
  uri: string;
  preview?: string;
  progress: number;
  status: "preparing" | "ready" | "failed";
  record?: GenRecord;
};

type DrawerSelection =
  | { type: "record"; id: string; record: GenRecord }
  | { type: "stock"; id: string; item: StockItem };

const TABS: Array<{
  key: DrawerTab;
  label: string;
  icon: VIconName;
  color: string;
}> = [
  { key: "ai", label: "AI", icon: "fx", color: "#5b4bff" },
  { key: "upload", label: "Upload", icon: "export", color: "#2f7bff" },
  { key: "stock", label: "Stock", icon: "image", color: "#e84da0" },
  { key: "library", label: "Library", icon: "templates", color: "#8b5cf6" },
];

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function MediaDrawerSheet({ mode }: { mode: DrawerMode }) {
  const project = useEditor((s) => s.project);
  const setPanel = useEditor((s) => s.setPanel);
  const importVisual = useEditor((s) => s.importVisual);
  const importOverlay = useEditor((s) => s.importOverlay);
  const setMediaDuration = useEditor((s) => s.setMediaDuration);
  const setSourceDims = useEditor((s) => s.setSourceDims);
  const [tab, setTab] = useState<DrawerTab>("ai");
  const [records, setRecords] = useState<GenRecord[]>(() => loadHistory());
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selection, setSelection] = useState<DrawerSelection | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({});
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ratio = project ? project.width / project.height : 9 / 16;
  const previewRatio = Math.max(0.56, Math.min(1.78, ratio));
  const ratioText = project
    ? ratioLabel(project.width, project.height)
    : "9:16";

  useEffect(() => {
    let alive = true;
    for (const record of records) {
      if (
        record.kind !== "video" ||
        videoThumbs[record.id] ||
        !record.url.startsWith("file:")
      )
        continue;
      void videoThumbnail(record.url, 0).then((thumb) => {
        if (alive && thumb)
          setVideoThumbs((current) => ({ ...current, [record.id]: thumb }));
      });
    }
    return () => {
      alive = false;
    };
  }, [records, videoThumbs]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const updateUpload = (id: string, patch: Partial<UploadItem>) => {
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const pickUploads = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to import media.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled) return;

    setTab("upload");
    const queued: UploadItem[] = result.assets.map((asset, index) => ({
      id: `up_${Date.now().toString(36)}_${index}`,
      kind: asset.type === "video" ? "video" : "image",
      uri: asset.uri,
      preview: asset.type === "video" ? undefined : asset.uri,
      progress: 0.08,
      status: "preparing",
    }));
    setUploads((current) => [...queued, ...current]);

    await Promise.all(
      result.assets.map(async (asset, index) => {
        const pending = queued[index];
        const isVideo = pending.kind === "video";
        try {
          await delay(90);
          updateUpload(pending.id, { progress: 0.28 });
          const stableUri = copyIntoMedia(asset.uri, isVideo ? "mp4" : "jpg");
          updateUpload(pending.id, { progress: 0.7, uri: stableUri });
          if (!useEditor.getState().sourceDims && asset.width && asset.height)
            setSourceDims(asset.width, asset.height);

          const duration =
            isVideo && asset.duration && asset.duration > 0
              ? asset.duration / 1000
              : isVideo
                ? 5
                : undefined;
          if (duration) setMediaDuration(stableUri, duration);
          const preview = isVideo
            ? await videoThumbnail(stableUri, 0)
            : stableUri;
          await delay(110);
          const next = addHistory({
            kind: isVideo ? "video" : "image",
            source: "upload",
            url: stableUri,
            durationSec: duration,
          });
          const record = next[0];
          setRecords(next);
          updateUpload(pending.id, {
            progress: 1,
            status: "ready",
            uri: stableUri,
            preview,
            record,
          });
        } catch (error) {
          updateUpload(pending.id, { progress: 1, status: "failed" });
          Alert.alert(
            "Import failed",
            error instanceof Error ? error.message : String(error),
          );
        }
      }),
    );
  };

  const addClip = (
    src: string,
    kind: "image" | "video",
    durationSec?: number,
  ) => {
    const duration =
      kind === "video" ? (durationSec && durationSec > 0 ? durationSec : 5) : 4;
    const clip: VisualTrackClip =
      kind === "video"
        ? {
            id: newId("v"),
            type: "video",
            src,
            start: 0,
            duration,
            trimIn: 0,
            volume: 1,
          }
        : { id: newId("img"), type: "image", src, start: 0, duration };
    if (kind === "video") setMediaDuration(src, duration);
    if (mode === "overlay") importOverlay([clip]);
    else importVisual([clip]);
  };

  const addSelected = async () => {
    if (!selection || adding) return;
    setAdding(true);
    try {
      if (selection.type === "stock") {
        void triggerUnsplashDownload(selection.item);
        const src = await downloadToMedia(
          selection.item.full,
          selection.item.kind === "video" ? "mp4" : "jpg",
        );
        addClip(src, selection.item.kind, selection.item.duration);
      } else {
        const record = selection.record;
        const src =
          record.source === "upload"
            ? record.url
            : await downloadToMedia(
                record.url,
                record.kind === "video" ? "mp4" : "jpg",
              );
        addClip(src, record.kind, record.durationSec);
      }
      setNotice("Added to timeline");
      setSelection(null);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 1500);
    } catch (error) {
      Alert.alert(
        "Could not add media",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setAdding(false);
    }
  };

  const selectedId = selection?.id;
  const openGenerate = () => {
    // React Native can leave the outgoing sheet's native Modal above the next
    // one when both swap in the same frame. Let it detach, then open AI.
    setPanel(null);
    setTimeout(() => openAi("aigen", { mode: "image" }), 260);
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
          <Text style={styles.title}>
            {mode === "overlay" ? "Add image" : "Add visual"}
          </Text>
          <Text style={styles.subtitle}>
            Choose a source, preview it, then add it.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.ratioBadge}>
            <VIcon name="frame" size={13} color={vela.accent} />
            <Text style={styles.ratioText}>{ratioText}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close media drawer"
            onPress={() => setPanel(null)}
            hitSlop={10}
            style={styles.closeButton}
          >
            <VIcon name="close" size={18} color={vela.ink2} />
          </Pressable>
        </View>
      </View>

      <View style={styles.workspace}>
        <View style={styles.rail}>
          {TABS.map((item) => {
            const active = tab === item.key;
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
                    size={20}
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
          {tab === "ai" ? (
            <AiPanel
              records={records.filter((record) => record.source === "ai")}
              selectedId={selectedId}
              ratio={previewRatio}
              onGenerate={openGenerate}
              onSelect={setSelection}
            />
          ) : tab === "upload" ? (
            <UploadPanel
              uploads={uploads}
              records={records.filter((record) => record.source === "upload")}
              selectedId={selectedId}
              ratio={previewRatio}
              thumbs={videoThumbs}
              onUpload={pickUploads}
              onSelect={setSelection}
            />
          ) : tab === "stock" ? (
            <StockPanel
              ratio={previewRatio}
              ratioText={ratioText}
              selectedId={selectedId}
              onSelect={setSelection}
              onOpenKeys={() => setPanel("keys")}
            />
          ) : (
            <LibraryPanel
              records={records.filter((record) => record.source === "upload")}
              selectedId={selectedId}
              ratio={previewRatio}
              thumbs={videoThumbs}
              onSelect={setSelection}
              onUpload={pickUploads}
            />
          )}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerHint, notice && { color: "#159b72" }]}>
          {notice ?? (selection ? "Ready to add" : "Select a preview")}
        </Text>
        <Pressable
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
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.panelHeading}>
      <Text style={styles.panelTitle}>{title}</Text>
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

function AiPanel({
  records,
  selectedId,
  ratio,
  onGenerate,
  onSelect,
}: {
  records: GenRecord[];
  selectedId?: string;
  ratio: number;
  onGenerate: () => void;
  onSelect: (selection: DrawerSelection) => void;
}) {
  const recent = records.slice(0, 6);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.panelScroll}
    >
      <PanelHeading
        title="AI history"
        action="Generate new"
        onAction={onGenerate}
      />
      {records.length === 0 ? (
        <EmptyState
          icon="fx"
          title="No generations yet"
          detail="Create an image or video and it will appear here."
          action="Generate with AI"
          onAction={onGenerate}
        />
      ) : (
        <>
          <Text style={styles.microTitle}>Recent</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          >
            {recent.map((record) => (
              <MediaTile
                key={`recent-${record.id}`}
                source={
                  record.kind === "image" ? { uri: record.url } : undefined
                }
                video={record.kind === "video"}
                selected={selectedId === record.id}
                ratio={ratio}
                width={104}
                onPress={() =>
                  onSelect({ type: "record", id: record.id, record })
                }
              />
            ))}
          </ScrollView>
          <Text style={styles.microTitle}>All generations</Text>
          <View style={styles.previewGrid}>
            {records.map((record) => (
              <MediaTile
                key={record.id}
                source={
                  record.kind === "image" ? { uri: record.url } : undefined
                }
                video={record.kind === "video"}
                selected={selectedId === record.id}
                ratio={ratio}
                onPress={() =>
                  onSelect({ type: "record", id: record.id, record })
                }
              />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function UploadPanel({
  uploads,
  records,
  selectedId,
  ratio,
  thumbs,
  onUpload,
  onSelect,
}: {
  uploads: UploadItem[];
  records: GenRecord[];
  selectedId?: string;
  ratio: number;
  thumbs: Record<string, string>;
  onUpload: () => void;
  onSelect: (selection: DrawerSelection) => void;
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
      <PanelHeading title="Upload" action="Choose media" onAction={onUpload} />
      {uploads.length === 0 && older.length === 0 ? (
        <EmptyState
          icon="export"
          title="Upload from your device"
          detail="Photos and videos return here with progress."
          action="Choose media"
          onAction={onUpload}
        />
      ) : (
        <View style={styles.previewGrid}>
          {uploads.map((item) => (
            <MediaTile
              key={item.id}
              source={
                item.preview
                  ? { uri: item.preview }
                  : item.kind === "image"
                    ? { uri: item.uri }
                    : undefined
              }
              video={item.kind === "video"}
              progress={item.status === "preparing" ? item.progress : undefined}
              failed={item.status === "failed"}
              selected={!!item.record && selectedId === item.record.id}
              ratio={ratio}
              onPress={
                item.record
                  ? () =>
                      onSelect({
                        type: "record",
                        id: item.record!.id,
                        record: item.record!,
                      })
                  : undefined
              }
            />
          ))}
          {older.map((record) => (
            <MediaTile
              key={record.id}
              source={
                record.kind === "image"
                  ? { uri: record.url }
                  : thumbs[record.id]
                    ? { uri: thumbs[record.id] }
                    : undefined
              }
              video={record.kind === "video"}
              selected={selectedId === record.id}
              ratio={ratio}
              onPress={() =>
                onSelect({ type: "record", id: record.id, record })
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function LibraryPanel({
  records,
  selectedId,
  ratio,
  thumbs,
  onSelect,
  onUpload,
}: {
  records: GenRecord[];
  selectedId?: string;
  ratio: number;
  thumbs: Record<string, string>;
  onSelect: (selection: DrawerSelection) => void;
  onUpload: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const visible =
    filter === "all"
      ? records
      : records.filter((record) => record.kind === filter);
  return (
    <View style={styles.panelFill}>
      <PanelHeading title="Your library" action="Upload" onAction={onUpload} />
      <View style={styles.filterRow}>
        {(["all", "image", "video"] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.filterChip, filter === item && styles.filterChipOn]}
          >
            <Text
              style={[
                styles.filterText,
                filter === item && styles.filterTextOn,
              ]}
            >
              {item === "all" ? "All" : item === "image" ? "Photos" : "Videos"}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.panelScroll}
      >
        {visible.length === 0 ? (
          <EmptyState
            icon="templates"
            title="Library is empty"
            detail="Uploaded media is saved here for reuse."
            action="Upload media"
            onAction={onUpload}
          />
        ) : (
          <View style={styles.previewGrid}>
            {visible.map((record) => (
              <MediaTile
                key={record.id}
                source={
                  record.kind === "image"
                    ? { uri: record.url }
                    : thumbs[record.id]
                      ? { uri: thumbs[record.id] }
                      : undefined
                }
                video={record.kind === "video"}
                selected={selectedId === record.id}
                ratio={ratio}
                onPress={() =>
                  onSelect({ type: "record", id: record.id, record })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StockPanel({
  ratio,
  ratioText,
  selectedId,
  onSelect,
  onOpenKeys,
}: {
  ratio: number;
  ratioText: string;
  selectedId?: string;
  onSelect: (selection: DrawerSelection) => void;
  onOpenKeys: () => void;
}) {
  const [provider, setProvider] = useState<StockProvider>("pexels");
  const [kind, setKind] = useState<StockKind>("image");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [missingKey, setMissingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const effectiveKind: StockKind = provider === "unsplash" ? "image" : kind;

  const runSearch = async () => {
    if (!query.trim()) return;
    const id = ++requestId.current;
    setLoading(true);
    setMissingKey(false);
    setError(null);
    try {
      const next = await searchStock(provider, query.trim(), effectiveKind);
      if (id === requestId.current) setResults(next);
    } catch (err) {
      if (id !== requestId.current) return;
      setResults([]);
      if (isMissingKey(err)) setMissingKey(true);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  return (
    <View style={styles.panelFill}>
      <PanelHeading title="Stock media" />
      <View style={styles.stockMetaRow}>
        <View style={styles.filterRow}>
          {(["image", "video"] as StockKind[]).map((item) => (
            <Pressable
              key={item}
              disabled={provider === "unsplash" && item === "video"}
              onPress={() => setKind(item)}
              style={[
                styles.filterChip,
                effectiveKind === item && styles.filterChipOn,
                provider === "unsplash" &&
                  item === "video" && { opacity: 0.35 },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  effectiveKind === item && styles.filterTextOn,
                ]}
              >
                {item === "image" ? "Photos" : "Videos"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.ratioMeta}>{ratioText} crop</Text>
      </View>
      <View style={styles.stockProviderRow}>
        {(["pexels", "unsplash"] as StockProvider[]).map((item) => (
          <Pressable key={item} onPress={() => setProvider(item)}>
            <Text
              style={[
                styles.providerText,
                provider === item && styles.providerTextOn,
              ]}
            >
              {item === "pexels" ? "Pexels" : "Unsplash"}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.searchRow}>
        <VIcon name="search" size={16} color={vela.lightMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          placeholder="Search photos and videos"
          placeholderTextColor={vela.lightMuted3}
          style={styles.searchInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search stock media"
          onPress={runSearch}
          style={styles.searchButton}
        >
          <VIcon name="search" size={15} color="#fff" />
        </Pressable>
      </View>
      {missingKey ? (
        <Pressable onPress={onOpenKeys} style={styles.keyPrompt}>
          <VIcon name="lock" size={18} color={vela.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.keyTitle}>
              Connect {provider === "pexels" ? "Pexels" : "Unsplash"}
            </Text>
            <Text style={styles.keyDetail}>
              Add your API key to search stock media.
            </Text>
          </View>
          <VIcon name="chevronRight" size={16} color={vela.lightMuted} />
        </Pressable>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.panelScroll}
      >
        {loading ? (
          <View style={styles.previewGrid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <Animated.View
                key={index}
                entering={ZoomIn.delay(index * 35)}
                style={[styles.skeleton, { aspectRatio: ratio }]}
              />
            ))}
          </View>
        ) : results.length > 0 ? (
          <View style={styles.previewGrid}>
            {results.map((item) => (
              <MediaTile
                key={item.id}
                source={{ uri: item.thumb }}
                video={item.kind === "video"}
                selected={selectedId === item.id}
                ratio={ratio}
                onPress={() => onSelect({ type: "stock", id: item.id, item })}
              />
            ))}
          </View>
        ) : !missingKey ? (
          <EmptyState
            icon="search"
            title="Find the right shot"
            detail={`Results are previewed with your ${ratioText} project crop.`}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function MediaTile({
  source,
  video,
  selected,
  ratio,
  width,
  progress,
  failed,
  onPress,
}: {
  source?: ImageSourcePropType;
  video?: boolean;
  selected?: boolean;
  ratio: number;
  width?: number;
  progress?: number;
  failed?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={video ? "Video preview" : "Image preview"}
      accessibilityState={{ disabled: !onPress, selected: !!selected }}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.mediaTile,
        width ? { width } : undefined,
        { aspectRatio: ratio },
        selected && styles.mediaTileSelected,
      ]}
    >
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.videoFallback}>
          <VIcon
            name={video ? "video" : "image"}
            size={24}
            color={vela.lightMuted}
          />
        </View>
      )}
      {video ? (
        <View style={styles.videoBadge}>
          <VIcon name="play" size={11} color="#fff" />
        </View>
      ) : null}
      {selected ? (
        <View style={styles.selectedBadge}>
          <VIcon name="check" size={12} color="#fff" />
        </View>
      ) : null}
      {progress != null ? (
        <View style={styles.progressOverlay}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%` },
              ]}
            />
          </View>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.progressOverlay}>
          <VIcon name="close" size={18} color="#fff" />
          <Text style={styles.progressText}>Failed</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  action,
  onAction,
}: {
  icon: VIconName;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <VIcon name={icon} size={24} color={vela.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={styles.emptyAction}>
          <Text style={styles.emptyActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    height: "72%",
    backgroundColor: vela.lightCard,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 12,
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
  },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 21 },
  subtitle: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 11.5,
    marginTop: 2,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  ratioBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: vela.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  ratioText: { color: vela.accent, fontFamily: font.bold, fontSize: 11 },
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
    padding: 5,
    gap: 3,
  },
  railItem: {
    height: 66,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    overflow: "hidden",
  },
  railIndicator: {
    position: "absolute",
    left: 0,
    top: 13,
    bottom: 13,
    width: 3,
    borderRadius: 2,
  },
  railIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  railLabel: {
    color: vela.lightMuted,
    fontFamily: font.semibold,
    fontSize: 9.5,
  },
  panel: { flex: 1, paddingLeft: 12, minWidth: 0 },
  panelFill: { flex: 1, gap: 8 },
  panelScroll: { paddingBottom: 12, gap: 9 },
  panelHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
  },
  panelTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 15 },
  panelAction: { color: vela.accent, fontFamily: font.bold, fontSize: 11.5 },
  microTitle: {
    color: vela.lightMuted,
    fontFamily: font.bold,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  carousel: { gap: 8, paddingRight: 6 },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  mediaTile: {
    width: "48.4%",
    minHeight: 96,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: vela.lightSurface,
    borderWidth: 2,
    borderColor: "transparent",
  },
  mediaTileSelected: { borderColor: vela.accent },
  videoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.lightSurface,
  },
  videoBadge: {
    position: "absolute",
    left: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0009",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0009",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: 8,
  },
  progressText: { color: "#fff", fontFamily: font.bold, fontSize: 10 },
  progressTrack: {
    height: 3,
    width: "78%",
    borderRadius: 2,
    backgroundColor: "#ffffff44",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  footer: {
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: vela.lightBorder,
    paddingTop: 10,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerHint: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 11.5,
  },
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
  filterRow: { flexDirection: "row", gap: 6 },
  filterChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: vela.lightSurface,
  },
  filterChipOn: { backgroundColor: vela.accentSoft },
  filterText: {
    color: vela.lightMuted,
    fontFamily: font.semibold,
    fontSize: 10.5,
  },
  filterTextOn: { color: vela.accent },
  stockMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ratioMeta: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 9.5 },
  stockProviderRow: { flexDirection: "row", gap: 13 },
  providerText: {
    color: vela.lightMuted,
    fontFamily: font.semibold,
    fontSize: 10.5,
  },
  providerTextOn: { color: vela.accent },
  searchRow: {
    height: 38,
    borderRadius: 12,
    backgroundColor: vela.lightSurface,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    gap: 7,
  },
  searchInput: {
    flex: 1,
    color: vela.ink,
    fontFamily: font.medium,
    fontSize: 11.5,
    paddingVertical: 0,
  },
  searchButton: {
    width: 36,
    height: 32,
    borderRadius: 10,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 3,
  },
  keyPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 10,
    borderRadius: 12,
    backgroundColor: vela.accentSoft,
  },
  keyTitle: { color: vela.ink2, fontFamily: font.bold, fontSize: 11.5 },
  keyDetail: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 9.5,
    marginTop: 1,
  },
  errorText: { color: vela.danger, fontFamily: font.medium, fontSize: 10.5 },
  skeleton: {
    width: "48.4%",
    borderRadius: 12,
    backgroundColor: vela.lightSurface,
  },
  emptyState: {
    minHeight: 210,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
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
});
