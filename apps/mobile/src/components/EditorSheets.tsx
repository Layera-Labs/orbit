/**
 * Editor sheets — Vela's panel set, driven by the store's `panel` state.
 * Bottom sheets: Insert · Audio · Video Settings · Project menu · Editor
 * Preferences. Full-screen: Filter · Export. Every control here does what it
 * says — the "soon" placeholders are gone, because a picker that answers a tap
 * with an apology is worse than one that offers less.
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeInUp } from "react-native-reanimated";
import { font, mono, orbitTonal, vela, RATIOS, ratioLabel } from "../constants";
import { VIcon, type VIconName } from "./VIcon";
import { BottomSheet as BaseBottomSheet } from "./BottomSheet";
import { InputSheet } from "./InputSheet";
import { VSlider } from "./VSlider";
import { ColorSheet } from "./ColorSheet";
import { TextSettingsSheet } from "./TextSettingsSheet";
import { FILTER_LIST } from "../filters/registry";
import {
  BG_IMAGES,
  EMOJIS,
  GRADIENT_PRESETS,
  SFX,
  SOLID_PRESETS,
  STICKERS,
  openmojiUrl,
} from "../content/catalog";
import {
  BUNDLED_BG,
  BUNDLED_EMOJI,
  BUNDLED_SFX,
  BUNDLED_STICKER,
} from "../content/assets";
import {
  addBundledSfx,
  addBundledSticker,
  addStickerFromUrl,
  addStockItem,
  setBackgroundFromPhoto,
  setBackgroundFromUrl,
  setBundledBackground,
} from "../content/library";
import { getStockKey, setStockKey, type StockProvider } from "../content/keys";
import { AiGenerateModal } from "./AiGenerateModal";
import { AuthSheet } from "./AuthSheet";
import { GenHistorySheet } from "./GenHistorySheet";
import { TtsSheet } from "./TtsSheet";
import { ExportOverlay } from "./ExportOverlay";
import { BuyCreditsSheet } from "./BuyCreditsSheet";
import { AiHubSheet } from "./AiHubSheet";
import { MediaDrawerSheet } from "./MediaDrawerSheet";
import { AudioDrawerSheet } from "./AudioDrawerSheet";
import { TextDrawerSheet } from "./TextDrawerSheet";
import { serverCapabilities } from "../net/capabilities";
import { normalizeRotation } from "../preview/transform";
import { AudioClipSheet } from "./AudioClipSheet";
import { MosaicSheet } from "./MosaicSheet";
import { MagnifierSheet } from "./MagnifierSheet";
import { StorySheet } from "./StorySheet";
import {
  searchStock,
  isMissingKey,
  type StockItem,
  type StockKind,
} from "../content/stock";
import { Linking } from "react-native";
import type {
  BlendMode,
  ClipFilter,
  ClipMask,
  ExportOutput,
  Keyframe,
  MaskShape,
  Motion,
  MotionType,
  TransitionType,
  VolumePoint,
} from "../model/types";
import { FULL_FRAME } from "../model/types";
import { sampleKeyframes } from "../preview/keyframes";
import { projectDuration } from "../model/project";
import { clipAtTime, newId } from "../model/editor-ops";
import type { VisualTrackClip } from "../model/types";
import { copyIntoMedia, videoThumbnail } from "../storage/media";
import { pickAndAddMedia } from "../media/pick";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import {
  effectsTarget,
  selectedOverlay,
  useEditor,
} from "../store/editorStore";


/**
 * Shown by the per-clip tools (FX / Filter) when `effectsTarget()` is null —
 * i.e. nothing is selected AND the playhead sits past the end of the base track
 * or over a gap. Without this the sliders still move and display a value while
 * silently applying to nothing, which reads as a broken control.
 */
function NoClipTarget({ what }: { what: string }) {
  return (
    <View style={s.noTarget}>
      <VIcon name="video" size={22} color={vela.lightMuted} />
      <Text style={s.noTargetText}>
        Select a clip, or move the playhead over one, to apply {what}.
      </Text>
    </View>
  );
}

// ---- shared bits ---------------------------------------------------------

/** Every editor tool uses the same light sheet surface and dim strength. */
function BottomSheet({
  style,
  dim = "#0005",
  ...props
}: React.ComponentProps<typeof BaseBottomSheet>) {
  return (
    <BaseBottomSheet {...props} dim={dim} style={[s.editorSheet, style]} />
  );
}

function VToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange?: () => void;
}) {
  return (
    <Pressable
      onPress={onChange}
      style={[
        s.tgTrack,
        { backgroundColor: value ? vela.accent : vela.toggleOff },
      ]}
    >
      <View
        style={[s.tgKnob, { backgroundColor: "#fff", left: value ? 22 : 2 }]}
      />
    </Pressable>
  );
}

function FullSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <StatusBar style="auto" />
      <View style={s.full}>{children}</View>
    </Modal>
  );
}

// ---- Video Settings ------------------------------------------------------

