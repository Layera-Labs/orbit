/**
 * What a new project is made of, chosen before the editor opens.
 *
 * Picking a format used to drop you straight onto an empty timeline: one blank
 * track, nothing to play, and no obvious first move. Every editor this app is
 * modelled on asks for footage first, and so does this now.
 *
 * The project is not created until Continue. Creating it up front would leave
 * an "Untitled" behind every time someone opened this and changed their mind.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import { font, r, ratioLabel, sp, vela } from "../constants";
import { VIcon } from "../components/VIcon";
import { newId } from "../model/editor-ops";
import type { VisualTrackClip } from "../model/types";
import {
  loadHistory,
  setHistoryThumb,
  type GenRecord,
} from "../storage/genHistory";
import { copyIntoMedia, downloadToMedia, videoThumbnail } from "../storage/media";
import { isPhotoAssetUri, useAssetUri } from "../media/assetUri";
import {
  isMissingKey,
  searchStock,
  triggerUnsplashDownload,
  type StockItem,
  type StockKind,
} from "../content/stock";
import type { StockProvider } from "../content/keys";
import { isCcRateLimited, searchCc, type CcItem } from "../content/openverse";
import { CC_RATE_LIMIT_MESSAGE } from "../content/useCcSearch";
import { useEditor } from "../store/editorStore";

type Tab = "photos" | "videos" | "library" | "stock";

const TABS: { key: Tab; label: string }[] = [
  { key: "photos", label: "Photos" },
  { key: "videos", label: "Videos" },
  { key: "library", label: "Library" },
  { key: "stock", label: "Stock" },
];

/** How long a still sits on the timeline when it has no duration of its own. */
const STILL_SECONDS = 4;

/** One thing that could go on the timeline, from whichever tab. */
type Pick =
  | { kind: "asset"; id: string; asset: MediaLibrary.Asset }
  | { kind: "record"; id: string; record: GenRecord }
  | { kind: "stock"; id: string; item: StockItem }
  | { kind: "cc"; id: string; item: CcItem };

const COLUMNS = 3;

