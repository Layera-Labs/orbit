/**
 * A main clip's own sound, reached by tapping its block on the Sound lane.
 *
 * That lane used to be a picture with nothing behind it — it showed you which
 * clips carried sound and gave you no way to do anything about it, while the
 * only control was a gutter icon that muted ALL of them at once.
 *
 * **Mute here is the `muted` flag, not a volume of zero.** Both previews and the
 * export already read it, and it leaves the level alone — so a clip you set to
 * 40%, muted, and unmuted comes back at 40% rather than at 100%. The slider is
 * disabled while muted, because a level you cannot hear is a control that lies
 * about what it is doing; the value stays on screen so you can see what it will
 * return to.
 *
 * **Apply to all names its scope.** It reaches every clip on THIS track that has
 * sound of its own — the exact set the lane mirrors. Music and voiceover live on
 * their own tracks with their own controls, and quietly overwriting those from a
 * button labelled "all" is how someone loses a mix they spent an hour on.
 */
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { VIcon } from "./VIcon";
import { VSlider } from "./VSlider";
import { LANES } from "./laneColors";
import { font, mono, sp, r, vela } from "../constants";
import type { VisualTrackClip } from "../model/types";
import { useEditor } from "../store/editorStore";
import { MAX_VOLUME } from "../model/audio-fade";

export function SoundVolumeSheet() {
  const selected = useEditor((s) => s.selected);
  const project = useEditor((s) => s.project);
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipVolume = useEditor((s) => s.applyClipVolume);
  const setSoundMuted = useEditor((s) => s.setSoundMuted);
  const applySoundToAll = useEditor((s) => s.applySoundToAll);
  const close = () => setPanel(null);

  const track = project?.tracks?.find((t) => t.id === selected?.trackId);
  const clip = track?.clips.find((c) => c.id === selected?.clipId) as
    | VisualTrackClip
    | undefined;

  if (!clip || !track)
    return (
      <BottomSheet onClose={close} style={s.sheet}>
        <Text style={s.title}>Volume Settings</Text>
        <Text style={s.note}>
          Tap a clip's sound on the bottom lane to change its volume.
        </Text>
      </BottomSheet>
    );

  const muted = !!clip.muted;
  const volume = clip.volume ?? 1;
  const withSound = track.clips.filter(
    (c) => "type" in c && c.type === "video",
  ).length;

  const applyAll = () =>
    Alert.alert(
      "Apply to all",
      `Set every clip with its own sound on this track to ${Math.round(
        volume * 100,
      )}%${muted ? ", muted" : ""}. That is ${withSound} clip${
        withSound === 1 ? "" : "s"
      }. Music and voiceover tracks are not changed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: () => {
            applySoundToAll(track.id, volume, muted);
            close();
          },
        },
      ],
    );

  return (
    <BottomSheet onClose={close} style={s.sheet}>
      <View style={s.head}>
        <Text style={s.title}>Volume Settings</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={close}
          hitSlop={10}
        >
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>
      <Text style={s.sub}>This clip's own sound</Text>

      <View style={s.row}>
        <VIcon
          name={muted ? "mute" : "volume"}
          size={19}
          color={muted ? vela.lightMuted : LANES.sound.key}
        />
        <Text style={s.rowLabel}>Mute</Text>
        <Switch
          accessibilityLabel="Mute this clip's sound"
          value={muted}
          onValueChange={(v) => setSoundMuted(track.id, clip.id, v)}
          trackColor={{ true: vela.accent, false: "#c7c9d4" }}
          ios_backgroundColor="#c7c9d4"
          thumbColor="#fff"
        />
      </View>

      <View style={s.field}>
        <View style={s.fieldHead}>
          <Text style={[s.rowLabel, muted && s.off]}>Volume</Text>
          <Text style={[s.value, muted && s.off]}>
            {Math.round(volume * 100)}%
          </Text>
        </View>
        <VSlider
          value={volume}
          min={0}
          max={MAX_VOLUME}
          disabled={muted}
          onChange={(v) => applyClipVolume(Math.round(v * 20) / 20)}
        />
        {muted ? (
          <Text style={s.note}>Muted — unmute to change the level.</Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        style={s.apply}
        onPress={applyAll}
        disabled={withSound < 2}
      >
        <VIcon
          name="duplicate"
          size={17}
          color={withSound < 2 ? vela.lightMuted : vela.accent}
        />
        <Text style={[s.applyText, withSound < 2 && s.off]}>
          {withSound < 2
            ? "No other clip has sound"
            : `Apply to all ${withSound} clips`}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sheet: { backgroundColor: vela.lightCard, paddingHorizontal: 0, paddingTop: 18 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sp.lg,
    paddingTop: sp.md,
  },
  // No padding of its own: `head` already carries the gutter, and adding it
  // here indented the title past the line underneath it.
  title: { flex: 1, color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  sub: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 13,
    paddingHorizontal: sp.lg,
    paddingTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp.md,
    paddingHorizontal: sp.lg,
    paddingVertical: 13,
    marginTop: sp.sm,
  },
  rowLabel: { flex: 1, color: vela.ink, fontFamily: font.medium, fontSize: 15 },
  // Mono for the level: it changes as the slider moves, and a proportional face
  // makes it jitter as the digits change width.
  value: { color: vela.lightMuted, fontFamily: mono.regular, fontSize: 12.5 },
  off: { color: vela.lightMuted3 },
  field: { paddingHorizontal: sp.lg, paddingVertical: 6, gap: sp.xs },
  fieldHead: { flexDirection: "row", alignItems: "center" },
  apply: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp.sm,
    marginHorizontal: sp.lg,
    marginTop: sp.md,
    paddingVertical: 14,
    borderRadius: r.md,
    borderCurve: "continuous",
    backgroundColor: vela.homeBg,
  },
  applyText: { color: vela.accent, fontFamily: font.semibold, fontSize: 14.5 },
  note: {
    color: vela.lightMuted,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: sp.lg,
    paddingTop: sp.sm,
  },
});
