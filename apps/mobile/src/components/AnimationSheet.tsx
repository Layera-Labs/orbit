/**
 * How the selected element enters and leaves.
 *
 * Works on anything selectable — a clip, a sticker, a PiP, a caption — because
 * the model carries `animateIn`/`animateOut` on all of them.
 *
 * **There is no scale option, and that is deliberate.** ffmpeg cannot animate
 * scale per frame, so a "pop" entrance would work in this preview and not in
 * the exported file. This editor already deleted four transition types for
 * exactly that reason rather than shipping them as "coming soon"; an option
 * that lies is worse than an option that is missing.
 *
 * **Slide is disabled on a blended element**, with the reason shown rather than
 * an alert on tap. The export composites a blended clip at a fixed origin (its
 * blend crops the base region under a box whose size cannot vary per frame), so
 * nothing could move it — and a preview that slid it anyway would look better
 * than the file.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { VIcon, type VIconName } from "./VIcon";
import { VSlider } from "./VSlider";
import { font, mono, sp, r, vela } from "../constants";
import type { ElementAnim, SlideEdge, VisualTrackClip } from "../model/types";
import { resolveAnim } from "../preview/elementAnim";
import { OVERLAY_TRACK, useEditor } from "../store/editorStore";

interface Choice {
  key: string;
  label: string;
  icon: VIconName;
  make: (duration: number) => ElementAnim | undefined;
  slide?: boolean;
}

const CHOICES: Choice[] = [
  { key: "none", label: "None", icon: "close", make: () => undefined },
  {
    key: "fade",
    label: "Fade",
    icon: "trFade",
    make: (duration) => ({ type: "fade", duration }),
  },
  ...(
    [
      ["left", "Left", "alignLeft"],
      ["right", "Right", "alignRight"],
      ["up", "Up", "chevronUp"],
      ["down", "Down", "chevronDown"],
    ] as [SlideEdge, string, VIconName][]
  ).map(([edge, label, icon]) => ({
    key: `slide-${edge}`,
    label,
    icon,
    slide: true,
    make: (duration: number): ElementAnim => ({
      type: "slide" as const,
      duration,
      edge,
    }),
  })),
];

const keyOf = (a: ElementAnim | undefined) =>
  !a || a.type === "none"
    ? "none"
    : a.type === "fade"
      ? "fade"
      : `slide-${a.edge ?? "left"}`;

export function AnimationSheet() {
  const selected = useEditor((s) => s.selected);
  const project = useEditor((s) => s.project);
  const setPanel = useEditor((s) => s.setPanel);
  const applySelectedAnim = useEditor((s) => s.applySelectedAnim);
  const close = () => setPanel(null);

  const isText = selected?.trackId === OVERLAY_TRACK;
  const track = project?.tracks?.find((t) => t.id === selected?.trackId);
  const clip = track?.clips.find((c) => c.id === selected?.clipId);
  const overlay = isText
    ? project?.overlays.find((o) => o.id === selected?.clipId)
    : undefined;
  const el = (overlay ?? clip) as
    | {
        animateIn?: ElementAnim;
        animateOut?: ElementAnim;
        animation?: "none" | "fade";
      }
    | undefined;

  if (!el)
    return (
      <BottomSheet onClose={close} style={s.sheet}>
        <Text style={s.title}>Animation</Text>
        <Text style={s.note}>
          Select something on the timeline to animate it.
        </Text>
      </BottomSheet>
    );

  const visual = track?.kind === "visual" ? (clip as VisualTrackClip) : null;
  const blended = !!visual?.blend && visual.blend !== "normal";
  const pair = resolveAnim(el);
  const dur = pair.in?.duration ?? pair.out?.duration ?? 0.5;

  const set = (which: "in" | "out", c: Choice) => {
    const next = c.make(dur);
    applySelectedAnim(
      which === "in" ? next : pair.in,
      which === "out" ? next : pair.out,
    );
  };
  const setDuration = (d: number) =>
    applySelectedAnim(
      pair.in ? { ...pair.in, duration: d } : undefined,
      pair.out ? { ...pair.out, duration: d } : undefined,
    );

  return (
    <BottomSheet onClose={close} style={s.sheet}>
      <Text style={s.title}>Animation</Text>
      <ScrollView
        style={{ maxHeight: 440 }}
        contentContainerStyle={{ paddingBottom: sp.xl }}
      >
        {(["in", "out"] as const).map((which) => (
          <View key={which}>
            <Text style={s.section}>{which === "in" ? "In" : "Out"}</Text>
            <View style={s.grid}>
              {CHOICES.map((c) => {
                const off = !!c.slide && blended;
                const on = keyOf(pair[which]) === c.key;
                return (
                  <Pressable
                    key={c.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: off }}
                    accessibilityLabel={`${which === "in" ? "In" : "Out"}: ${c.label}`}
                    disabled={off}
                    style={[s.cell, on && s.cellOn]}
                    onPress={() => set(which, c)}
                  >
                    <VIcon
                      name={c.icon}
                      size={19}
                      color={
                        off ? vela.lightMuted : on ? vela.accent : vela.ink2
                      }
                    />
                    <Text
                      style={[
                        s.cellLabel,
                        on && { color: vela.accent },
                        off && { color: vela.lightMuted },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {blended ? (
          <Text style={s.note}>
            Slide is off because this element has a blend mode. The export
            composites a blended layer at a fixed position, so it could not
            actually move in the finished video.
          </Text>
        ) : null}

        {pair.in || pair.out ? (
          <View style={s.field}>
            <View style={s.fieldHead}>
              <Text style={s.rowLabel}>Duration</Text>
              <Text style={s.rowValue}>{dur.toFixed(1)}s</Text>
            </View>
            <VSlider
              value={dur}
              min={0.1}
              max={3}
              onChange={(v) => setDuration(Math.round(v * 10) / 10)}
            />
            <Text style={s.note}>
              Trimmed to half the element if it is shorter, so the in and the
              out cannot overlap.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: vela.lightCard, paddingHorizontal: 0, paddingTop: 18 },
  title: {
    color: vela.ink,
    fontFamily: font.extrabold,
    fontSize: 20,
    paddingHorizontal: sp.lg,
    paddingTop: sp.md,
  },
  section: {
    color: vela.lightMuted,
    fontFamily: font.semibold,
    fontSize: 12.5,
    marginTop: sp.lg,
    marginBottom: sp.xs,
    paddingHorizontal: sp.lg,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sp.sm,
    paddingHorizontal: sp.lg,
  },
  cell: {
    width: 72,
    height: 60,
    borderRadius: r.md,
    borderCurve: "continuous",
    backgroundColor: vela.homeBg,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  cellOn: {
    backgroundColor: vela.accentSoft,
    borderWidth: 1,
    borderColor: vela.accent,
  },
  cellLabel: {
    color: vela.ink2,
    fontFamily: font.medium,
    fontSize: 11.5,
  },
  field: { paddingHorizontal: sp.lg, paddingTop: sp.lg, gap: sp.xs },
  fieldHead: { flexDirection: "row", alignItems: "center" },
  rowLabel: {
    flex: 1,
    color: vela.ink,
    fontFamily: font.medium,
    fontSize: 15,
  },
  rowValue: { color: vela.lightMuted, fontFamily: mono.regular, fontSize: 12.5 },
  note: {
    color: vela.lightMuted,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: sp.lg,
    paddingTop: sp.sm,
  },
});