export function MediaPickScreen() {
  const format = useEditor((s) => s.pendingFormat);
  const cancel = useEditor((s) => s.cancelNewProject);
  const newProject = useEditor((s) => s.newProject);
  const importVisual = useEditor((s) => s.importVisual);
  const setMediaDuration = useEditor((s) => s.setMediaDuration);

  const [tab, setTab] = useState<Tab>("photos");
  const [picked, setPicked] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);
  const orderOf = (id: string) => {
    if (picked.length < 2) return undefined;
    const i = picked.findIndex((p) => p.id === id);
    return i < 0 ? undefined : i + 1;
  };

  /*
   * Tap replaces unless more than one is already picked; long press always
   * adds. Same rule as the media drawer, so the gesture means one thing across
   * the app.
   */
  const toggle = (item: Pick, additive: boolean) => {
    setPicked((current) => {
      const without = current.filter((p) => p.id !== item.id);
      if (without.length !== current.length) return without;
      if (additive || current.length > 1) return [...current, item];
      return [item];
    });
  };

  const ratio = format ? format.width / format.height : 9 / 16;

  const start = async () => {
    if (!format || !picked.length || busy) return;
    setBusy(true);
    try {
      // Resolve every pick to a stable local file BEFORE the project exists, so
      // a failure here leaves nothing behind to clean up.
      const clips: VisualTrackClip[] = [];
      let at = 0;
      for (const item of picked) {
        const resolved = await resolvePick(item);
        if (!resolved) continue;
        const duration = resolved.duration ?? STILL_SECONDS;
        clips.push({
          id: newId(resolved.type === "video" ? "vid" : "img"),
          type: resolved.type,
          src: resolved.src,
          start: at,
          duration,
          ...(resolved.type === "video" ? { trimIn: 0, volume: 1 } : {}),
        } as VisualTrackClip);
        at += duration;
      }
      /*
       * Say so when a pick could not be brought onto disk — most often an
       * iCloud photo that is not on the device. Dropping it in silence made
       * the app look like it had simply ignored the tap, which is the worst
       * of both: no media and no reason.
       */
      const dropped = picked.length - clips.length;
      if (dropped > 0) {
        Alert.alert(
          dropped === picked.length ? "Nothing could be added" : "Some items skipped",
          `${dropped} item${dropped === 1 ? "" : "s"} could not be opened. ` +
            `Photos stored only in iCloud need to be downloaded to this device first.`,
        );
      }
      if (!clips.length) return;

      newProject("Untitled", format.width, format.height);
      for (const clip of clips) {
        if (clip.type === "video") setMediaDuration(clip.src, clip.duration);
      }
      importVisual(clips);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={cancel}
          hitSlop={12}
        >
          <VIcon name="back" size={22} color={vela.textLight} />
        </Pressable>
        <View style={s.headCopy}>
          <Text style={s.title}>Choose media</Text>
          <Text style={s.sub}>
            {format ? ratioLabel(format.width, format.height) : ""}
          </Text>
        </View>
      </View>

      {/*
        Plain text tabs. The active one changes weight and value — no dot under
        it, no pill around it.
      */}
      <View style={s.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            onPress={() => setTab(t.key)}
            hitSlop={8}
          >
            <Text style={[s.tab, tab === t.key && s.tabOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.body}>
        {tab === "photos" || tab === "videos" ? (
          <DeviceGrid
            mediaType={tab === "photos" ? "photo" : "video"}
            pickedIds={pickedIds}
            orderOf={orderOf}
            onToggle={toggle}
          />
        ) : tab === "library" ? (
          <LibraryGrid
            pickedIds={pickedIds}
            orderOf={orderOf}
            onToggle={toggle}
          />
        ) : (
          <StockGrid
            ratio={ratio}
            pickedIds={pickedIds}
            orderOf={orderOf}
            onToggle={toggle}
          />
        )}
      </View>

      <View style={s.footer}>
        <Text style={s.count}>
          {picked.length === 0
            ? "Pick something to start · hold to add more"
            : picked.length === 1
              ? "1 selected"
              : `${picked.length} selected`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start editing"
          disabled={!picked.length || busy}
          onPress={start}
          style={[s.cta, (!picked.length || busy) && s.ctaOff]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.ctaText}>Start editing</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** Bring a pick onto local disk and say what it is. */
async function resolvePick(
  item: Pick,
): Promise<{ src: string; type: "image" | "video"; duration?: number } | null> {
  try {
    if (item.kind === "asset") {
      /*
       * iOS hands back a `ph://` identifier, which neither Skia nor ffmpeg can
       * open — `getAssetInfoAsync` is what turns it into a real file. Copying
       * it into our own media dir then makes it stable, since the Photos entry
       * can be edited or deleted out from under the project.
       */
      const info = await MediaLibrary.getAssetInfoAsync(item.asset);
      const uri = info.localUri ?? item.asset.uri;
      /*
       * No `localUri` means the asset is in iCloud and was not fetched — the
       * default DOES download, so this is the genuine failure case (offline,
       * or the download was refused). Falling through with `item.asset.uri`
       * hands a `ph://` id to `copyIntoMedia`, which cannot open one either,
       * so the pick failed later and looked like a broken file rather than a
       * photo that is not on the device.
       */
      if (isPhotoAssetUri(uri)) return null;
      const video = item.asset.mediaType === MediaLibrary.MediaType.video;
      return {
        src: copyIntoMedia(uri, video ? "mp4" : "jpg"),
        type: video ? "video" : "image",
        duration: video ? item.asset.duration || undefined : undefined,
      };
    }
    if (item.kind === "record") {
      const r = item.record;
      const src =
        r.source === "upload"
          ? r.url
          : await downloadToMedia(r.url, r.kind === "video" ? "mp4" : "jpg");
      return { src, type: r.kind, duration: r.durationSec };
    }
    if (item.kind === "cc") {
      return {
        src: await downloadToMedia(item.item.url, "jpg"),
        type: "image",
      };
    }
    void triggerUnsplashDownload(item.item);
    const src = await downloadToMedia(
      item.item.full,
      item.item.kind === "video" ? "mp4" : "jpg",
    );
    return { src, type: item.item.kind, duration: item.item.duration };
  } catch {
    // One unreadable item must not sink the whole selection.
    return null;
  }
}

interface GridProps {
  pickedIds: ReadonlySet<string>;
  orderOf: (id: string) => number | undefined;
  onToggle: (item: Pick, additive: boolean) => void;
}

/**
 * The device's own photos and videos.
 *
 * `expo-media-library` was already a dependency and already configured — it is
 * used to SAVE exports — so this needs no new native module and no rebuild. It
 * is also what makes a real multi-select possible: the system picker's own
 * selection UI is not ours to change.
 */
function DeviceGrid({
  mediaType,
  pickedIds,
  orderOf,
  onToggle,
}: GridProps & { mediaType: "photo" | "video" }) {
  const [assets, setAssets] = useState<MediaLibrary.Asset[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!alive) return;
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      const page = await MediaLibrary.getAssetsAsync({
        mediaType,
        first: 120,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      if (alive) setAssets(page.assets);
    })();
    return () => {
      alive = false;
    };
  }, [mediaType]);

  if (denied) {
    return (
      <Empty
        title="Orbit cannot see your photos"
        detail="Allow photo access in Settings, or use the Library and Stock tabs."
      />
    );
  }
  if (!assets) return <Loading />;
  if (!assets.length) {
    return (
      <Empty
        title={mediaType === "photo" ? "No photos here" : "No videos here"}
        detail="Try another tab."
      />
    );
  }

  return (
    <FlatList
      data={assets}
      numColumns={COLUMNS}
      keyExtractor={(a) => a.id}
      contentContainerStyle={s.grid}
      renderItem={({ item }) => (
        <PickTile
          assetId={item.id}
          uri={item.uri}
          video={mediaType === "video"}
          duration={item.duration}
          selected={pickedIds.has(item.id)}
          order={orderOf(item.id)}
          onPress={(additive) =>
            onToggle({ kind: "asset", id: item.id, asset: item }, additive)
          }
        />
      )}
    />
  );
}

/** Media already imported or generated, reusable across every project. */
function LibraryGrid({ pickedIds, orderOf, onToggle }: GridProps) {
  const [records] = useState<GenRecord[]>(() => loadHistory());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // Only for records that do not already carry a poster; `setHistoryThumb`
  // means the next screen to ask for one gets it for free.
  useEffect(() => {
    let alive = true;
    for (const r of records) {
      if (r.kind !== "video" || r.thumbUri) continue;
      if (!r.url.startsWith("file:")) continue;
      void videoThumbnail(r.url, 0).then((t) => {
        if (!alive || !t) return;
        setThumbs((c) => ({ ...c, [r.id]: t }));
        setHistoryThumb(r.id, t);
      });
    }
    return () => {
      alive = false;
    };
  }, [records]);

  if (!records.length) {
    return (
      <Empty
        title="Your library is empty"
        detail="Anything you import or generate is kept here for every project."
      />
    );
  }
  return (
    <FlatList
      data={records}
      numColumns={COLUMNS}
      keyExtractor={(r) => r.id}
      contentContainerStyle={s.grid}
      renderItem={({ item }) => (
        <PickTile
          uri={
            item.kind === "image"
              ? item.url
              : (item.thumbUri ?? thumbs[item.id])
          }
          video={item.kind === "video"}
          duration={item.durationSec}
          selected={pickedIds.has(item.id)}
          order={orderOf(item.id)}
          onPress={(additive) =>
            onToggle({ kind: "record", id: item.id, record: item }, additive)
          }
        />
      )}
    />
  );
}

/** Which shelf the Stock tab is looking at. `free` needs no key and is the default. */
type StockSource = "free" | StockProvider;

const SOURCES: { key: StockSource; label: string }[] = [
  { key: "free", label: "Free" },
  { key: "pexels", label: "Pexels" },
  { key: "unsplash", label: "Unsplash" },
];

/**
 * Stock footage: CC0 by default, the keyed providers if you have a key.
 *
 * This tab was Unsplash and Pexels only, and both want an API key the user has
 * to go and register for — so on a fresh install, on the very screen a new
 * project starts from, "Stock" was a search field that could return nothing at
 * all. `free` is Openverse filtered to `license=cc0` (see
 * `content/openverse.ts`); it answers anonymously, so the tab works before
 * anyone has set anything up, and the keyed providers stay for the much larger
 * library a key buys.
 *
 * CC0 is photographs only here. Openverse indexes no video, and offering an
 * empty Videos chip would be worse than not offering one.
 */
function StockGrid({
  ratio,
  pickedIds,
  orderOf,
  onToggle,
}: GridProps & { ratio: number }) {
  const setPanel = useEditor((s) => s.setPanel);
  const [source, setSource] = useState<StockSource>("free");
  const [kind, setKind] = useState<StockKind>("image");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockItem[]>([]);
  const [free, setFree] = useState<CcItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [missingKey, setMissingKey] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Unsplash has no video API, so asking for one would fail silently.
  const effectiveKind: StockKind = source === "unsplash" ? "image" : kind;

  const run = async (from: StockSource, q: string) => {
    setLoading(true);
    setMissingKey(false);
    setErr(null);
    try {
      if (from === "free") {
        setFree(await searchCc("image", q));
      } else {
        if (!q.trim()) return;
        setResults(await searchStock(from, q.trim(), effectiveKind));
      }
    } catch (e) {
      setResults([]);
      setFree([]);
      if (isMissingKey(e)) setMissingKey(true);
      else if (isCcRateLimited(e)) setErr(CC_RATE_LIMIT_MESSAGE);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  /*
   * The free shelf fills itself on arrival — `searchCc` falls back to a seed
   * query when nothing is typed, so there is content to look at before anyone
   * has thought of a word. The keyed providers cannot do that: a search with no
   * key is a wasted request and an error message nobody asked for.
   */
  useEffect(() => {
    if (source === "free") void run("free", query);
    // Re-running on `query` would search on every keystroke; it is submitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  /*
   * Only the two remote shelves, so the tile can read `item` off either without
   * narrowing — a device asset and a library record never reach this grid.
   */
  const showing: Extract<Pick, { kind: "cc" | "stock" }>[] =
    source === "free"
      ? free.map((item) => ({ kind: "cc" as const, id: item.id, item }))
      : results.map((item) => ({ kind: "stock" as const, id: item.id, item }));

  return (
    <View style={{ flex: 1 }}>
      <View style={s.stockBar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void run(source, query)}
          returnKeyType="search"
          placeholder={
            source === "free"
              ? "Search free photos"
              : `Search ${SOURCES.find((x) => x.key === source)?.label ?? source}`
          }
          placeholderTextColor={vela.muted3}
          style={s.search}
        />
        <Pressable
          onPress={() => void run(source, query)}
          hitSlop={8}
          accessibilityLabel="Search stock"
        >
          <VIcon name="search" size={18} color={vela.textLight2} />
        </Pressable>
      </View>
      <View style={s.stockChips}>
        {/*
          Named properly rather than by their internal keys — the row used to
          read "pexels · unsplash" in lower case, which is a variable name
          showing through, and "Free" beside them made the mismatch obvious.
        */}
        {SOURCES.map((src) => (
          <Chip
            key={src.key}
            on={source === src.key}
            onPress={() => setSource(src.key)}
          >
            {src.label}
          </Chip>
        ))}
        {source === "pexels"
          ? (["image", "video"] as const).map((k) => (
              <Chip key={k} on={kind === k} onPress={() => setKind(k)}>
                {k === "image" ? "Photos" : "Videos"}
              </Chip>
            ))
          : null}
      </View>

      {missingKey ? (
        <Empty
          title={`No ${SOURCES.find((x) => x.key === source)?.label ?? source} key yet`}
          detail="Keyed search uses your own API key, kept on this device. Free needs none."
          action="Add a key"
          onAction={() => setPanel("keys")}
        />
      ) : loading ? (
        <Loading />
      ) : err ? (
        <Empty title="Could not search" detail={err} />
      ) : showing.length ? (
        <FlatList
          data={showing}
          numColumns={COLUMNS}
          keyExtractor={(p) => p.id}
          contentContainerStyle={s.grid}
          renderItem={({ item: pick }) => (
            <PickTile
              uri={pick.item.thumb}
              video={pick.kind === "stock" && pick.item.kind === "video"}
              duration={pick.kind === "stock" ? pick.item.duration : undefined}
              ratio={ratio}
              selected={pickedIds.has(pick.id)}
              order={orderOf(pick.id)}
              onPress={(additive) => onToggle(pick, additive)}
            />
          )}
        />
      ) : (
        <Empty
          title="Search for something"
          detail={
            source === "free"
              ? "Public domain photos, free to use with no credit."
              : "Photos and videos, free to use."
          }
        />
      )}
    </View>
  );
}

function PickTile({
  assetId,
  uri,
  video,
  duration,
  ratio,
  selected,
  order,
  onPress,
}: {
  /** Set for Photos assets, whose `uri` is a `ph://` id `<Image>` cannot load. */
  assetId?: string;
  uri?: string;
  video?: boolean;
  duration?: number;
  ratio?: number;
  selected: boolean;
  order?: number;
  onPress: (additive: boolean) => void;
}) {
  const shown = useAssetUri(assetId, uri);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        (video ? "Video" : "Photo") +
        (order != null ? `, number ${order} of the selection` : "")
      }
      onPress={() => onPress(false)}
      onLongPress={() => onPress(true)}
      delayLongPress={280}
      style={[s.tile, { aspectRatio: ratio ?? 1 }, selected && s.tileOn]}
    >
      {shown ? (
        <Image
          source={{ uri: shown }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={s.tileBlank}>
          <VIcon name={video ? "video" : "image"} size={20} color={vela.muted3} />
        </View>
      )}
      {video && duration ? (
        <Text style={s.dur}>{formatDur(duration)}</Text>
      ) : null}
      {selected ? (
        <View style={s.badge}>
          {order != null ? (
            <Text style={s.badgeNum}>{order}</Text>
          ) : (
            <VIcon name="check" size={12} color="#fff" />
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

function Chip({
  on,
  onPress,
  children,
}: {
  on: boolean;
  onPress: () => void;
  children: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={[s.chip, on && s.chipOn]}>{children}</Text>
    </Pressable>
  );
}

function Loading() {
  return (
    <View style={s.centre}>
      <ActivityIndicator color={vela.accent} />
    </View>
  );
}

function Empty({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.centre}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyDetail}>{detail}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={s.emptyAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatDur(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: vela.editorBg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp.md,
    paddingHorizontal: sp.lg,
    paddingTop: sp.xxl + sp.lg,
    paddingBottom: sp.md,
  },
  headCopy: { flex: 1 },
  title: { color: vela.textLight, fontSize: 20, fontFamily: font.semibold },
  sub: { color: vela.muted, fontSize: 13, fontFamily: font.regular },
  tabs: {
    flexDirection: "row",
    gap: sp.xl,
    paddingHorizontal: sp.lg,
    paddingBottom: sp.md,
  },
  tab: { color: vela.muted2, fontSize: 15, fontFamily: font.medium },
  tabOn: { color: vela.textLight, fontFamily: font.semibold },
  body: { flex: 1 },
  grid: { padding: sp.xs, paddingBottom: sp.xxl },
  tile: {
    flex: 1 / COLUMNS,
    margin: sp.xs / 2,
    borderRadius: r.sm,
    overflow: "hidden",
    backgroundColor: vela.card,
  },
  tileOn: { borderWidth: 2, borderColor: vela.accent },
  tileBlank: { flex: 1, alignItems: "center", justifyContent: "center" },
  dur: {
    position: "absolute",
    left: 6,
    bottom: 5,
    color: "#fff",
    fontSize: 11,
    fontFamily: font.medium,
    // Legible over any frame without a scrim behind it.
    textShadowColor: "#000a",
    textShadowRadius: 3,
  },
  badge: {
    position: "absolute",
    right: 5,
    top: 5,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeNum: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 14,
    fontFamily: font.bold,
    textAlign: "center",
    includeFontPadding: false,
  },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: sp.sm,
    paddingHorizontal: sp.xxl,
  },
  emptyTitle: { color: vela.textLight, fontSize: 16, fontFamily: font.semibold },
  emptyDetail: {
    color: vela.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: font.regular,
  },
  emptyAction: {
    color: vela.accent2,
    fontSize: 14,
    fontFamily: font.semibold,
    marginTop: sp.xs,
  },
  stockBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp.sm,
    marginHorizontal: sp.lg,
    paddingHorizontal: sp.md,
    height: 40,
    borderRadius: r.md,
    backgroundColor: vela.card,
  },
  search: {
    flex: 1,
    color: vela.textLight,
    fontSize: 14,
    fontFamily: font.regular,
    padding: 0,
  },
  stockChips: {
    flexDirection: "row",
    gap: sp.lg,
    paddingHorizontal: sp.lg,
    paddingVertical: sp.md,
  },
  chip: { color: vela.muted2, fontSize: 13, fontFamily: font.medium },
  chipOn: { color: vela.textLight, fontFamily: font.semibold },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp.md,
    paddingHorizontal: sp.lg,
    paddingTop: sp.md,
    paddingBottom: sp.xxl + sp.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: vela.divider,
  },
  count: { flex: 1, color: vela.muted, fontSize: 13, fontFamily: font.regular },
  cta: {
    paddingHorizontal: sp.xl,
    height: 44,
    borderRadius: r.md,
    backgroundColor: vela.action,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: "#fff", fontSize: 15, fontFamily: font.semibold },
});