function VideoSettingsSheet() {
  const project = useEditor((s) => s.project)!;
  const setRatio = useEditor((s) => s.setRatio);
  const setHdr = useEditor((s) => s.setHdr);
  const sourceDims = useEditor((s) => s.sourceDims);
  const setPanel = useEditor((s) => s.setPanel);
  const close = () => setPanel(null);

  const options = sourceDims
    ? [
        {
          key: "orig",
          label: "Original",
          width: sourceDims.width,
          height: sourceDims.height,
        },
        ...RATIOS,
      ]
    : RATIOS;

  return (
    <BottomSheet onClose={close}>
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Video Settings</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.ratioRow}
      >
        {options.map((r) => {
          const on = r.width === project.width && r.height === project.height;
          const fg = on ? vela.accent : vela.ink3;
          return (
            <Pressable
              key={r.key}
              style={[s.ratioCard, on && s.ratioCardOn]}
              onPress={() => setRatio(r.width, r.height)}
            >
              <View style={[s.ratioBox, { borderColor: fg }]} />
              <Text style={[s.ratioLabel, { color: fg }]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={s.infoCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.infoTitle}>HDR</Text>
          {/* It used to promise a "brighter preview". The preview's HDR
              treatment was removed on purpose — this screen cannot display
              HDR, so a bloom made the preview lighter than the file it exists
              to predict. All this flag does now is arm the export toggle. */}
          <Text style={s.infoSub}>
            Turn on HDR10 (10-bit HEVC) by default when exporting
          </Text>
        </View>
        <Switch
          accessibilityLabel="HDR video"
          value={!!project.hdr}
          onValueChange={setHdr}
          trackColor={{ true: vela.accent, false: "#c7c9d4" }}
          ios_backgroundColor="#c7c9d4"
          thumbColor="#fff"
        />
      </View>
    </BottomSheet>
  );
}

// ---- Project menu --------------------------------------------------------

function ProjectMenuSheet() {
  const name = useEditor((s) => s.name);
  const project = useEditor((s) => s.project)!;
  const setName = useEditor((s) => s.setName);
  const setPoster = useEditor((s) => s.setPoster);
  const setPanel = useEditor((s) => s.setPanel);
  const shareExport = useEditor((s) => s.shareExport);
  const saveAsTemplate = useEditor((s) => s.saveAsTemplate);
  const [renaming, setRenaming] = useState(false);
  const close = () => setPanel(null);

  async function setCover() {
    close();
    const st = useEditor.getState();
    const mainTrack = st.project?.tracks?.find((t) => t.kind === "visual");
    const c = mainTrack
      ? (clipAtTime(mainTrack, st.playheadSec) as VisualTrackClip | undefined)
      : undefined;
    if (!c) {
      Alert.alert(
        "Cover",
        "Add a video or image first, move the playhead, then set a cover.",
      );
      return;
    }
    if (c.type === "image") {
      setPoster(c.src);
      Alert.alert("Cover set", "Project cover updated.");
      return;
    }
    const t = await videoThumbnail(
      c.src,
      (c.trimIn ?? 0) + (st.playheadSec - c.start),
    );
    if (t) {
      setPoster(t);
      Alert.alert("Cover set", "Project cover updated to the current frame.");
    } else {
      Alert.alert("Cover", "Could not capture the frame.");
    }
  }

  if (renaming) {
    return (
      <InputSheet
        title="Rename project"
        initialValue={name}
        placeholder="Project name"
        onSave={setName}
        onClose={() => setRenaming(false)}
      />
    );
  }

  return (
    <BottomSheet onClose={close} style={s.menuSheet}>
      <View style={s.menuHeader}>
        <View>
          <Text style={s.menuTitle} numberOfLines={1}>
            {name || "Untitled"}
          </Text>
          <Text style={s.menuSub}>
            {ratioLabel(project.width, project.height)}
          </Text>
        </View>
        <Pressable onPress={() => setRenaming(true)} hitSlop={10}>
          <VIcon name="pencil" size={24} color={vela.ink2} />
        </Pressable>
      </View>
      <View style={s.menuDivider} />
      <Pressable style={s.menuRow} onPress={() => setRenaming(true)}>
        <VIcon name="pencil" size={24} color={vela.ink2} />
        <Text style={s.menuRowText}>Rename</Text>
      </Pressable>
      <Pressable style={s.menuRow} onPress={setCover}>
        <VIcon name="image" size={24} color={vela.ink2} />
        <Text style={s.menuRowText}>Set cover</Text>
      </Pressable>
      <Pressable
        style={s.menuRow}
        onPress={() => {
          close();
          shareExport();
        }}
      >
        <VIcon name="export" size={24} color={vela.ink2} />
        <Text style={s.menuRowText}>Share Project</Text>
      </Pressable>
      <Pressable
        style={s.menuRow}
        onPress={() => {
          close();
          saveAsTemplate();
          Alert.alert(
            "Saved",
            "Saved as a template. Find it in Discover → My Templates.",
          );
        }}
      >
        <VIcon name="templates" size={24} color={vela.ink2} />
        <Text style={s.menuRowText}>Save as Template</Text>
      </Pressable>
    </BottomSheet>
  );
}

// ---- Insert / Audio grids ------------------------------------------------

interface GridItem {
  label: string;
  icon: VIconName;
  color?: string;
  onPress: () => void;
}

interface GridSection {
  title: string;
  items: GridItem[];
  columns: 2 | 3 | 4;
}

const GRID_COLORS = [
  "#5b4bff",
  "#2f7bff",
  "#15b8a6",
  "#f39b3f",
  "#e84da0",
  "#8b5cf6",
];

function GridSheet({
  title,
  sections,
}: {
  title: string;
  sections: GridSection[];
}) {
  const setPanel = useEditor((s) => s.setPanel);
  return (
    <BottomSheet onClose={() => setPanel(null)}>
      <View style={s.handle} />
      <Text style={s.gridTitle}>{title}</Text>
      {sections.map((section, sectionIndex) => {
        const width =
          section.columns === 2
            ? "48.5%"
            : section.columns === 3
              ? "31.5%"
              : "23.2%";
        return (
          <View key={section.title} style={s.gridSection}>
            <Text style={s.gridSectionTitle}>{section.title}</Text>
            <View style={s.grid}>
              {section.items.map((it, index) => {
                const color =
                  it.color ??
                  GRID_COLORS[(sectionIndex * 4 + index) % GRID_COLORS.length];
                return (
                  <Animated.View
                    key={it.label}
                    entering={FadeInUp.delay(
                      (sectionIndex * 4 + index) * 40,
                    ).duration(220)}
                    style={{ width }}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        s.gridCard,
                        pressed && s.gridCardPressed,
                      ]}
                      onPress={it.onPress}
                    >
                      <View
                        style={[s.gridIcon, { backgroundColor: `${color}1c` }]}
                      >
                        <VIcon
                          name={it.icon}
                          size={section.columns === 2 ? 25 : 23}
                          color={color}
                          strokeWidth={1.9}
                        />
                      </View>
                      <Text
                        style={s.gridLabel}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.78}
                      >
                        {it.label}
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        );
      })}
    </BottomSheet>
  );
}

function InsertSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const openLibrary = useEditor((s) => s.openLibrary);
  const addText = useEditor((s) => s.addText);
  const close = () => setPanel(null);
  const items: Array<{
    label: string;
    detail: string;
    icon: VIconName;
    color: string;
    onPress: () => void;
  }> = [
    {
      label: "Video",
      detail: "Add video to timeline",
      icon: "video",
      color: "#4e72ff",
      onPress: () => {
        close();
        void pickAndAddMedia();
      },
    },
    {
      label: "Photo",
      detail: "Add photo to timeline",
      icon: "photos",
      color: "#35a8c9",
      onPress: () => {
        close();
        void pickAndAddMedia();
      },
    },
    {
      label: "Text",
      detail: "Add text layer",
      icon: "text",
      color: vela.accent,
      onPress: () => {
        close();
        addText();
      },
    },
    {
      label: "Sticker",
      detail: "Add sticker or emoji",
      icon: "sticker",
      color: "#f39b3f",
      onPress: () => openLibrary("stickers"),
    },
    {
      label: "Audio",
      detail: "Add music or sound",
      icon: "audio",
      color: "#e84da0",
      onPress: () => setPanel("audio"),
    },
    {
      label: "Voiceover",
      detail: "Record voice",
      icon: "record",
      color: "#4186ed",
      onPress: () => setPanel("voiceover"),
    },
  ];
  return (
    <BottomSheet onClose={close} style={s.addTrackSheet} dim="#0005">
      <View style={s.addTrackHead}>
        <Text style={s.addTrackTitle}>Add Track</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="close" size={22} color={vela.ink2} />
        </Pressable>
      </View>
      {items.map((item) => (
        <Pressable
          key={item.label}
          style={s.addTrackRow}
          onPress={item.onPress}
        >
          <View
            style={[s.addTrackIcon, { backgroundColor: `${item.color}18` }]}
          >
            <VIcon name={item.icon} size={22} color={item.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.addTrackLabel}>{item.label}</Text>
            <Text style={s.addTrackDetail}>{item.detail}</Text>
          </View>
          <VIcon name="chevronRight" size={17} color={vela.lightMuted} />
        </Pressable>
      ))}
    </BottomSheet>
  );
}

function AudioSheet() {
  return <AudioDrawerSheet />;
}

/** Persistent text-style chooser for the timeline's T lane. */
function TextTrackSheet() {
  return <TextDrawerSheet />;
}

/** Focused chooser for image/sticker/PiP overlay lanes. */
function ImageTrackSheet() {
  return <MediaDrawerSheet mode="overlay" />;
}

/** The visual-track "+" chooser: create with AI, upload from device, or pick from the Library. */
function AddVisualSheet() {
  return <MediaDrawerSheet mode="main" />;
}

// ---- Editor Preferences --------------------------------------------------

const FPS_STEPS = [24, 25, 30, 50, 60];

function PrefsSheet() {
  const prefs = useEditor((s) => s.prefs);
  const setPref = useEditor((s) => s.setPref);
  const setPanel = useEditor((s) => s.setPanel);
  const close = () => setPanel(null);

  return (
    <BottomSheet onClose={close} style={s.prefsSheet}>
      <View style={s.rowBetween}>
        <Text style={s.prefsTitle}>Editor Preferences</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={26} color={vela.accent} />
        </Pressable>
      </View>

      <Text style={s.prefsSection}>Tracks</Text>
      <View style={s.prefsCard}>
        <View style={s.prefRow}>
          <VIcon name="prefTracks" size={24} color={vela.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={s.prefName}>Main Track Mode</Text>
            <Text style={s.prefSub}>
              Fluid timeline; auto-snapping enabled.
            </Text>
          </View>
          <View style={s.segment}>
            {(["Quick", "Pro"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setPref("mainTrack", m)}
                style={[s.segItem, prefs.mainTrack === m && s.segItemOn]}
              >
                <Text
                  style={[
                    s.segText,
                    prefs.mainTrack === m && { color: vela.accent },
                  ]}
                >
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={s.prefDivider} />
        <View style={s.prefRow}>
          <VIcon name="prefLinkage" size={24} color={vela.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={s.prefName}>Track Linkage</Text>
            <Text style={s.prefSub}>
              Other elements move or delete with main clips.
            </Text>
          </View>
          <VToggle
            value={prefs.linkage}
            onChange={() => setPref("linkage", !prefs.linkage)}
          />
        </View>
      </View>

      <Text style={s.prefsSection}>Canvas</Text>
      <View style={[s.prefsCard, s.prefRow]}>
        <VIcon name="prefSnap" size={24} color={vela.textDim} />
        <View style={{ flex: 1 }}>
          <Text style={s.prefName}>Object Snapping</Text>
          <Text style={s.prefSub}>
            When off, objects snap only to edges or center.
          </Text>
        </View>
        <VToggle
          value={prefs.snapping}
          onChange={() => setPref("snapping", !prefs.snapping)}
        />
      </View>

      <Text style={s.prefsSection}>Preview</Text>
      <View style={s.prefsCard}>
        <View style={[s.prefRow, { marginBottom: 14 }]}>
          <VIcon name="prefFps" size={24} color={vela.textDim} />
          <Text style={s.prefName}>Preview FPS</Text>
        </View>
        <View style={s.fpsRow}>
          {FPS_STEPS.map((v) => (
            <Pressable key={v} onPress={() => setPref("previewFps", v)}>
              <Text
                style={[s.fpsLabel, prefs.previewFps === v && s.fpsLabelOn]}
              >
                {v}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={s.prefsSection}>Stock media</Text>
      <Pressable
        style={[s.prefsCard, s.prefRow]}
        onPress={() => setPanel("keys")}
      >
        <VIcon name="lock" size={22} color={vela.textDim} />
        <View style={{ flex: 1 }}>
          <Text style={s.prefName}>Stock API Keys</Text>
          <Text style={s.prefSub}>
            Your Unsplash / Pexels keys for stock photos & videos.
          </Text>
        </View>
        <VIcon name="chevronRight" size={20} color={vela.muted3} />
      </Pressable>
    </BottomSheet>
  );
}

// ---- Filter (live grade) -------------------------------------------------

const FILTER_SWATCH: Record<string, readonly [string, string]> = {
  none: ["#9a9aa2", "#5e5e68"],
  vivid: ["#ff5a5f", "#2f7bff"],
  warm: ["#f2c14e", "#c04a2a"],
  cool: ["#37b6f0", "#2f3a8a"],
  mono: ["#cfcfd6", "#3a3a42"],
  fade: ["#d9c3a4", "#9a9aa2"],
  film: ["#8a6d4a", "#3a2a20"],
};
const r2 = (n: number) => Math.round(n * 100) / 100;

function AdjustRow({
  label,
  value,
  min,
  max,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <View style={s.adjustRow}>
      <Text style={s.adjustLabel}>{label}</Text>
      <View style={{ flex: 1 }}>
        <VSlider value={value} min={min} max={max} onChange={onChange} />
      </View>
      <Text style={s.adjustVal}>{fmt(value)}</Text>
    </View>
  );
}

/** Filter / Adjust / FX — all three are per-clip look controls, so they share
 *  one sheet. `initialTab` lets the Effect tool open straight on FX. */
function FilterSheet({
  initialTab = "filter",
}: {
  initialTab?: "filter" | "adjust" | "fx";
}) {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipFilter = useEditor((s) => s.applyClipFilter);
  const close = () => setPanel(null);
  const [filter, setFilter] = useState<ClipFilter>(
    () => effectsTarget()?.clip.filter ?? {},
  );
  const [tab, setTab] = useState<"filter" | "adjust" | "fx">(initialTab);
  const applyClipBlur = useEditor((s) => s.applyClipBlur);
  const [blur, setBlur] = useState(() => effectsTarget()?.clip.blur ?? 0);
  const setBlurValue = (v: number) => {
    setBlur(v);
    applyClipBlur(v);
  };
  // Same guard as the FX tab: filters are per-clip, so with no target every
  // control would silently do nothing while still looking live.
  const hasTarget = !!effectsTarget();
  const apply = (f: ClipFilter) => {
    setFilter(f);
    applyClipFilter(Object.keys(f).length ? f : undefined);
  };
  const preset = filter.preset ?? "none";
  const intensity = filter.intensity ?? 1;

  return (
    <BottomSheet onClose={close} style={s.filterSheet} dim="#0002">
      <View style={s.rowBetween}>
        <View style={{ flexDirection: "row", gap: 26 }}>
          <Pressable onPress={() => setTab("filter")}>
            <Text style={tab === "filter" ? s.fTabOn : s.fTabOff}>Filter</Text>
          </Pressable>
          <Pressable onPress={() => setTab("adjust")}>
            <Text style={tab === "adjust" ? s.fTabOn : s.fTabOff}>Adjust</Text>
          </Pressable>
          <Pressable onPress={() => setTab("fx")}>
            <Text style={tab === "fx" ? s.fTabOn : s.fTabOff}>FX</Text>
          </Pressable>
        </View>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>

      {!hasTarget ? <NoClipTarget what="a filter" /> : null}

      {tab === "filter" ? (
        <View
          style={!hasTarget ? s.disabled : undefined}
          pointerEvents={hasTarget ? "auto" : "none"}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterThumbRow}
          >
            {FILTER_LIST.map(({ key, label }) => {
              const on = preset === key;
              return (
                <Pressable
                  key={key}
                  style={s.filterThumb}
                  onPress={() =>
                    apply(key === "none" ? {} : { preset: key, intensity })
                  }
                >
                  <LinearGradient
                    colors={FILTER_SWATCH[key] ?? FILTER_SWATCH.none}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[s.filterThumbImg, on && s.filterThumbOn]}
                  />
                  <Text
                    style={[s.filterThumbLabel, on && s.filterThumbLabelOn]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {preset !== "none" ? (
            <View style={s.intensityRow}>
              <Text style={s.intensityLabel}>Intensity</Text>
              <View style={{ flex: 1 }}>
                <VSlider
                  value={intensity}
                  min={0}
                  max={1}
                  onChange={(v) => apply({ ...filter, intensity: r2(v) })}
                />
              </View>
              <Text style={s.intensityVal}>{Math.round(intensity * 100)}</Text>
            </View>
          ) : null}
        </View>
      ) : tab === "fx" ? (
        <View
          style={[{ gap: 16 }, !hasTarget && s.disabled]}
          pointerEvents={hasTarget ? "auto" : "none"}
        >
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Blur</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={blur}
                min={0}
                max={1}
                onChange={(v) => setBlurValue(r2(v))}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(blur * 100)}%</Text>
          </View>
          <View style={s.chipRow}>
            {[0, 0.25, 0.5, 1].map((v) => (
              <Pressable
                key={v}
                onPress={() => setBlurValue(v)}
                style={[s.chip, blur === v && s.chipOn]}
              >
                <Text
                  style={[s.chipText, blur === v && { color: vela.accent }]}
                >
                  {v === 0 ? "None" : `${Math.round(v * 100)}%`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={{ gap: 2 }} pointerEvents={hasTarget ? "auto" : "none"}>
          <AdjustRow
            label="Brightness"
            value={filter.brightness ?? 0}
            min={-0.5}
            max={0.5}
            onChange={(v) => apply({ ...filter, brightness: r2(v) })}
            fmt={(v) => `${Math.round(v * 100)}`}
          />
          <AdjustRow
            label="Contrast"
            value={filter.contrast ?? 1}
            min={0.5}
            max={1.8}
            onChange={(v) => apply({ ...filter, contrast: r2(v) })}
            fmt={(v) => v.toFixed(2)}
          />
          <AdjustRow
            label="Saturation"
            value={filter.saturation ?? 1}
            min={0}
            max={2.5}
            onChange={(v) => apply({ ...filter, saturation: r2(v) })}
            fmt={(v) => v.toFixed(2)}
          />
          <AdjustRow
            label="Temperature"
            value={filter.temperature ?? 0}
            min={-1}
            max={1}
            onChange={(v) => apply({ ...filter, temperature: r2(v) })}
            fmt={(v) => `${Math.round(v * 100)}`}
          />
        </View>
      )}
    </BottomSheet>
  );
}

// ---- Export (full screen) ------------------------------------------------

const RES_STEPS = [
  { label: "480p", scale: 0.45 },
  { label: "720p", scale: 0.667 },
  { label: "1080p", scale: 1 },
  { label: "2K", scale: 1.4 },
  { label: "4K", scale: 2 },
];
const FPS_OPTS = [24, 25, 30, 50, 60];

/** Mbps at the reference point — 1080p, 30fps — for each quality step. */
const QUALITY_MBPS = { Low: 6, Medium: 12, High: 18 } as const;
/** AAC stereo, the rate the render service encodes audio at. */
const AUDIO_MBPS = 0.192;

/**
 * The bitrate this export should actually be encoded at.
 *
 * It scales with frame rate linearly and with PIXEL COUNT sub-linearly — the
 * `1.5` exponent on a linear scale factor is pixels to the power 0.75, which is
 * roughly how H.264 behaves: a bigger frame needs more bits, but not
 * proportionally more, because its detail is spread over more pixels and
 * predicts better. That puts 4K/High at ~51 Mbps, which is where every
 * published recommendation for 4K30 H.264 sits.
 *
 * It was `scale²` with a 40 Mbps reference, and that was not merely generous —
 * it asked for 160 Mbps at 4K/High, and the VBV buffer that implies pushes
 * x264 to emit **H.264 Level 6.1**, which Apple cannot decode. The export then
 * rendered perfectly and was rejected by Photos at the very last step. See the
 * level cap in `ffmpeg.ts`; the numbers here are the other half of that fix.
 *
 * One function, feeding both the size on screen and the rate sent to the
 * server, so the estimate and the file can never disagree.
 */
function exportMbps(
  quality: keyof typeof QUALITY_MBPS,
  scale: number,
  fps: number,
): number {
  return QUALITY_MBPS[quality] * scale ** 1.5 * (fps / 30);
}

/**
 * yuv420p subsamples chroma by two, so an odd dimension has no valid encoding.
 * `buildFFmpegArgs` already evens what it is handed — `1920 * 0.667` asks for
 * 1281 — so this changes no output; it makes the size the client requested and
 * the size the server encodes the same number, which is what anything
 * reasoning about the request downstream has to be able to assume.
 */
const evenPx = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function ExportSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const exportToPhotos = useEditor((s) => s.exportToPhotos);
  const project = useEditor((s) => s.project);
  const projectName = useEditor((s) => s.name);
  const posterUri = useEditor((s) => s.posterUri);
  const serverUrl = useEditor((s) => s.serverUrl);
  const [quality, setQuality] = useState<"Low" | "Medium" | "High">("High");
  const [audioOnly, setAudioOnly] = useState(false);
  const [wantHdr, setWantHdr] = useState(!!project?.hdr);
  const [resIdx, setResIdx] = useState(2);
  const [fpsIdx, setFpsIdx] = useState(2);
  const close = () => setPanel(null);

  /*
   * Only offer HDR10 where this server's ffmpeg can produce it. `zscale` is a
   * compile-time option and a stock Homebrew build does not have it, so the
   * toggle used to be there, be flipped, and fail the export with a message
   * about libzimg — which is a true message and a useless control.
   *
   * `wantHdr` is what the user asked for; `hdr` is what will be sent. Keeping
   * them separate means turning it on, losing the server, and getting it back
   * does not silently forget the choice.
   */
  const [hdrCapable, setHdrCapable] = useState(false);
  useEffect(() => {
    let alive = true;
    void serverCapabilities(serverUrl).then((caps) => {
      if (alive) setHdrCapable(caps.hdr);
    });
    return () => {
      alive = false;
    };
  }, [serverUrl]);
  const hdr = wantHdr && hdrCapable;

  const W = project?.width ?? 1080;
  const H = project?.height ?? 1920;
  const dur = project ? projectDuration(project) : 0;
  const scale = RES_STEPS[resIdx].scale;
  const fps = FPS_OPTS[fpsIdx];
  const bitrate = Math.round(exportMbps(quality, scale, fps) * 10) / 10;
  const estMB = Math.max(
    1,
    Math.round(((audioOnly ? AUDIO_MBPS : bitrate + AUDIO_MBPS) * dur) / 8),
  );

  const onExport = () => {
    const output: ExportOutput = audioOnly
      ? { audioOnly: true }
      : {
          width: evenPx(W * scale),
          height: evenPx(H * scale),
          fps,
          bitrate,
          hdr: hdr || undefined,
        };
    exportToPhotos(output);
  };

  return (
    <FullSheet onClose={close}>
      <View style={s.exportTopRow}>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="back" size={23} color={vela.ink2} />
        </Pressable>
        <Text style={s.exportTitle}>Export</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View style={s.exportSummary}>
          <View style={s.exportThumbFrame}>
            {posterUri ? (
              <Image
                source={{ uri: posterUri }}
                style={s.exportThumbInner}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={orbitTonal}
                style={s.exportThumbInner}
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.exportProject} numberOfLines={1}>
              {projectName || "New Project"}
            </Text>
            <Text style={s.exportMeta}>
              {RES_STEPS[resIdx].label} · {fps}fps · {Math.round(dur)}s
            </Text>
          </View>
        </View>
        <View style={s.exportBody}>
          <Text style={s.exportField}>Resolution</Text>
          <View style={s.scaleRow}>
            {RES_STEPS.map((step, index) => (
              <Pressable
                key={step.label}
                onPress={() => setResIdx(index)}
                style={[s.exportOption, index === resIdx && s.exportOptionOn]}
              >
                <Text
                  style={[s.scaleLabel, index === resIdx && s.scaleLabelOn]}
                >
                  {step.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.exportField}>Frame Rate</Text>
          <View style={s.scaleRow}>
            {FPS_OPTS.map((value, index) => (
              <Pressable
                key={value}
                onPress={() => setFpsIdx(index)}
                style={[s.exportOption, index === fpsIdx && s.exportOptionOn]}
              >
                <Text
                  style={[s.scaleLabel, index === fpsIdx && s.scaleLabelOn]}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.exportField}>Quality</Text>
          <View style={s.qualityRow}>
            {(["Low", "Medium", "High"] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setQuality(value)}
                style={[s.qualityOption, quality === value && s.exportOptionOn]}
              >
                <Text
                  style={[s.scaleLabel, quality === value && s.scaleLabelOn]}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={s.exportAdvanced}>
            {hdrCapable ? (
              <>
                <View style={s.rowBetween}>
                  <Text style={s.exportToggleLabel}>HDR10</Text>
                  <VToggle
                    value={wantHdr}
                    onChange={() => setWantHdr((value) => !value)}
                  />
                </View>
                <View style={s.exportDivider} />
              </>
            ) : null}
            <View style={s.rowBetween}>
              <Text style={s.exportToggleLabel}>Audio only</Text>
              <VToggle
                value={audioOnly}
                onChange={() => setAudioOnly((value) => !value)}
              />
            </View>
          </View>

          <View style={s.estimateRow}>
            <Text style={s.estimateLabel}>Estimated file size</Text>
            <Text style={s.estimateValue}>~ {estMB} MB</Text>
          </View>
        </View>
      </ScrollView>
      <Pressable style={s.exportBtn} onPress={onExport}>
        <Text style={s.exportBtnText}>Export Video</Text>
      </Pressable>
      <View style={s.savedHint}>
        <VIcon name="check" size={13} color={vela.success} />
        <Text style={s.savedHintText}>Saves to Photos</Text>
      </View>
    </FullSheet>
  );
}

// Text styling lives in the tabbed TextSettingsSheet (rendered for the 'textedit'
// panel — see the render map below).

// ---- Transition ----------------------------------------------------------

/*
 * Two, and they are the two that are real.
 *
 * Dissolve, Slide, Wipe and Zoom used to sit here marked "soon" and answered a
 * tap with an alert. They were never coming: `buildMultiTrackArgs` applies
 * transitions to the FIRST VISUAL TRACK ONLY and collapses every non-fade type
 * to a fade through black, and `frameStateAt` reproduces that collapse on
 * purpose so the preview is never better than the export. Shipping them would
 * mean lying in two places at once — the picker would promise a wipe, the
 * preview would show a fade, and the file would contain a fade.
 *
 * Web already offers only these two. This is mobile agreeing.
 */
const TRANSITIONS: {
  key: TransitionType;
  label: string;
  icon: VIconName;
}[] = [
  { key: "cut", label: "None", icon: "close" },
  { key: "fade", label: "Fade", icon: "trFade" },
];

function TransitionSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const setSelectedTransition = useEditor((s) => s.setSelectedTransition);
  const selected = useEditor((s) => s.selected);
  const current = useEditor((s) => {
    const tr = (s.project?.tracks ?? []).find(
      (t) => t.id === selected?.trackId,
    );
    const c =
      tr?.kind === "visual"
        ? tr.clips.find((x) => x.id === selected?.clipId)
        : undefined;
    return c?.transitionIn;
  });
  const close = () => setPanel(null);
  const [dur, setDur] = useState(current?.duration ?? 0.5);
  const type: TransitionType = current?.type ?? "cut";

  const apply = (key: TransitionType) => {
    setSelectedTransition(
      key === "cut" ? undefined : { type: key, duration: dur },
    );
  };

  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Transition</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, paddingVertical: 2 }}
      >
        {TRANSITIONS.map((t) => {
          const on = type === t.key;
          return (
            <Pressable
              key={t.key}
              style={s.trItem}
              onPress={() => apply(t.key)}
            >
              <View style={[s.trIcon, on && s.trIconOn]}>
                <VIcon
                  name={t.icon}
                  size={22}
                  color={on ? vela.accent : "#fff"}
                />
              </View>
              <Text style={[s.trLabel, on && { color: vela.accent }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {type !== "cut" ? (
        <View style={s.intensityRow}>
          <Text style={s.intensityLabel}>Duration</Text>
          <View style={{ flex: 1 }}>
            <VSlider
              value={dur}
              min={0.2}
              max={2}
              onChange={(v) => {
                const d = Math.round(v * 10) / 10;
                setDur(d);
                setSelectedTransition({ type, duration: d });
              }}
            />
          </View>
          <Text style={s.intensityVal}>{dur.toFixed(1)}s</Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

// ---- Speed / Volume ------------------------------------------------------

function SpeedSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipSpeed = useEditor((s) => s.applyClipSpeed);
  const [speed, setSpeed] = useState(() => effectsTarget()?.clip.speed ?? 1);
  const close = () => setPanel(null);
  const set = (v: number) => {
    setSpeed(v);
    applyClipSpeed(v);
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Speed</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <View style={s.intensityRow}>
        <Text style={s.intensityLabel}>Speed</Text>
        <View style={{ flex: 1 }}>
          <VSlider
            value={speed}
            min={0.25}
            max={4}
            onChange={(v) => set(Math.round(v * 100) / 100)}
          />
        </View>
        <Text style={s.intensityVal}>{speed.toFixed(2)}×</Text>
      </View>
      <View style={s.chipRow}>
        {[0.5, 1, 2, 3].map((v) => (
          <Pressable
            key={v}
            onPress={() => set(v)}
            style={[s.chip, speed === v && s.chipOn]}
          >
            <Text style={[s.chipText, speed === v && { color: vela.accent }]}>
              {v}×
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

function VolumeSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipVolume = useEditor((s) => s.applyClipVolume);
  const [vol, setVol] = useState(() => {
    const { selected, project } = useEditor.getState();
    const tracks = project?.tracks ?? [];
    if (selected) {
      const tr = tracks.find((t) => t.id === selected.trackId);
      const c = tr?.clips.find((x) => x.id === selected.clipId);
      if (c) return c.volume ?? 1;
    }
    return effectsTarget()?.clip.volume ?? 1;
  });
  const close = () => setPanel(null);
  const set = (v: number) => {
    setVol(v);
    applyClipVolume(v);
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Volume</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <View style={s.intensityRow}>
        <Text style={s.intensityLabel}>Volume</Text>
        <View style={{ flex: 1 }}>
          <VSlider
            value={vol}
            min={0}
            max={2}
            onChange={(v) => set(Math.round(v * 20) / 20)}
          />
        </View>
        <Text style={s.intensityVal}>{Math.round(vol * 100)}%</Text>
      </View>
    </BottomSheet>
  );
}

const MOTION_PRESETS: { type: MotionType; label: string }[] = [
  { type: "none", label: "None" },
  { type: "zoomIn", label: "Zoom In" },
  { type: "zoomOut", label: "Zoom Out" },
  { type: "panLeft", label: "Pan Left" },
  { type: "panRight", label: "Pan Right" },
  { type: "panUp", label: "Pan Up" },
  { type: "panDown", label: "Pan Down" },
  { type: "kenBurns", label: "Ken Burns" },
];

function MotionSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipMotion = useEditor((s) => s.applyClipMotion);
  const [motion, setMotion] = useState<Motion>(
    () =>
      selectedOverlay()?.motion ??
      effectsTarget()?.clip.motion ?? { type: "none", intensity: 0.5 },
  );
  const close = () => setPanel(null);
  const setType = (type: MotionType) => {
    const next = { type, intensity: motion.intensity ?? 0.5 };
    setMotion(next);
    applyClipMotion(next);
  };
  const setIntensity = (intensity: number) => {
    const next = { ...motion, intensity };
    setMotion(next);
    applyClipMotion(next);
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Motion</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <View style={s.motionGrid}>
        {MOTION_PRESETS.map((p) => (
          <Pressable
            key={p.type}
            onPress={() => setType(p.type)}
            style={[s.motionChip, motion.type === p.type && s.chipOn]}
          >
            <Text
              style={[
                s.chipText,
                motion.type === p.type && { color: vela.accent },
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {motion.type !== "none" ? (
        <View style={s.intensityRow}>
          <Text style={s.intensityLabel}>Strength</Text>
          <View style={{ flex: 1 }}>
            <VSlider
              value={motion.intensity ?? 0.5}
              min={0.1}
              max={1}
              onChange={(v) => setIntensity(Math.round(v * 100) / 100)}
            />
          </View>
          <Text style={s.intensityVal}>
            {Math.round((motion.intensity ?? 0.5) * 100)}%
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const CUTOUT_SWATCHES = ["#00d400", "#0047ff", "#ffffff", "#000000"];

function CutoutSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipCutout = useEditor((s) => s.applyClipCutout);
  const [cut, setCut] = useState(() => effectsTarget()?.clip.cutout);
  const [showColor, setShowColor] = useState(false);
  const close = () => setPanel(null);
  const on = !!cut;
  const update = (next: typeof cut) => {
    setCut(next);
    applyClipCutout(next);
  };
  const toggle = () =>
    update(
      on ? undefined : { color: "#00d400", similarity: 0.3, smoothness: 0.1 },
    );
  const patch = (p: Partial<NonNullable<typeof cut>>) =>
    update({
      color: cut?.color ?? "#00d400",
      similarity: cut?.similarity ?? 0.3,
      smoothness: cut?.smoothness ?? 0.1,
      ...p,
    });
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Remove Background</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <View style={s.chipRow}>
        <Pressable onPress={toggle} style={[s.chip, on && s.chipOn]}>
          <Text style={[s.chipText, on && { color: vela.accent }]}>
            {on ? "On" : "Off"}
          </Text>
        </Pressable>
      </View>
      {on ? (
        <>
          <View style={s.rowBetween}>
            <Text style={s.intensityLabel}>Key colour</Text>
            <View
              style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
            >
              {CUTOUT_SWATCHES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => patch({ color: c })}
                  style={[
                    s.cutSwatch,
                    { backgroundColor: c },
                    cut?.color === c && s.cutSwatchOn,
                  ]}
                />
              ))}
              <Pressable
                onPress={() => setShowColor(true)}
                style={[
                  s.cutSwatch,
                  {
                    backgroundColor: cut?.color ?? "#00d400",
                    borderColor: "#fff",
                    borderWidth: 1,
                  },
                ]}
              >
                <VIcon name="color" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Tolerance</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={cut?.similarity ?? 0.3}
                min={0.05}
                max={0.9}
                onChange={(v) =>
                  patch({ similarity: Math.round(v * 100) / 100 })
                }
              />
            </View>
            <Text style={s.intensityVal}>
              {Math.round((cut?.similarity ?? 0.3) * 100)}%
            </Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Feather</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={cut?.smoothness ?? 0.1}
                min={0}
                max={0.5}
                onChange={(v) =>
                  patch({ smoothness: Math.round(v * 100) / 100 })
                }
              />
            </View>
            <Text style={s.intensityVal}>
              {Math.round((cut?.smoothness ?? 0.1) * 100)}%
            </Text>
          </View>
        </>
      ) : null}
      {showColor ? (
        <ColorSheet
          value={cut?.color ?? "#00d400"}
          onChange={(hex) => patch({ color: hex })}
          onClose={() => setShowColor(false)}
        />
      ) : null}
    </BottomSheet>
  );
}

function TrimSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const trimClip = useEditor((s) => s.trimClip);
  const mediaDurations = useEditor((s) => s.mediaDurations);
  const t = effectsTarget();
  const clip = t?.clip;
  const srcDur = clip ? mediaDurations[clip.src] : undefined;
  const isImage = clip?.type === "image";
  // Video clips are bounded by the source length; images can run any length.
  const maxDur = isImage ? 30 : (srcDur ?? 60);
  const [trimIn, setTrimIn] = useState(() => clip?.trimIn ?? 0);
  const [dur, setDur] = useState(() => clip?.duration ?? 1);
  const close = () => setPanel(null);
  if (!t || !clip) {
    return (
      <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
        <Text style={s.sheetTitle}>Trim</Text>
        <Text style={s.intensityLabel}>Select a clip to trim.</Text>
      </BottomSheet>
    );
  }
  const maxIn = isImage ? 0 : Math.max(0, (srcDur ?? maxDur) - 0.1);
  const setIn = (v: number) => {
    const ni = Math.max(0, Math.min(maxIn, v));
    setTrimIn(ni);
    // keep the out-point within source bounds when shifting the in-point
    const room = srcDur ? srcDur - ni : maxDur;
    const nd = Math.min(dur, Math.max(0.1, room));
    setDur(nd);
    trimClip(t.trackId, t.clipId, { trimIn: ni, duration: nd });
  };
  const setDuration = (v: number) => {
    const room = !isImage && srcDur ? srcDur - trimIn : maxDur;
    const nd = Math.max(0.1, Math.min(room, v));
    setDur(nd);
    trimClip(t.trackId, t.clipId, { duration: nd });
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Trim</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      {!isImage ? (
        <View style={s.intensityRow}>
          <Text style={s.intensityLabel}>Start</Text>
          <View style={{ flex: 1 }}>
            <VSlider
              value={trimIn}
              min={0}
              max={Math.max(0.1, maxIn)}
              onChange={(v) => setIn(Math.round(v * 10) / 10)}
            />
          </View>
          <Text style={s.intensityVal}>{trimIn.toFixed(1)}s</Text>
        </View>
      ) : null}
      <View style={s.intensityRow}>
        <Text style={s.intensityLabel}>Duration</Text>
        <View style={{ flex: 1 }}>
          <VSlider
            value={dur}
            min={0.1}
            max={Math.max(0.2, maxDur)}
            onChange={(v) => setDuration(Math.round(v * 10) / 10)}
          />
        </View>
        <Text style={s.intensityVal}>{dur.toFixed(1)}s</Text>
      </View>
      <Text style={s.trimReadout}>
        {isImage
          ? `Shows for ${dur.toFixed(1)}s`
          : `Source ${trimIn.toFixed(1)}s → ${(trimIn + dur).toFixed(1)}s${srcDur ? ` of ${srcDur.toFixed(1)}s` : ""}`}
      </Text>
    </BottomSheet>
  );
}

function KeyframeSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipKeyframes = useEditor((s) => s.applyClipKeyframes);
  const playheadSec = useEditor((s) => s.playheadSec);
  const ov = selectedOverlay();
  const t = effectsTarget();
  // Unify the keyframe subject across a visual clip and a text overlay.
  const subject = ov
    ? {
        start: ov.start,
        duration: Math.max(0.001, ov.end - ov.start),
        baseX: ov.x,
        baseY: ov.y,
        keyframes: ov.keyframes,
      }
    : t?.clip
      ? {
          start: t.clip.start,
          duration: t.clip.duration,
          baseX: (t.clip.rect ?? FULL_FRAME).x,
          baseY: (t.clip.rect ?? FULL_FRAME).y,
          keyframes: t.clip.keyframes,
        }
      : null;
  const [kfs, setKfs] = useState<Keyframe[]>(() => subject?.keyframes ?? []);
  const close = () => setPanel(null);
  if (!subject) {
    return (
      <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
        <Text style={s.sheetTitle}>Keyframes</Text>
        <Text style={s.intensityLabel}>
          Select a clip or caption to animate.
        </Text>
      </BottomSheet>
    );
  }
  const localT = Math.max(
    0,
    Math.min(
      1,
      (playheadSec - subject.start) / Math.max(0.001, subject.duration),
    ),
  );
  const r = { x: subject.baseX, y: subject.baseY };
  const push = (next: Keyframe[]) => {
    const ks = [...next].sort((a, b) => a.t - b.t);
    setKfs(ks);
    applyClipKeyframes(ks.length ? ks : undefined);
  };
  const addAtPlayhead = () => {
    const base = kfs.length
      ? sampleKeyframes(kfs, localT)
      : { opacity: 1, x: r.x, y: r.y };
    const without = kfs.filter((k) => Math.abs(k.t - localT) > 0.01);
    push([
      ...without,
      { t: localT, opacity: base.opacity, x: base.x, y: base.y },
    ]);
  };
  // The keyframe nearest the playhead is the one the sliders edit (CapCut-style).
  const idx = kfs.length
    ? kfs.reduce(
        (b, k, i) =>
          Math.abs(k.t - localT) < Math.abs(kfs[b].t - localT) ? i : b,
        0,
      )
    : -1;
  const sel = idx >= 0 ? kfs[idx] : null;
  const editSel = (patch: Partial<Keyframe>) =>
    idx >= 0 && push(kfs.map((k, i) => (i === idx ? { ...k, ...patch } : k)));
  return (
    <BottomSheet onClose={close} style={{ gap: 14 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Keyframes</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <View style={s.rowBetween}>
        <Pressable onPress={addAtPlayhead} style={s.kfAddBtn}>
          <VIcon name="keyframe" size={16} color={vela.onAccent} />
          <Text style={s.kfAddText}>Add at playhead</Text>
        </Pressable>
        {kfs.length ? (
          <Pressable onPress={() => push([])} hitSlop={8}>
            <Text style={s.kfClear}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>
      {kfs.length ? (
        <View style={s.kfTrack}>
          {kfs.map((k, i) => (
            <View
              key={i}
              style={[
                s.kfDiamond,
                i === idx && s.kfDiamondOn,
                { left: `${k.t * 100}%` },
              ]}
            />
          ))}
          <View style={[s.kfPlayhead, { left: `${localT * 100}%` }]} />
        </View>
      ) : (
        <Text style={s.intensityLabel}>
          Add 2+ keyframes to animate opacity + position. Scrub the playhead,
          change a value, add a keyframe.
        </Text>
      )}
      {sel ? (
        <>
          <Text style={s.kfEditing}>
            Editing keyframe at {Math.round(sel.t * 100)}%
          </Text>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Opacity</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={sel.opacity}
                min={0}
                max={1}
                onChange={(v) =>
                  editSel({ opacity: Math.round(v * 100) / 100 })
                }
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(sel.opacity * 100)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>X</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={sel.x}
                min={-0.5}
                max={1}
                onChange={(v) => editSel({ x: Math.round(v * 100) / 100 })}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(sel.x * 100)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Y</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={sel.y}
                min={-0.5}
                max={1}
                onChange={(v) => editSel({ y: Math.round(v * 100) / 100 })}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(sel.y * 100)}%</Text>
          </View>
          <Pressable
            onPress={() => push(kfs.filter((_, i) => i !== idx))}
            hitSlop={6}
            style={s.kfRemoveButton}
          >
            <Text style={s.kfRemove}>Remove this keyframe</Text>
          </Pressable>
        </>
      ) : null}
    </BottomSheet>
  );
}

function OpacitySheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipOpacity = useEditor((s) => s.applyClipOpacity);
  const [op, setOp] = useState(
    () => selectedOverlay()?.opacity ?? effectsTarget()?.clip.opacity ?? 1,
  );
  const close = () => setPanel(null);
  const set = (v: number) => {
    setOp(v);
    applyClipOpacity(v);
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Opacity</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <View style={s.intensityRow}>
        <Text style={s.intensityLabel}>Opacity</Text>
        <View style={{ flex: 1 }}>
          <VSlider
            value={op}
            min={0}
            max={1}
            onChange={(v) => set(Math.round(v * 100) / 100)}
          />
        </View>
        <Text style={s.intensityVal}>{Math.round(op * 100)}%</Text>
      </View>
    </BottomSheet>
  );
}

function PositionSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipRect = useEditor((s) => s.applyClipRect);
  const applyClipTransform = useEditor((s) => s.applyClipTransform);
  const updateSelectedOverlay = useEditor((s) => s.updateSelectedOverlay);
  const overlay0 = selectedOverlay();
  const [overlay, setOverlay] = useState(() =>
    overlay0
      ? { x: overlay0.x, y: overlay0.y, fontSize: overlay0.fontSize }
      : null,
  );
  const target0 = effectsTarget();
  const r0 = target0?.clip.rect ?? { x: 0, y: 0, w: 1, h: 1 };
  const [r, setR] = useState(r0);
  const [rot, setRot] = useState(() =>
    normalizeRotation(target0?.clip.rotation),
  );
  const close = () => setPanel(null);
  /*
   * Scale about the centre, keeping the clip's PROPORTIONS.
   *
   * It used to set w and h to the same number, which turned any non-square clip
   * into a square the instant the slider was touched — a 16:9 PiP became a
   * square crop of itself and there was no way back. `size` is now a factor of
   * the clip's own shape, not an absolute side.
   */
  const setSize = (factor: number) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    // Never smaller than a target you could still grab, never past the canvas.
    const lo = 0.06 / Math.max(0.001, Math.max(r0.w, r0.h));
    const hi = 1 / Math.max(0.001, Math.max(r0.w, r0.h));
    const scale = Math.max(lo, Math.min(hi, factor));
    const nw = r0.w * scale;
    const nh = r0.h * scale;
    const nr = {
      x: Math.max(0, Math.min(1 - nw, cx - nw / 2)),
      y: Math.max(0, Math.min(1 - nh, cy - nh / 2)),
      w: nw,
      h: nh,
    };
    setR(nr);
    applyClipRect(nr);
  };
  const setRotation = (deg: number) => {
    const d = normalizeRotation(deg);
    setRot(d);
    applyClipTransform(target0!.trackId, target0!.clipId, { rotation: d });
  };
  const setPos = (axis: "x" | "y", v: number) => {
    const nr = {
      ...r,
      [axis]: Math.max(0, Math.min(1 - (axis === "x" ? r.w : r.h), v)),
    };
    setR(nr);
    applyClipRect(nr);
  };
  // The slider reads as a factor of the clip's own starting size, so 100% is
  // "as it was" rather than "as wide as the canvas".
  const size = r0.w > 0 ? r.w / r0.w : 1;
  const setTextPosition = (
    patch: Partial<{ x: number; y: number; fontSize: number }>,
  ) => {
    if (!overlay) return;
    const next = { ...overlay, ...patch };
    setOverlay(next);
    updateSelectedOverlay(next);
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 14 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Position</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      {overlay ? (
        <>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>X</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={overlay.x}
                min={0}
                max={1}
                onChange={(v) =>
                  setTextPosition({ x: Math.round(v * 100) / 100 })
                }
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(overlay.x * 100)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Y</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={overlay.y}
                min={0}
                max={1}
                onChange={(v) =>
                  setTextPosition({ y: Math.round(v * 100) / 100 })
                }
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(overlay.y * 100)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Size</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={overlay.fontSize}
                min={12}
                max={240}
                onChange={(v) => setTextPosition({ fontSize: Math.round(v) })}
              />
            </View>
            <Text style={s.intensityVal}>{overlay.fontSize}px</Text>
          </View>
        </>
      ) : (
        <>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>X</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={r.x}
                min={0}
                max={Math.max(0.001, 1 - r.w)}
                onChange={(v) => setPos("x", Math.round(v * 100) / 100)}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(r.x * 100)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Y</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={r.y}
                min={0}
                max={Math.max(0.001, 1 - r.h)}
                onChange={(v) => setPos("y", Math.round(v * 100) / 100)}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(r.y * 100)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Size</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={size}
                min={0.1}
                max={2}
                onChange={(v) => setSize(Math.round(v * 100) / 100)}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(size * 100)}%</Text>
          </View>
          {/* The exact-angle path. The preview's rotate handle snaps to 15°
              steps, which is right for a finger and wrong when you want 7. */}
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Rotate</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={rot}
                min={-180}
                max={180}
                onChange={(v) => setRotation(Math.round(v))}
              />
            </View>
            <Text style={s.intensityVal}>{rot}°</Text>
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const DEFAULT_MASK: ClipMask = {
  shape: "rectangle",
  cx: 0.5,
  cy: 0.5,
  rx: 0.35,
  ry: 0.35,
  invert: false,
};

function MaskSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipMask = useEditor((s) => s.applyClipMask);
  const textTarget = selectedOverlay();
  const [mask, setMask] = useState<ClipMask | undefined>(
    () => textTarget?.mask ?? effectsTarget()?.clip.mask,
  );
  const close = () => setPanel(null);
  const on = !!mask;
  const update = (m: ClipMask | undefined) => {
    setMask(m);
    applyClipMask(m);
  };
  const patch = (p: Partial<ClipMask>) =>
    update({ ...(mask ?? DEFAULT_MASK), ...p });
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0003">
      <View style={s.rowBetween}>
        <View>
          <Text style={s.sheetTitle}>Mask</Text>
          <Text style={s.maskHint}>
            Reveal only the part of the layer you need
          </Text>
        </View>
        <Pressable onPress={close} hitSlop={10} style={s.maskDone}>
          <VIcon name="check" size={19} color="#fff" />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.maskPresetRow}
      >
        <Pressable
          onPress={() => update(on ? undefined : DEFAULT_MASK)}
          style={[s.maskPreset, !on && s.maskPresetOn]}
        >
          <View style={s.maskNone}>
            <VIcon
              name="close"
              size={22}
              color={!on ? vela.accent : vela.ink3}
            />
          </View>
          <Text style={[s.maskPresetText, !on && { color: vela.accent }]}>
            None
          </Text>
        </Pressable>
        {(["rectangle", "circle"] as MaskShape[]).map((sh) => {
          const selected = on && mask!.shape === sh && !mask!.invert;
          return (
            <Pressable
              key={sh}
              onPress={() =>
                update({ ...(mask ?? DEFAULT_MASK), shape: sh, invert: false })
              }
              style={[s.maskPreset, selected && s.maskPresetOn]}
            >
              <View
                style={[
                  s.maskShapePreview,
                  sh === "circle" && s.maskCirclePreview,
                  selected && s.maskShapePreviewOn,
                ]}
              />
              <Text
                style={[s.maskPresetText, selected && { color: vela.accent }]}
              >
                {sh === "rectangle" ? "Rectangle" : "Circle"}
              </Text>
            </Pressable>
          );
        })}
        {!textTarget ? (
          <Pressable
            onPress={() => update({ ...(mask ?? DEFAULT_MASK), invert: true })}
            style={[s.maskPreset, on && !!mask!.invert && s.maskPresetOn]}
          >
            <View style={s.maskInvertPreview}>
              <View style={s.maskInvertHole} />
            </View>
            <Text
              style={[
                s.maskPresetText,
                on && !!mask!.invert && { color: vela.accent },
              ]}
            >
              Invert
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {on ? (
        <>
          <Text style={s.maskSectionTitle}>Geometry</Text>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Width</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={mask!.rx}
                min={0.05}
                max={0.5}
                onChange={(v) => patch({ rx: Math.round(v * 100) / 100 })}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(mask!.rx * 200)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Height</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={mask!.ry}
                min={0.05}
                max={0.5}
                onChange={(v) => patch({ ry: Math.round(v * 100) / 100 })}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(mask!.ry * 200)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>X</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={mask!.cx}
                min={0}
                max={1}
                onChange={(v) => patch({ cx: Math.round(v * 100) / 100 })}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(mask!.cx * 100)}%</Text>
          </View>
          <View style={s.intensityRow}>
            <Text style={s.intensityLabel}>Y</Text>
            <View style={{ flex: 1 }}>
              <VSlider
                value={mask!.cy}
                min={0}
                max={1}
                onChange={(v) => patch({ cy: Math.round(v * 100) / 100 })}
              />
            </View>
            <Text style={s.intensityVal}>{Math.round(mask!.cy * 100)}%</Text>
          </View>
        </>
      ) : null}
    </BottomSheet>
  );
}

function VoiceoverSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const playheadSec = useEditor((s) => s.playheadSec);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const close = () => setPanel(null);
  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  const start = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone needed",
          "Allow microphone access to record a voiceover.",
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timer.current = setInterval(
        () => setElapsed((Date.now() - startedAt.current) / 1000),
        100,
      );
    } catch (e) {
      Alert.alert(
        "Recording failed",
        e instanceof Error ? e.message : String(e),
      );
    }
  };
  const stop = async () => {
    clearTimer();
    setRecording(false);
    const secs = (Date.now() - startedAt.current) / 1000;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri && secs > 0.3) {
        const src = copyIntoMedia(uri, "m4a");
        useEditor.getState().importAudio({
          id: newId("a"),
          src,
          start: playheadSec,
          duration: Math.max(0.3, secs),
          volume: 1,
        });
      }
    } catch (e) {
      Alert.alert(
        "Recording failed",
        e instanceof Error ? e.message : String(e),
      );
    }
    close();
  };

  return (
    <BottomSheet
      onClose={close}
      style={{ gap: 18, alignItems: "center", paddingVertical: 28 }}
      dim="#0007"
    >
      <Text style={s.sheetTitle}>Voiceover</Text>
      <Text style={s.voTime}>{elapsed.toFixed(1)}s</Text>
      <Pressable
        onPress={recording ? stop : start}
        style={[s.recBtn, recording && s.recBtnOn]}
      >
        <VIcon name={recording ? "pause" : "record"} size={30} color="#fff" />
      </Pressable>
      <Text style={s.voHint}>
        {recording
          ? "Recording… tap to stop & add"
          : "Tap to record from the playhead"}
      </Text>
    </BottomSheet>
  );
}

function SoundFxSheet() {
  const setPanel = useEditor((st) => st.setPanel);
  const player = useAudioPlayer();
  const close = () => setPanel(null);
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      try {
        player.remove();
      } catch {}
    };
    // player identity is stable for the sheet's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const audition = (id: string) => {
    try {
      player.replace(BUNDLED_SFX[id]);
      player.seekTo(0);
      player.play();
    } catch {}
  };
  const add = (item: (typeof SFX)[number]) => {
    void addBundledSfx(BUNDLED_SFX[item.id], item.dur);
    setPanel(null);
  };
  return (
    <BottomSheet
      onClose={close}
      style={{ gap: 8, paddingBottom: 20 }}
      dim="#0006"
    >
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Sound FX</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <Text style={s.sfxHint}>
        Tap to preview · Add drops it at the playhead
      </Text>
      <ScrollView
        style={{ maxHeight: 400 }}
        showsVerticalScrollIndicator={false}
      >
        {SFX.map((item) => (
          <View key={item.id} style={s.sfxRow}>
            <Pressable style={s.sfxTap} onPress={() => audition(item.id)}>
              <View style={s.sfxPlay}>
                <VIcon name="play" size={15} color={vela.accent} />
              </View>
              <Text style={s.sfxLabel}>{item.label}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => add(item)} style={s.sfxAdd}>
              <Text style={s.sfxAddText}>Add</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const BLEND_OPTS: { mode: BlendMode; label: string }[] = [
  { mode: "normal", label: "Normal" },
  { mode: "multiply", label: "Multiply" },
  { mode: "screen", label: "Screen" },
  { mode: "overlay", label: "Overlay" },
  { mode: "darken", label: "Darken" },
  { mode: "lighten", label: "Lighten" },
  { mode: "difference", label: "Difference" },
  { mode: "add", label: "Add" },
];

function BlendSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipBlend = useEditor((s) => s.applyClipBlend);
  const [mode, setMode] = useState<BlendMode>(
    () => effectsTarget()?.clip.blend ?? "normal",
  );
  const close = () => setPanel(null);
  const set = (m: BlendMode) => {
    setMode(m);
    applyClipBlend(m);
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Blending</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <View style={s.motionGrid}>
        {BLEND_OPTS.map((b) => (
          <Pressable
            key={b.mode}
            onPress={() => set(b.mode)}
            style={[s.motionChip, mode === b.mode && s.chipOn]}
          >
            <Text
              style={[s.chipText, mode === b.mode && { color: vela.accent }]}
            >
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const CURVE_PRESETS: {
  key: string;
  label: string;
  pts: VolumePoint[] | undefined;
}[] = [
  { key: "flat", label: "Flat", pts: undefined },
  {
    key: "in",
    label: "Fade In",
    pts: [
      { t: 0, v: 0 },
      { t: 0.25, v: 1 },
      { t: 1, v: 1 },
    ],
  },
  {
    key: "out",
    label: "Fade Out",
    pts: [
      { t: 0, v: 1 },
      { t: 0.75, v: 1 },
      { t: 1, v: 0 },
    ],
  },
  {
    key: "inout",
    label: "In + Out",
    pts: [
      { t: 0, v: 0 },
      { t: 0.15, v: 1 },
      { t: 0.85, v: 1 },
      { t: 1, v: 0 },
    ],
  },
  {
    key: "duck",
    label: "Duck",
    pts: [
      { t: 0, v: 1 },
      { t: 0.3, v: 0.25 },
      { t: 0.7, v: 0.25 },
      { t: 1, v: 1 },
    ],
  },
  {
    key: "swell",
    label: "Swell",
    pts: [
      { t: 0, v: 0.3 },
      { t: 0.5, v: 1.4 },
      { t: 1, v: 0.3 },
    ],
  },
];

/** A tiny SVG-free graph of a volume envelope (0..1 gain band). */
function CurveGraph({ pts }: { pts: VolumePoint[] }) {
  const W = 260;
  const H = 60;
  const gy = (v: number) => H - Math.max(0, Math.min(1, v / 2)) * H;
  const dots = [...pts].sort((a, b) => a.t - b.t);
  return (
    <View
      style={{
        width: W,
        height: H,
        alignSelf: "center",
        backgroundColor: vela.lightSurface,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {dots.map((p, i) => {
        if (i === 0) return null;
        const a = dots[i - 1];
        const x1 = a.t * W;
        const y1 = gy(a.v);
        const x2 = p.t * W;
        const y2 = gy(p.v);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: x1,
              top: y1,
              width: len,
              height: 2,
              backgroundColor: vela.accent,
              transform: [{ translateY: -1 }, { rotateZ: `${ang}deg` }],
              transformOrigin: "left center",
            }}
          />
        );
      })}
      {dots.map((p, i) => (
        <View
          key={`d${i}`}
          style={{
            position: "absolute",
            left: p.t * W - 3,
            top: gy(p.v) - 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: "#fff",
          }}
        />
      ))}
    </View>
  );
}

function CurveSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipVolumeCurve = useEditor((s) => s.applyClipVolumeCurve);
  const initial = (() => {
    const { selected, project } = useEditor.getState();
    const tr = project?.tracks?.find((t) => t.id === selected?.trackId);
    const c = tr?.clips.find((x) => x.id === selected?.clipId) as
      | { volumeCurve?: VolumePoint[] }
      | undefined;
    return c?.volumeCurve;
  })();
  const [pts, setPts] = useState<VolumePoint[] | undefined>(initial);
  const close = () => setPanel(null);
  const set = (p: VolumePoint[] | undefined) => {
    setPts(p);
    applyClipVolumeCurve(p);
  };
  const flat: VolumePoint[] = [
    { t: 0, v: 1 },
    { t: 1, v: 1 },
  ];
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Volume Curve</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <CurveGraph pts={pts && pts.length >= 2 ? pts : flat} />
      <View style={s.motionGrid}>
        {CURVE_PRESETS.map((p) => {
          const on = p.pts
            ? JSON.stringify(pts) === JSON.stringify(p.pts)
            : !pts;
          return (
            <Pressable
              key={p.key}
              onPress={() => set(p.pts)}
              style={[s.motionChip, on && s.chipOn]}
            >
              <Text style={[s.chipText, on && { color: vela.accent }]}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

function StockTab({ onPick }: { onPick: () => void }) {
  const setPanel = useEditor((s) => s.setPanel);
  const [provider, setProvider] = useState<StockProvider>("unsplash");
  const [kind, setKind] = useState<StockKind>("image");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [needKey, setNeedKey] = useState<StockProvider | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const effKind: StockKind = provider === "unsplash" ? "image" : kind; // Unsplash = images only

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setErr(null);
    setNeedKey(null);
    try {
      setResults(await searchStock(provider, query.trim(), effKind));
    } catch (e) {
      setResults([]);
      if (isMissingKey(e)) setNeedKey(provider);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={s.chipRow}>
        {(["unsplash", "pexels"] as StockProvider[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => setProvider(p)}
            style={[s.chip, provider === p && s.chipOn]}
          >
            <Text
              style={[s.chipText, provider === p && { color: vela.accent }]}
            >
              {p === "unsplash" ? "Unsplash" : "Pexels"}
            </Text>
          </Pressable>
        ))}
        {provider === "pexels"
          ? (["image", "video"] as StockKind[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[s.chip, effKind === k && s.chipOn]}
              >
                <Text
                  style={[s.chipText, effKind === k && { color: vela.accent }]}
                >
                  {k === "image" ? "Photos" : "Videos"}
                </Text>
              </Pressable>
            ))
          : null}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TextInput
          style={[s.keyInput, { flex: 1 }]}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={run}
          returnKeyType="search"
          placeholder={`Search ${provider}…`}
          placeholderTextColor={vela.muted3}
          autoCapitalize="none"
        />
        <Pressable onPress={run} style={s.stockSearchBtn}>
          <VIcon name="search" size={20} color={vela.onAccent} />
        </Pressable>
      </View>

      {needKey ? (
        <Pressable onPress={() => setPanel("keys")} style={s.stockPrompt}>
          <Text style={s.prefName}>
            Add your {needKey === "unsplash" ? "Unsplash" : "Pexels"} API key
          </Text>
          <Text style={s.prefSub}>
            Stock search uses your own key. Tap to add it →
          </Text>
        </Pressable>
      ) : err ? (
        <Text style={[s.prefSub, { color: vela.danger }]}>{err}</Text>
      ) : null}

      <ScrollView
        style={{ maxHeight: 320 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        {loading ? (
          <View
            style={{
              height: 120,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator color={vela.accent} />
          </View>
        ) : (
          <View style={s.libGrid}>
            {results.map((it) => (
              <Pressable
                key={it.id}
                onPress={() => {
                  onPick();
                  void addStockItem(it);
                }}
                style={s.stockCell}
              >
                <Image
                  source={{ uri: it.thumb }}
                  style={s.libSwatch}
                  resizeMode="cover"
                />
                {it.kind === "video" ? (
                  <View style={s.stockVideoBadge}>
                    <VIcon name="play" size={12} color="#fff" />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

type LibraryTab = "stickers" | "emoji" | "backgrounds" | "stock" | "generate";

function ContentLibrarySheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyBackground = useEditor((s) => s.applyBackground);
  const bg = useEditor((s) => s.project?.background);
  const [tab, setTab] = useState<LibraryTab>(useEditor.getState().libraryTab);
  const close = () => setPanel(null);
  const TABS: { key: LibraryTab; label: string }[] = [
    { key: "stickers", label: "Stickers" },
    { key: "emoji", label: "Emoji" },
    { key: "backgrounds", label: "Backgrounds" },
    { key: "stock", label: "Stock" },
  ];
  const bgActive = (p: (typeof GRADIENT_PRESETS)[number]) =>
    bg?.type === p.bg.type &&
    (bg.type === "color"
      ? bg.color === (p.bg as { color: string }).color
      : (bg as { from: string }).from === (p.bg as { from: string }).from);
  return (
    <BottomSheet onClose={close} style={{ gap: 14 }} dim="#0002">
      <View style={s.rowBetween}>
        <View style={{ flexDirection: "row", gap: 22 }}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)}>
              <Text style={tab === t.key ? s.fTabOn : s.fTabOff}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>

      {tab === "backgrounds" ? (
        <ScrollView
          style={{ maxHeight: 380 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
        >
          <Text style={s.libSection}>Gradients</Text>
          <View style={s.libGrid}>
            {GRADIENT_PRESETS.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => applyBackground(p.bg)}
                style={[s.libCell, bgActive(p) && s.libCellOn]}
              >
                <LinearGradient
                  colors={[
                    (p.bg as { from: string }).from,
                    (p.bg as { to: string }).to,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.libSwatch}
                />
              </Pressable>
            ))}
          </View>
          <Text style={s.libSection}>Solid</Text>
          <View style={s.libGrid}>
            {SOLID_PRESETS.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => applyBackground(p.bg)}
                style={[s.libCell, bgActive(p) && s.libCellOn]}
              >
                <View
                  style={[
                    s.libSwatch,
                    {
                      backgroundColor: (p.bg as { color: string }).color,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.15)",
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <Text style={s.libSection}>Images</Text>
          <View style={s.libGrid}>
            <Pressable
              onPress={() => {
                close();
                void setBackgroundFromPhoto();
              }}
              style={[s.libCell, s.bgPhotoCell]}
            >
              <VIcon name="photos" size={22} color="#fff" />
            </Pressable>
            {/* Bundled (offline) backgrounds first, then the network sample set. */}
            {BUNDLED_BG.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => void setBundledBackground(b.module)}
                style={s.libCell}
              >
                <Image
                  source={b.module}
                  style={s.libSwatch}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
            {BG_IMAGES.map((im) => (
              <Pressable
                key={im.id}
                onPress={() => void setBackgroundFromUrl(im.full)}
                style={s.libCell}
              >
                <Image
                  source={{ uri: im.thumb }}
                  style={s.libSwatch}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : tab === "stock" ? (
        <StockTab onPick={close} />
      ) : (
        <ScrollView
          style={{ maxHeight: 380 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          <View style={s.libGrid}>
            {(() => {
              const bundled = tab === "emoji" ? BUNDLED_EMOJI : BUNDLED_STICKER;
              const catalog = tab === "emoji" ? EMOJIS : STICKERS;
              // Bundled (offline) items first so the first screen works with no network.
              const ordered = [
                ...catalog.filter((e) => bundled[e.code]),
                ...catalog.filter((e) => !bundled[e.code]),
              ];
              return ordered.map((e, i) => {
                const mod = bundled[e.code];
                return (
                  <Pressable
                    key={`${e.code}-${i}`}
                    onPress={() => {
                      close();
                      if (mod) void addBundledSticker(mod);
                      else void addStickerFromUrl(openmojiUrl(e.code, 618));
                    }}
                    style={s.emojiCell}
                  >
                    <Image
                      source={mod ?? { uri: openmojiUrl(e.code, 72) }}
                      style={{ width: 44, height: 44 }}
                      resizeMode="contain"
                    />
                  </Pressable>
                );
              });
            })()}
          </View>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function KeyRow({
  provider,
  label,
  url,
  initial,
  onSave,
}: {
  provider: StockProvider;
  label: string;
  url: string;
  initial: string;
  onSave: (p: StockProvider, v: string) => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <View style={{ gap: 6 }}>
      <View style={s.rowBetween}>
        <Text style={s.intensityLabel}>{label}</Text>
        <Pressable onPress={() => void Linking.openURL(url)} hitSlop={8}>
          <Text style={s.keyLink}>Get a key ›</Text>
        </Pressable>
      </View>
      <TextInput
        style={s.keyInput}
        value={val}
        onChangeText={setVal}
        onEndEditing={() => onSave(provider, val)}
        placeholder={`${label} API key`}
        placeholderTextColor={vela.muted3}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
    </View>
  );
}

function KeysSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const close = () => setPanel(null);
  const [initial, setInitial] = useState<{
    unsplash: string;
    pexels: string;
  } | null>(null);
  useEffect(() => {
    (async () =>
      setInitial({
        unsplash: (await getStockKey("unsplash")) ?? "",
        pexels: (await getStockKey("pexels")) ?? "",
      }))();
  }, []);
  const save = (p: StockProvider, v: string) => void setStockKey(p, v);
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0004">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Stock API Keys</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <Text style={s.keyNote}>
        Bring your own keys. Stored in this device's keychain and sent only to
        the provider, never to Orbit's servers.
      </Text>
      {initial ? (
        <>
          <KeyRow
            provider="unsplash"
            label="Unsplash"
            url="https://unsplash.com/developers"
            initial={initial.unsplash}
            onSave={save}
          />
          <KeyRow
            provider="pexels"
            label="Pexels"
            url="https://www.pexels.com/api/"
            initial={initial.pexels}
            onSave={save}
          />
        </>
      ) : (
        <View
          style={{
            height: 120,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={vela.accent} />
        </View>
      )}
    </BottomSheet>
  );
}

// ---- host ----------------------------------------------------------------

export function EditorSheets() {
  const panel = useEditor((s) => s.panel);
  const setPanel = useEditor((s) => s.setPanel);
  const authNext = useEditor((s) => s.authNext);
  return (
    <>
      {panel === "settings" && <VideoSettingsSheet />}
      {panel === "editmenu" && <ProjectMenuSheet />}
      {panel === "insert" && <InsertSheet />}
      {panel === "audio" && <AudioSheet />}
      {panel === "texttrack" && <TextTrackSheet />}
      {panel === "imagetrack" && <ImageTrackSheet />}
      {panel === "prefs" && <PrefsSheet />}
      {panel === "filter" && <FilterSheet />}
      {panel === "export" && <ExportSheet />}
      {panel === "textedit" && <TextSettingsSheet initialTab="text" />}
      {panel === "textedit-font" && <TextSettingsSheet initialTab="font" />}
      {panel === "textedit-size" && <TextSettingsSheet initialTab="size" />}
      {panel === "textedit-color" && <TextSettingsSheet initialTab="color" />}
      {panel === "textedit-stroke" && <TextSettingsSheet initialTab="stroke" />}
      {panel === "transition" && <TransitionSheet />}
      {panel === "speed" && <SpeedSheet />}
      {panel === "volume" && <VolumeSheet />}
      {/* FX is a tab of the per-clip look sheet — the Effect tool opens it there. */}
      {panel === "fx" && <FilterSheet initialTab="fx" />}
      {panel === "motion" && <MotionSheet />}
      {panel === "cutout" && <CutoutSheet />}
      {panel === "trim" && <TrimSheet />}
      {panel === "keyframe" && <KeyframeSheet />}
      {panel === "opacity" && <OpacitySheet />}
      {panel === "position" && <PositionSheet />}
      {panel === "mask" && <MaskSheet />}
      {panel === "mosaic" && <MosaicSheet />}
      {panel === "magnifier" && <MagnifierSheet />}
      {panel === "story" && <StorySheet />}
      {panel === "voiceover" && <VoiceoverSheet />}
      {panel === "audioclip" && <AudioClipSheet />}
      {panel === "soundfx" && <SoundFxSheet />}
      {panel === "auth" && (
        <AuthSheet
          onClose={() => setPanel(null)}
          onAuthed={() => setPanel(authNext)}
        />
      )}
      {panel === "ai" && <AiHubSheet />}
      {panel === "addvisual" && <AddVisualSheet />}
      {panel === "aigen" && <AiGenerateModal />}
      {panel === "genhistory" && <GenHistorySheet />}
      {panel === "tts" && <TtsSheet />}
      {panel === "buycredits" && <BuyCreditsSheet />}
      {panel === "blend" && <BlendSheet />}
      {panel === "curve" && <CurveSheet />}
      {panel === "library" && <ContentLibrarySheet />}
      {panel === "keys" && <KeysSheet />}
      <ExportOverlay />
    </>
  );
}

const s = StyleSheet.create({
  editorSheet: {
    backgroundColor: vela.lightCard,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  backdrop: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  full: { flex: 1, backgroundColor: vela.homeBg },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowBaseline: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  sheetTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: vela.lightMuted3,
    alignSelf: "center",
    marginBottom: 2,
  },

  // Add Track — light, scan-friendly rows matching the app shell.
  addTrackSheet: {
    backgroundColor: vela.lightCard,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    gap: 2,
  },
  addTrackHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  addTrackTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 21 },
  addTrackRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  addTrackIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  addTrackLabel: { color: vela.ink, fontFamily: font.bold, fontSize: 14 },
  addTrackDetail: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 11.5,
    marginTop: 2,
  },

  // toggle
  tgTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
  },
  tgKnob: {
    position: "absolute",
    top: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
  },

  // video settings
  ratioRow: { gap: 12, paddingVertical: 2 },
  ratioCard: {
    width: 78,
    height: 78,
    borderRadius: 14,
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ratioCardOn: {
    backgroundColor: vela.accentSoft,
    borderWidth: 1.5,
    borderColor: vela.accent,
  },
  ratioBox: { width: 24, height: 30, borderWidth: 2, borderRadius: 4 },
  ratioLabel: { fontSize: 13, fontFamily: font.bold },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: vela.lightSurface,
    borderRadius: 16,
    padding: 16,
    marginTop: 2,
  },
  infoTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 16 },
  infoSub: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
    marginTop: 3,
    maxWidth: 230,
  },

  // project menu
  menuSheet: {
    backgroundColor: vela.lightCard,
    gap: 0,
    paddingTop: 24,
    paddingHorizontal: 22,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 18,
  },
  menuTitle: {
    color: vela.ink,
    fontFamily: font.extrabold,
    fontSize: 22,
    maxWidth: 260,
  },
  menuSub: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 14,
    marginTop: 4,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: vela.lightBorder,
    marginBottom: 6,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 16,
  },
  menuRowText: { color: vela.ink2, fontSize: 16, fontFamily: font.semibold },

  // grids
  gridTitle: {
    color: vela.ink,
    fontFamily: font.extrabold,
    fontSize: 20,
    marginBottom: 4,
  },
  gridSection: { gap: 7 },
  gridSectionTitle: {
    color: vela.lightMuted,
    fontFamily: font.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  gridCard: {
    width: "100%",
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  gridCardPressed: { opacity: 0.55 },
  gridIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  gridLabel: {
    color: vela.ink2,
    fontFamily: font.semibold,
    fontSize: 12,
    paddingHorizontal: 3,
    textAlign: "center",
  },

  // prefs
  prefsSheet: { backgroundColor: vela.lightCard, maxHeight: "82%" },
  prefsTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  prefsSection: {
    color: vela.lightMuted,
    fontSize: 12,
    fontFamily: font.bold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  prefsCard: {
    backgroundColor: vela.lightSurface,
    borderRadius: 16,
    padding: 16,
  },
  prefRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  prefDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: vela.lightBorder,
    marginVertical: 14,
  },
  prefName: { color: vela.ink, fontFamily: font.bold, fontSize: 15 },
  prefSub: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12,
    marginTop: 3,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: vela.lightCard,
    borderRadius: 11,
    padding: 3,
  },
  segItem: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 9 },
  segItemOn: { backgroundColor: vela.accentSoft },
  segText: { color: vela.ink3, fontFamily: font.semibold, fontSize: 13 },
  fpsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  fpsLabel: { color: vela.lightMuted, fontFamily: mono.regular, fontSize: 12 },
  fpsLabelOn: { color: vela.accent, fontFamily: mono.bold },

  // filter
  filterThumbRow: { gap: 12, paddingHorizontal: 18, paddingBottom: 14 },
  filterThumb: { width: 62, alignItems: "center", gap: 6 },
  filterThumbImg: {
    width: 62,
    height: 78,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  filterThumbOn: { borderColor: vela.accent },
  filterThumbLabel: {
    fontSize: 11,
    color: vela.lightMuted,
    fontFamily: font.medium,
  },
  filterThumbLabelOn: { color: vela.accent, fontFamily: font.bold },
  intensityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  intensityLabel: { color: vela.ink2, fontSize: 14, fontFamily: font.semibold },
  intensityVal: {
    color: vela.ink2,
    fontFamily: mono.regular,
    fontSize: 14,
    minWidth: 34,
    textAlign: "right",
  },

  trItem: { width: 62, alignItems: "center", gap: 7 },
  trIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  trIconOn: { backgroundColor: vela.accentSoft, borderColor: vela.accent },
  trLabel: { color: vela.ink3, fontSize: 12, fontFamily: font.medium },

  chipRow: { flexDirection: "row", gap: 10 },
  /** Dim the per-clip controls when there's nothing to apply them to. */
  disabled: { opacity: 0.38 },
  noTarget: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: vela.lightSurface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noTargetText: {
    flex: 1,
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  chip: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: vela.accentSoft },
  chipText: { color: vela.ink2, fontFamily: font.semibold, fontSize: 13 },
  maskHint: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
    marginTop: 2,
  },
  maskDone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.accent,
  },
  maskPresetRow: { gap: 12, paddingRight: 18 },
  maskPreset: { width: 82, alignItems: "center", gap: 7 },
  maskPresetOn: {
    borderRadius: 16,
  },
  maskNone: {
    width: 72,
    height: 62,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.lightSurface,
  },
  maskShapePreview: {
    width: 72,
    height: 62,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: vela.lightMuted2,
    backgroundColor: vela.lightSurface,
  },
  maskCirclePreview: { borderRadius: 31 },
  maskShapePreviewOn: {
    borderColor: vela.accent,
    backgroundColor: vela.accentSoft,
  },
  maskInvertPreview: {
    width: 72,
    height: 62,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.ink3,
  },
  maskInvertHole: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: vela.lightCard,
  },
  maskPresetText: {
    color: vela.ink3,
    fontFamily: font.semibold,
    fontSize: 11.5,
  },
  maskSectionTitle: {
    color: vela.ink2,
    fontFamily: font.bold,
    fontSize: 14.5,
    marginTop: 2,
  },

  motionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  motionChip: {
    backgroundColor: vela.lightSurface,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  cutSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cutSwatchOn: { borderWidth: 2, borderColor: vela.accent },
  trimReadout: {
    color: vela.lightMuted,
    fontFamily: mono.regular,
    fontSize: 12,
    textAlign: "center",
  },
  voTime: { color: vela.ink, fontFamily: mono.bold, fontSize: 30 },
  recBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: vela.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  recBtnOn: { backgroundColor: "#7a1f1f" },
  voHint: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 13 },

  sfxHint: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 13 },
  sfxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: vela.lightBorder,
  },
  sfxTap: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  sfxPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: vela.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sfxLabel: { color: vela.ink2, fontFamily: font.semibold, fontSize: 15 },
  sfxAdd: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: vela.accent,
  },
  sfxAddText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 14 },

  libSection: {
    color: vela.lightMuted,
    fontFamily: font.semibold,
    fontSize: 12,
    marginTop: 4,
  },
  creditPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: vela.accentSoft,
  },
  creditText: { color: vela.accent, fontFamily: mono.bold, fontSize: 13 },
  genBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 14,
    backgroundColor: vela.accent,
  },
  genBtnText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 16 },
  libGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  libCell: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: "hidden",
    padding: 2,
  },
  libCellOn: { borderWidth: 2, borderColor: vela.accent },
  libSwatch: { flex: 1, borderRadius: 10 },
  emojiCell: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  bgPhotoCell: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.lightSurface,
  },
  keyNote: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  keyLink: { color: vela.action, fontFamily: font.semibold, fontSize: 13 },
  keyInput: {
    backgroundColor: vela.lightSurface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: vela.ink2,
    fontFamily: mono.regular,
    fontSize: 14,
  },
  stockSearchBtn: {
    width: 46,
    borderRadius: 10,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stockPrompt: {
    backgroundColor: vela.lightSurface,
    borderRadius: 12,
    padding: 14,
    gap: 3,
  },
  stockCell: {
    width: 104,
    height: 104,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: vela.lightSurface,
  },
  stockVideoBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  kfAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: vela.accent,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  kfAddText: { color: vela.onAccent, fontFamily: font.semibold, fontSize: 14 },
  kfClear: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 13 },
  kfTrack: {
    height: 26,
    backgroundColor: vela.lightSurface,
    borderRadius: 13,
    marginVertical: 4,
    justifyContent: "center",
  },
  kfDiamond: {
    position: "absolute",
    width: 12,
    height: 12,
    marginLeft: -6,
    backgroundColor: vela.muted2,
    transform: [{ rotate: "45deg" }],
    top: 7,
  },
  kfDiamondOn: { backgroundColor: vela.accent },
  kfPlayhead: {
    position: "absolute",
    width: 2,
    height: 26,
    marginLeft: -1,
    backgroundColor: vela.ink2,
  },
  kfEditing: { color: vela.ink2, fontFamily: font.medium, fontSize: 13 },
  kfRemove: {
    color: "#fff",
    fontFamily: font.semibold,
    fontSize: 13,
    textAlign: "center",
  },
  kfRemoveButton: {
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.ink2,
  },

  filterSheet: { gap: 14 },
  fTabOn: { color: vela.accent, fontFamily: font.bold, fontSize: 15 },
  fTabOff: { color: vela.lightMuted, fontFamily: font.semibold, fontSize: 15 },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
  },
  adjustLabel: {
    color: vela.ink2,
    fontSize: 14,
    fontFamily: font.medium,
    width: 86,
  },
  adjustVal: {
    color: vela.ink2,
    fontFamily: mono.regular,
    fontSize: 13,
    minWidth: 40,
    textAlign: "right",
  },

  // export
  exportTopRow: {
    height: 96,
    paddingTop: 48,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  exportTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 18 },
  exportSummary: {
    marginHorizontal: 18,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: vela.lightCard,
    padding: 12,
    borderRadius: 16,
  },
  exportThumbFrame: {
    width: 66,
    height: 66,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: vela.lightSurface,
  },
  exportThumbInner: { width: "100%", height: "100%" },
  exportProject: { color: vela.ink, fontFamily: font.bold, fontSize: 15 },
  exportMeta: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12,
    marginTop: 4,
  },
  exportBody: { paddingHorizontal: 18, paddingTop: 4 },
  exportToggleLabel: {
    color: vela.ink,
    fontFamily: font.semibold,
    fontSize: 14,
  },
  exportField: {
    color: vela.ink,
    fontFamily: font.bold,
    fontSize: 14,
    marginTop: 20,
    marginBottom: 9,
  },
  scaleRow: { flexDirection: "row", gap: 8 },
  exportOption: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  exportOptionOn: {
    borderColor: vela.accent,
    backgroundColor: vela.accentSoft,
  },
  scaleLabel: {
    color: vela.ink2,
    fontFamily: font.semibold,
    fontSize: 11.5,
    textAlign: "center",
  },
  scaleLabelOn: { color: vela.accent, fontFamily: font.bold },
  qualityRow: { flexDirection: "row", gap: 8 },
  qualityOption: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    backgroundColor: vela.lightSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  exportAdvanced: {
    backgroundColor: vela.lightCard,
    borderRadius: 15,
    padding: 14,
    gap: 12,
    marginTop: 22,
  },
  exportDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: vela.lightBorder,
  },
  estimateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
  },
  estimateLabel: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
  },
  estimateValue: { color: vela.ink2, fontFamily: mono.medium, fontSize: 12.5 },
  exportBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 18,
    marginTop: 8,
  },
  exportBtnText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 16 },
  savedHint: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
    paddingBottom: 18,
  },
  savedHintText: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 11.5,
  },

  // export progress
  progressBackdrop: {
    flex: 1,
    backgroundColor: "#000c",
    alignItems: "center",
    justifyContent: "center",
  },
  progressCard: {
    backgroundColor: vela.lightCard,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 14,
    minWidth: 200,
  },
  progressMsg: { color: vela.ink, fontSize: 15, fontFamily: font.medium },
});
