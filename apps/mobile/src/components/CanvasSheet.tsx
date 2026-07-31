/**
 * The canvas itself: its background colour, and the mat around the picture.
 *
 * Reached from a button on the stage rather than the bottom rail, because
 * nothing on the timeline is selected when you want it — these are properties
 * of the whole video, not of a clip.
 *
 * Two things worth stating about the frame controls.
 *
 * **Turning the frame on seeds its colour from the background.** A mat's corner
 * wedges have to be filled with something (a video frame is opaque, so rounded
 * corners are not transparency), and matching the background is what makes them
 * read as "the corners are rounded" rather than "a coloured border appeared".
 * The renderers know nothing about this — it is a default, chosen once, here.
 *
 * **Opacity is honestly labelled.** Below 1 the picture shows through the corner
 * wedges as well as the band, because they are one shape. Saying so costs a
 * line of text; discovering it costs a confused export.
 */
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { ColorSheet } from "./ColorSheet";
import { VIcon } from "./VIcon";
import { VSlider } from "./VSlider";
import { font, mono, sp, r, vela } from "../constants";
import type { CanvasFrame } from "../model/types";
import { useEditor } from "../store/editorStore";

/** A sensible mat to start from: visible, but not yet eating the picture. */
const DEFAULT_WIDTH = 0.03;

export function CanvasSheet() {
  const project = useEditor((s) => s.project);
  const setPanel = useEditor((s) => s.setPanel);
  const applyBackground = useEditor((s) => s.applyBackground);
  const applyFrame = useEditor((s) => s.applyFrame);
  const openLibrary = useEditor((s) => s.openLibrary);
  const [picking, setPicking] = useState<null | "bg" | "frame">(null);

  const close = () => setPanel(null);
  const bg = project?.background;
  const bgColor = bg?.type === "color" ? bg.color : "#000000";
  const frame = project?.frame;
  const on = !!frame;

  const patch = (next: Partial<CanvasFrame>) =>
    applyFrame({
      ...(frame ?? { color: bgColor, width: DEFAULT_WIDTH }),
      ...next,
    });

  return (
    <BottomSheet onClose={close} style={s.sheet}>
      <Text style={s.title}>Canvas</Text>
      <ScrollView
        style={{ maxHeight: 460 }}
        contentContainerStyle={{ paddingBottom: sp.xl }}
      >
        <Text style={s.section}>Background</Text>
        <Pressable style={s.row} onPress={() => setPicking("bg")}>
          <View style={[s.swatch, { backgroundColor: bgColor }]} />
          <Text style={s.rowLabel}>
            {bg?.type === "color" ? "Colour" : "Pick a colour"}
          </Text>
          <Text style={s.rowValue}>{bg?.type === "color" ? bgColor : ""}</Text>
        </Pressable>
        <Pressable
          style={s.row}
          onPress={() => {
            close();
            openLibrary("backgrounds");
          }}
        >
          <VIcon name="image" size={19} color={vela.ink2} />
          <Text style={s.rowLabel}>Gradients and photos</Text>
          <VIcon name="chevronRight" size={13} color={vela.lightMuted} />
        </Pressable>

        <Text style={s.section}>Frame</Text>
        <Pressable
          style={s.row}
          onPress={() =>
            on
              ? applyFrame(undefined)
              : // Seeded from the background so the corners read as rounded
                // rather than as a band that arrived out of nowhere.
                applyFrame({ color: bgColor, width: DEFAULT_WIDTH })
          }
        >
          <VIcon
            name={on ? "check" : "plus"}
            size={19}
            color={on ? vela.accent : vela.ink2}
          />
          <Text style={s.rowLabel}>{on ? "Frame on" : "Add a frame"}</Text>
        </Pressable>

        {on ? (
          <>
            <Pressable style={s.row} onPress={() => setPicking("frame")}>
              <View style={[s.swatch, { backgroundColor: frame!.color }]} />
              <Text style={s.rowLabel}>Colour</Text>
              <Text style={s.rowValue}>{frame!.color}</Text>
            </Pressable>
            <Field label="Thickness" value={pct(frame!.width)}>
              <VSlider
                value={frame!.width}
                min={0}
                max={0.15}
                onChange={(v) => patch({ width: round3(v) })}
              />
            </Field>
            <Field label="Rounded corners" value={pct(frame!.radius ?? 0)}>
              <VSlider
                value={frame!.radius ?? 0}
                min={0}
                max={0.25}
                onChange={(v) => patch({ radius: round3(v) })}
              />
            </Field>
            <Field label="Opacity" value={pct(frame!.opacity ?? 1)}>
              <VSlider
                value={frame!.opacity ?? 1}
                min={0.05}
                max={1}
                onChange={(v) => patch({ opacity: round3(v) })}
              />
            </Field>
            <Text style={s.note}>
              Below full opacity the picture shows through the corners as well
              as the band — they are one shape.
            </Text>
          </>
        ) : null}
      </ScrollView>

      {picking ? (
        <ColorSheet
          value={picking === "bg" ? bgColor : (frame?.color ?? bgColor)}
          onChange={(color) =>
            picking === "bg"
              ? applyBackground({ type: "color", color })
              : patch({ color })
          }
          onClose={() => setPicking(null)}
        />
      ) : null}
    </BottomSheet>
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <View style={s.fieldHead}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowValue}>{value}</Text>
      </View>
      {children}
    </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp.md,
    paddingHorizontal: sp.lg,
    paddingVertical: 13,
  },
  rowLabel: {
    flex: 1,
    color: vela.ink,
    fontFamily: font.medium,
    fontSize: 15,
  },
  // Mono for the value: it is a number that changes as a slider moves, and a
  // proportional face makes it jitter as the digits change width.
  rowValue: { color: vela.lightMuted, fontFamily: mono.regular, fontSize: 12.5 },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: r.sm,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: vela.lightBorder,
  },
  field: { paddingHorizontal: sp.lg, paddingVertical: 9, gap: sp.xs },
  fieldHead: { flexDirection: "row", alignItems: "center" },
  note: {
    color: vela.lightMuted,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: sp.lg,
    paddingTop: sp.xs,
  },
});
