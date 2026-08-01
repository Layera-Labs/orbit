/** Persistent text-style drawer used by the timeline's T lane. */
import { useMemo, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated from 'react-native-reanimated';
import { Directory, File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import { font, vela } from "../constants";
import {
  captionFileName,
  clearAutoCaptions,
  hasAutoCaptions,
  hasCaptionText,
  toSRT,
} from "../model/editor-ops";
import type { TextOverlay } from "../model/types";
import { useEditor } from "../store/editorStore";
import { BottomSheet } from "./BottomSheet";
import { VIcon, type VIconName } from "./VIcon";

const EDGE_FADE_W = 28;

/**
 * A horizontal-scroll edge that fades content into the surrounding surface
 * color instead of guillotining it flush at the container edge — a hard cut
 * reads as broken, not scrollable. Only shows on the side that still has
 * content to reveal, so it never lies about scrollability.
 */
function useScrollEdges() {
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const contentW = useRef(0);
  const layoutW = useRef(0);

  const evaluate = (offsetX: number) => {
    setCanLeft(offsetX > 2);
    setCanRight(offsetX < contentW.current - layoutW.current - 2);
  };

  return {
    canLeft,
    canRight,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) =>
      evaluate(e.nativeEvent.contentOffset.x),
    onContentSizeChange: (w: number) => {
      contentW.current = w;
      evaluate(0);
    },
    onLayout: (w: number) => {
      layoutW.current = w;
      evaluate(0);
    },
  };
}

type DrawerTab = "default" | "recent" | "templates" | "captions";
type TemplateCategory = "all" | "titles" | "social" | "editorial" | "utility";

type TextStylePatch = Pick<
  TextOverlay,
  | "text"
  | "fontSize"
  | "color"
  | "align"
  | "bold"
  | "letterSpacing"
  | "lineHeight"
  | "box"
  | "shadow"
  | "stroke"
>;

type TextPreset = {
  id: string;
  name: string;
  category: Exclude<TemplateCategory, "all">;
  previewColor: string;
  previewSurface: string;
  patch: Partial<TextStylePatch> & Pick<TextStylePatch, "text">;
};

const RAIL_TABS: Array<{
  key: DrawerTab;
  label: string;
  icon: VIconName;
  color: string;
}> = [
  { key: "default", label: "Default", icon: "text", color: "#5b4bff" },
  { key: "recent", label: "Recent", icon: "redo", color: "#2f7bff" },
  {
    key: "templates",
    label: "Templates",
    icon: "templates",
    color: "#a44cf2",
  },
  { key: "captions", label: "Captions", icon: "subtitle", color: "#0f8f7a" },
];

const CATEGORIES: Array<{ key: TemplateCategory; label: string }> = [
  { key: "all", label: "All" },
  { key: "titles", label: "Titles" },
  { key: "social", label: "Social" },
  { key: "editorial", label: "Editorial" },
  { key: "utility", label: "Utility" },
];

const RECENT_TINTS = [
  { surface: "#f0edff", accent: "#654cff" },
  { surface: "#e7f1ff", accent: "#2876dc" },
  { surface: "#fff0e8", accent: "#d96b35" },
  { surface: "#fff6d9", accent: "#b77a00" },
  { surface: "#e5f8f2", accent: "#078c75" },
];

const TEMPLATE_PRESETS: TextPreset[] = [
  {
    id: "cover",
    name: "Cover",
    category: "titles",
    previewColor: "#ffffff",
    previewSurface: "#382b7a",
    patch: {
      text: "THE STORY\nSTARTS HERE",
      fontSize: 0.095,
      color: "#ffffff",
      align: "center",
      bold: true,
      letterSpacing: 3,
      lineHeight: 1.05,
      shadow: { color: "#140b36", blur: 10, dy: 4, opacity: 0.55 },
    },
  },
  {
    id: "title",
    name: "Title",
    category: "titles",
    previewColor: "#30255f",
    previewSurface: "#eee9ff",
    patch: {
      text: "Your title",
      fontSize: 0.082,
      color: "#ffffff",
      align: "center",
      bold: true,
      lineHeight: 1.08,
    },
  },
  {
    id: "subtitle",
    name: "Subtitle",
    category: "titles",
    previewColor: "#1f56a4",
    previewSurface: "#e5f0ff",
    patch: {
      text: "A subtitle goes here",
      fontSize: 0.052,
      color: "#ffffff",
      align: "center",
      bold: false,
      lineHeight: 1.2,
    },
  },
  {
    id: "introduction",
    name: "Introduction",
    category: "titles",
    previewColor: "#006d65",
    previewSurface: "#dff7f3",
    patch: {
      text: "HELLO, I’M\nYOUR NAME",
      fontSize: 0.064,
      color: "#ffffff",
      align: "left",
      bold: true,
      letterSpacing: 1.5,
      lineHeight: 1.12,
    },
  },
  {
    id: "chapter",
    name: "Chapter",
    category: "titles",
    previewColor: "#8a4f00",
    previewSurface: "#fff0d9",
    patch: {
      text: "CHAPTER 01\nThe beginning",
      fontSize: 0.058,
      color: "#ffffff",
      align: "left",
      bold: true,
      lineHeight: 1.18,
    },
  },
  {
    id: "bubble",
    name: "Bubble",
    category: "social",
    previewColor: "#5f39b3",
    previewSurface: "#f0e7ff",
    patch: {
      text: "Say something!",
      fontSize: 0.047,
      color: "#39206c",
      align: "center",
      bold: true,
      box: { color: "#f0e7ff", opacity: 0.96, padding: 18 },
    },
  },
  {
    id: "message",
    name: "Message",
    category: "social",
    previewColor: "#155dbb",
    previewSurface: "#e4f1ff",
    patch: {
      text: "New message",
      fontSize: 0.044,
      color: "#153a68",
      align: "left",
      bold: true,
      box: { color: "#e4f1ff", opacity: 0.97, padding: 16 },
    },
  },
  {
    id: "promotion",
    name: "Promotion",
    category: "social",
    previewColor: "#bd315e",
    previewSurface: "#ffe4ed",
    patch: {
      text: "LIMITED OFFER\n50% OFF",
      fontSize: 0.064,
      color: "#ffffff",
      align: "center",
      bold: true,
      letterSpacing: 1.2,
      box: { color: "#d52f68", opacity: 0.94, padding: 18 },
    },
  },
  {
    id: "contact",
    name: "Contact",
    category: "social",
    previewColor: "#08795f",
    previewSurface: "#dff8ee",
    patch: {
      text: "@yourname  •  hello@example.com",
      fontSize: 0.034,
      color: "#ffffff",
      align: "center",
      bold: true,
      box: { color: "#08795f", opacity: 0.92, padding: 14 },
    },
  },
  {
    id: "memo",
    name: "Memo",
    category: "editorial",
    previewColor: "#6b5200",
    previewSurface: "#fff5c7",
    patch: {
      text: "MEMO\nRemember this idea",
      fontSize: 0.044,
      color: "#4a3900",
      align: "left",
      bold: false,
      lineHeight: 1.3,
      box: { color: "#fff5c7", opacity: 0.96, padding: 18 },
    },
  },
  {
    id: "note",
    name: "Note",
    category: "editorial",
    previewColor: "#4e4a63",
    previewSurface: "#f0eef7",
    patch: {
      text: "A quick note…",
      fontSize: 0.042,
      color: "#332e45",
      align: "left",
      bold: false,
      box: { color: "#f4f1fb", opacity: 0.94, padding: 16 },
    },
  },
  {
    id: "list",
    name: "List",
    category: "editorial",
    previewColor: "#5a3eb2",
    previewSurface: "#eee9ff",
    patch: {
      text: "01  First point\n02  Second point\n03  Third point",
      fontSize: 0.04,
      color: "#ffffff",
      align: "left",
      bold: true,
      lineHeight: 1.45,
    },
  },
  {
    id: "menu",
    name: "Menu",
    category: "editorial",
    previewColor: "#754a25",
    previewSurface: "#f7eadc",
    patch: {
      text: "TODAY’S MENU\nStarter  •  Main  •  Dessert",
      fontSize: 0.043,
      color: "#ffffff",
      align: "center",
      bold: true,
      lineHeight: 1.3,
    },
  },
  {
    id: "ppt",
    name: "PPT",
    category: "editorial",
    previewColor: "#bd4b2d",
    previewSurface: "#ffebe5",
    patch: {
      text: "KEY TAKEAWAY\nAdd one clear supporting point",
      fontSize: 0.052,
      color: "#ffffff",
      align: "left",
      bold: true,
      lineHeight: 1.22,
    },
  },
  {
    id: "time",
    name: "Time",
    category: "utility",
    previewColor: "#126b76",
    previewSurface: "#dff7fa",
    patch: {
      text: "09:41",
      fontSize: 0.072,
      color: "#ffffff",
      align: "center",
      bold: true,
      letterSpacing: 2,
    },
  },
  {
    id: "mark",
    name: "Mark",
    category: "utility",
    previewColor: "#1d2433",
    previewSurface: "#fff0a8",
    patch: {
      text: "IMPORTANT",
      fontSize: 0.043,
      color: "#17191f",
      align: "center",
      bold: true,
      letterSpacing: 1.5,
      box: { color: "#ffdc45", opacity: 0.98, padding: 12 },
    },
  },
  {
    id: "watermark",
    name: "Watermark",
    category: "utility",
    previewColor: "#5d6473",
    previewSurface: "#edf0f4",
    patch: {
      text: "@yourbrand",
      fontSize: 0.03,
      color: "#ffffff99",
      align: "right",
      bold: true,
      letterSpacing: 1,
    },
  },
];

const overlayPatch = (overlay: TextOverlay): TextStylePatch => ({
  text: overlay.text,
  fontSize: overlay.fontSize,
  color: overlay.color,
  align: overlay.align,
  bold: overlay.bold,
  letterSpacing: overlay.letterSpacing,
  lineHeight: overlay.lineHeight,
  box: overlay.box,
  shadow: overlay.shadow,
  stroke: overlay.stroke,
});

function recentStyleName(overlay: TextOverlay, projectWidth: number) {
  if (overlay.box) return "Boxed text";
  const ratio = overlay.fontSize / projectWidth;
  if (ratio >= 0.078) return "Heading";
  if (ratio >= 0.052) return "Subheading";
  return "Body text";
}

function recentPreviewColor(color: string, fallback: string) {
  const normalized = color.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (normalized.startsWith("fff") || normalized.startsWith("fefefe")) {
    return fallback;
  }
  return color;
}

export function TextDrawerSheet() {
  const project = useEditor((state) => state.project);
  const addText = useEditor((state) => state.addText);
  const updateSelectedOverlay = useEditor(
    (state) => state.updateSelectedOverlay,
  );
  const setPanel = useEditor((state) => state.setPanel);
  const [tab, setTab] = useState<DrawerTab>("default");
  const [category, setCategory] = useState<TemplateCategory>("all");
  const categoryEdges = useScrollEdges();
  const [selection, setSelection] = useState<{
    id: string;
    label: string;
    patch: Partial<TextStylePatch> & Pick<TextStylePatch, "text">;
  } | null>(null);

  const width = project?.width ?? 1080;
  const defaultPresets = useMemo(
    () => [
      {
        id: "default-heading",
        label: "Heading",
        preview: "Add a heading",
        sizeLabel: "Large",
        surface: "#f1edff",
        accent: "#654cff",
        patch: {
          text: "Add a heading",
          fontSize: Math.round(width * 0.09),
          color: "#ffffff",
          align: "center" as const,
          bold: true,
          lineHeight: 1.08,
        },
      },
      {
        id: "default-subheading",
        label: "Subheading",
        preview: "Add a subheading",
        sizeLabel: "Medium",
        surface: "#eaf3ff",
        accent: "#2876dc",
        patch: {
          text: "Add a subheading",
          fontSize: Math.round(width * 0.062),
          color: "#ffffff",
          align: "center" as const,
          bold: true,
          lineHeight: 1.16,
        },
      },
      {
        id: "default-body",
        label: "Body",
        preview: "Add a little bit of body text",
        sizeLabel: "Small",
        surface: "#e9f8f4",
        accent: "#078c75",
        patch: {
          text: "Add a little bit of body text",
          fontSize: Math.round(width * 0.042),
          color: "#ffffff",
          align: "center" as const,
          bold: false,
          lineHeight: 1.3,
        },
      },
    ],
    [width],
  );

  const recentPresets = useMemo(() => {
    const seen = new Set<string>();
    return [...(project?.overlays ?? [])]
      .reverse()
      .filter((overlay) => {
        const key = `${overlay.text}|${overlay.fontSize}|${overlay.color}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  }, [project?.overlays]);

  const visibleTemplates =
    category === "all"
      ? TEMPLATE_PRESETS
      : TEMPLATE_PRESETS.filter((preset) => preset.category === category);

  const addSelected = () => {
    if (!selection) return;
    addText();
    const nextPatch = { ...selection.patch };
    if (typeof nextPatch.fontSize === "number" && nextPatch.fontSize < 1) {
      nextPatch.fontSize = Math.round(width * nextPatch.fontSize);
    }
    updateSelectedOverlay(nextPatch);
    setPanel(null);
    // Let this native Modal detach before the text editor sheet is mounted.
    setTimeout(() => setPanel("textedit"), 260);
  };

  return (
    <BottomSheet
      onClose={() => setPanel(null)}
      style={styles.sheet}
      dim="#0006"
    >
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Add text</Text>
          <Text style={styles.subtitle}>
            Choose a style, then add it at the playhead.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close text drawer"
          onPress={() => setPanel(null)}
          hitSlop={10}
          style={styles.closeButton}
        >
          <VIcon name="close" size={18} color={vela.ink2} />
        </Pressable>
      </View>

      <View style={styles.workspace}>
        <View style={styles.rail}>
          {RAIL_TABS.map((item) => {
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
         
         
          style={styles.panel}
        >
          {tab === "default" ? (
            <View style={styles.panelFill}>
              <PanelHeading
                title="Default"
                detail="Three useful levels, ready to edit"
              />
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.defaultList}
              >
                {defaultPresets.map((preset, index) => (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: selection?.id === preset.id,
                    }}
                    onPress={() => setSelection(preset)}
                    style={[
                      styles.defaultCard,
                      { backgroundColor: preset.surface },
                      selection?.id === preset.id && styles.selectedCard,
                    ]}
                  >
                    <View
                      style={[
                        styles.defaultGlyph,
                        { backgroundColor: `${preset.accent}18` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.defaultGlyphText,
                          {
                            color: preset.accent,
                            fontSize: index === 0 ? 22 : index === 1 ? 18 : 15,
                          },
                        ]}
                      >
                        Aa
                      </Text>
                    </View>
                    <View style={styles.defaultContent}>
                      <View style={styles.defaultMeta}>
                        <Text
                          style={[
                            styles.defaultLabel,
                            { color: preset.accent },
                          ]}
                        >
                          {preset.label}
                        </Text>
                        <View style={styles.sizePill}>
                          <Text style={styles.sizeMeta}>
                            {preset.sizeLabel} · {preset.patch.fontSize}px
                          </Text>
                        </View>
                      </View>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.defaultPreview,
                          index === 0
                            ? styles.headingPreview
                            : index === 1
                              ? styles.subheadingPreview
                              : styles.bodyPreview,
                        ]}
                      >
                        {preset.preview}
                      </Text>
                    </View>
                    {selection?.id === preset.id ? <SelectedBadge /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : tab === "recent" ? (
            <View style={styles.panelFill}>
              <PanelHeading
                title="Recently used"
                detail="Styles already used in this project"
              />
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.templateGrid}
              >
                {recentPresets.length > 0 ? (
                  recentPresets.map((overlay, index) => {
                    const id = `recent-${overlay.id}`;
                    const name = recentStyleName(overlay, width);
                    const tint = RECENT_TINTS[index % RECENT_TINTS.length];
                    return (
                      <RecentPreviewCard
                        key={id}
                        overlay={overlay}
                        name={name}
                        accent={tint.accent}
                        surface={tint.surface}
                        projectWidth={width}
                        selected={selection?.id === id}
                        onPress={() =>
                          setSelection({
                            id,
                            label: name,
                            patch: overlayPatch(overlay),
                          })
                        }
                      />
                    );
                  })
                ) : (
                  <EmptyRecent />
                )}
              </ScrollView>
            </View>
          ) : tab === "captions" ? (
            <CaptionsPanel />
          ) : (
            <View style={styles.panelFill}>
              <PanelHeading
                title="Templates"
                detail={`${visibleTemplates.length} styles`}
              />
              <View style={styles.categoryScrollerWrap}>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroller}
                  contentContainerStyle={styles.categoryRow}
                  scrollEventThrottle={16}
                  onScroll={categoryEdges.onScroll}
                  onContentSizeChange={categoryEdges.onContentSizeChange}
                  onLayout={(e) =>
                    categoryEdges.onLayout(e.nativeEvent.layout.width)
                  }
                >
                  {CATEGORIES.map((item) => {
                    const active = category === item.key;
                    const count =
                      item.key === "all"
                        ? TEMPLATE_PRESETS.length
                        : TEMPLATE_PRESETS.filter(
                            (preset) => preset.category === item.key,
                          ).length;
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        onPress={() => setCategory(item.key)}
                        style={[
                          styles.categoryChip,
                          active && styles.categoryChipOn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryLabel,
                            active && styles.categoryLabelOn,
                          ]}
                        >
                          {item.label}
                        </Text>
                        <View
                          style={[
                            styles.categoryCount,
                            active && styles.categoryCountOn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryCountText,
                              active && styles.categoryCountTextOn,
                            ]}
                          >
                            {count}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {categoryEdges.canLeft ? (
                  <LinearGradient
                    pointerEvents="none"
                    colors={[vela.lightCard, `${vela.lightCard}00`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.categoryEdgeFade, styles.categoryEdgeFadeLeft]}
                  />
                ) : null}
                {categoryEdges.canRight ? (
                  <LinearGradient
                    pointerEvents="none"
                    colors={[`${vela.lightCard}00`, vela.lightCard]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.categoryEdgeFade, styles.categoryEdgeFadeRight]}
                  />
                ) : null}
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.templateGrid}
              >
                {visibleTemplates.map((preset) => (
                  <TextPreviewCard
                    key={preset.id}
                    name={preset.name}
                    text={preset.patch.text}
                    previewColor={preset.previewColor}
                    previewSurface={preset.previewSurface}
                    selected={selection?.id === preset.id}
                    onPress={() =>
                      setSelection({
                        id: preset.id,
                        label: preset.name,
                        patch: preset.patch,
                      })
                    }
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHint} numberOfLines={1}>
          {selection ? `${selection.label} selected` : "Select a text style"}
        </Text>
        <Pressable
          disabled={!selection}
          onPress={addSelected}
          style={[styles.addButton, !selection && styles.addButtonDisabled]}
        >
          <VIcon name="plus" size={16} color="#fff" />
          <Text style={styles.addButtonText}>Add to timeline</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function RecentPreviewCard({
  overlay,
  name,
  accent,
  surface,
  projectWidth,
  selected,
  onPress,
}: {
  overlay: TextOverlay;
  name: string;
  accent: string;
  surface: string;
  projectWidth: number;
  selected: boolean;
  onPress: () => void;
}) {
  const previewSize = Math.round(
    Math.min(20, Math.max(12, (overlay.fontSize / projectWidth) * 215)),
  );
  const previewColor = recentPreviewColor(overlay.color, accent);
  return (
    <Animated.View
     
      style={styles.gridCell}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${overlay.fontSize} pixels`}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={[
          styles.recentCard,
          { backgroundColor: surface },
          selected && styles.selectedCard,
        ]}
      >
        <View style={[styles.recentAccent, { backgroundColor: accent }]} />
        <Text
          numberOfLines={3}
          style={[
            styles.recentSample,
            {
              color: previewColor,
              fontSize: previewSize,
              lineHeight: Math.round(previewSize * 1.15),
              fontFamily: overlay.bold ? font.extrabold : font.semibold,
              textAlign: overlay.align ?? "center",
            },
          ]}
        >
          {overlay.text}
        </Text>
        <View style={styles.recentFooter}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.recentName, { color: accent }]}>{name}</Text>
            <Text style={styles.recentMeta}>
              {overlay.fontSize}px · {overlay.align ?? "center"}
            </Text>
          </View>
          <View style={styles.recentColorWrap}>
            <View
              style={[styles.recentColor, { backgroundColor: overlay.color }]}
            />
            <VIcon name="plus" size={13} color={accent} />
          </View>
        </View>
        {selected ? <SelectedBadge /> : null}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Auto captions.
 *
 * One action, and the truth about what it will do before it does it. It
 * transcribes the selected clip — or the first sound if nothing is selected —
 * and REPLACES any previous run, which is stated up front because "Add
 * captions" pressed twice would otherwise silently double them.
 *
 * There is no progress bar: the service reports none, and inventing one would
 * be a lie. What it shows instead is which clip it is about to use, and then
 * plainly what happened.
 */
function CaptionsPanel() {
  const project = useEditor((state) => state.project);
  const autoCaption = useEditor((state) => state.autoCaption);
  const apply = useEditor((state) => state.apply);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const existing = project ? hasAutoCaptions(project) : false;
  const exportable = project ? hasCaptionText(project) : false;

  /*
   * A subtitle file the phone can hand to anything — mail, Files, a desktop.
   * Written into the cache directory rather than documents: it is a derived
   * artifact regenerated in a millisecond, and leaving copies in the projects
   * folder would grow it for no reason.
   */
  const saveSRT = async () => {
    if (!project) return;
    try {
      const name = captionFileName(useEditor.getState().name);
      // `write` creates or overwrites, same as `storage/projects.ts` — a second
      // save of the same project simply replaces the file it wrote last time.
      const file = new File(new Directory(Paths.cache), name);
      file.write(toSRT(project));
      await Share.share({ url: file.uri });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save the subtitle file.");
    }
  };

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      setNote(await autoCaption());
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not add captions.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.panelFill}>
      <PanelHeading
        title="Captions"
        detail={existing ? "Replaces the current set" : "From the spoken audio"}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.defaultList}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void run()}
          style={[styles.captionAction, busy && styles.captionActionBusy]}
        >
          <VIcon name="subtitle" size={22} color="#0f8f7a" />
          <View style={{ flex: 1 }}>
            <Text style={styles.captionActionName}>
              {busy ? "Listening…" : existing ? "Redo captions" : "Add captions"}
            </Text>
            <Text style={styles.captionActionSub}>
              Uses the selected clip, or the first sound on the timeline.
            </Text>
          </View>
        </Pressable>

        {existing ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              apply((p) => clearAutoCaptions(p));
              setNote("Captions removed.");
            }}
            style={styles.captionClear}
          >
            <VIcon name="trash" size={18} color={vela.lightMuted} />
            <Text style={styles.captionClearText}>Remove captions</Text>
          </Pressable>
        ) : null}

        {/*
          Offered whenever there is any timed text at all, including text typed
          by hand: the `caption-` prefix is bookkeeping so a second run knows
          what it may replace, not a category anyone chose, and a file that
          silently dropped the lines someone wrote would be the worse surprise.
         */}
        {exportable ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void saveSRT()}
            style={styles.captionAction}
          >
            <VIcon name="export" size={22} color={vela.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.captionActionName}>Save .srt</Text>
              <Text style={styles.captionActionSub}>
                Every timed text, as a subtitle file. Unlike burned-in captions,
                it can be turned off and translated.
              </Text>
            </View>
          </Pressable>
        ) : null}

        {note ? <Text style={styles.captionNote}>{note}</Text> : null}
      </ScrollView>
    </View>
  );
}

function PanelHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.panelHeading}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelDetail}>{detail}</Text>
    </View>
  );
}

function TextPreviewCard({
  name,
  text,
  previewColor,
  previewSurface,
  selected,
  onPress,
}: {
  name: string;
  text: string;
  previewColor: string;
  previewSurface: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View
     
      style={styles.gridCell}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name} text template`}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={[
          styles.templateCard,
          { backgroundColor: previewSurface },
          selected && styles.selectedCard,
        ]}
      >
        <Text
          style={[styles.templateSample, { color: previewColor }]}
          numberOfLines={3}
        >
          {text}
        </Text>
        <View style={styles.templateFooter}>
          <Text style={[styles.templateName, { color: previewColor }]}>
            {name}
          </Text>
          <VIcon name="plus" size={13} color={previewColor} />
        </View>
        {selected ? <SelectedBadge /> : null}
      </Pressable>
    </Animated.View>
  );
}

function SelectedBadge() {
  return (
    <View style={styles.selectedBadge}>
      <VIcon name="check" size={11} color="#fff" />
    </View>
  );
}

function EmptyRecent() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <VIcon name="text" size={24} color={vela.accent} />
      </View>
      <Text style={styles.emptyTitle}>No recent styles yet</Text>
      <Text style={styles.emptyDetail}>
        Add a default or template style and it will appear here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  captionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#e9f8f4",
  },
  captionActionBusy: { opacity: 0.6 },
  captionActionName: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: vela.ink,
  },
  captionActionSub: {
    marginTop: 2,
    fontFamily: font.regular,
    fontSize: 12,
    color: vela.lightMuted,
    lineHeight: 16,
  },
  captionClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: vela.lightCard,
  },
  captionClearText: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: vela.lightMuted,
  },
  captionNote: {
    marginTop: 12,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: vela.lightMuted,
  },
  sheet: {
    height: "72%",
    backgroundColor: vela.lightCard,
    paddingHorizontal: 18,
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
    gap: 10,
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
  panelHeading: { minHeight: 32 },
  panelTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 15 },
  panelDetail: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 10.5,
    marginTop: 1,
  },
  defaultList: { gap: 9, paddingBottom: 12 },
  defaultCard: {
    minHeight: 84,
    borderRadius: 15,
    padding: 10,
    borderWidth: 2,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    overflow: "hidden",
  },
  defaultGlyph: {
    width: 44,
    height: 58,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  defaultGlyphText: { fontFamily: font.extrabold },
  defaultContent: { flex: 1, gap: 8, minWidth: 0 },
  defaultMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  defaultLabel: {
    fontFamily: font.bold,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sizePill: {
    borderRadius: 999,
    backgroundColor: "#ffffff9c",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  sizeMeta: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 8.5 },
  defaultPreview: { color: vela.ink, paddingRight: 20 },
  headingPreview: { fontFamily: font.extrabold, fontSize: 20, lineHeight: 23 },
  subheadingPreview: { fontFamily: font.bold, fontSize: 16, lineHeight: 19 },
  bodyPreview: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  categoryScrollerWrap: { position: "relative" },
  categoryScroller: { flexGrow: 0 },
  categoryRow: { gap: 7, paddingRight: 4 },
  // Fades a partially-scrolled-off chip into the sheet's own background instead
  // of guillotining it flush at the edge — a hard cut reads as broken content,
  // a fade reads as "there's more, scroll for it".
  categoryEdgeFade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: EDGE_FADE_W,
  },
  categoryEdgeFadeLeft: { left: 0 },
  categoryEdgeFadeRight: { right: 0 },
  categoryChip: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: vela.lightSurface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  categoryChipOn: { backgroundColor: vela.accent },
  categoryLabel: {
    color: vela.lightMuted,
    fontFamily: font.bold,
    fontSize: 10,
  },
  categoryLabelOn: { color: "#ffffff" },
  categoryCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  categoryCountOn: { backgroundColor: "#ffffff2d" },
  categoryCountText: {
    color: vela.lightMuted,
    fontFamily: font.bold,
    fontSize: 8.5,
  },
  categoryCountTextOn: { color: "#ffffff" },
  templateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    paddingBottom: 12,
  },
  gridCell: { width: "48.4%" },
  recentCard: {
    minHeight: 126,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
    padding: 11,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  recentAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  recentSample: { paddingTop: 10 },
  recentFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
  },
  recentName: { fontFamily: font.bold, fontSize: 10.5 },
  recentMeta: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 8.5,
    marginTop: 2,
    textTransform: "capitalize",
  },
  recentColorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 2,
  },
  recentColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#00000024",
  },
  templateCard: {
    minHeight: 112,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
    padding: 11,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  templateSample: {
    fontFamily: font.extrabold,
    fontSize: 13,
    lineHeight: 16,
    paddingTop: 10,
  },
  templateFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  templateName: { fontFamily: font.bold, fontSize: 10.5 },
  selectedCard: { borderColor: vela.accent },
  selectedBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    width: "100%",
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  emptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: vela.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 14 },
  emptyDetail: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 4,
  },
  footer: {
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: vela.lightBorder,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  footerHint: {
    flex: 1,
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
});
