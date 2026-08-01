/**
 * The audio clip editor — what opens the moment you add music, and what the
 * audio HUD's Edit button reopens later.
 *
 * Adding a track used to drop it on the timeline and leave you there: the only
 * way to reach its volume was to select the clip and hunt through the bottom
 * rail. Every editor this app is modelled on hands you the track's own controls
 * at the moment you place it, so this does too.
 *
 * Fade in and fade out are NOT new model fields. They are a `volumeCurve`,
 * which both previews already sample and the export already bakes into an
 * ffmpeg expression — see `model/audio-fade.ts` for why, and for the one catch
 * (a curve overrides `volume`, so the plateau and the fades must be written
 * together). A curve this sheet cannot express as a pair of fades is left
 * alone and handed back to the curve editor rather than flattened.
 */
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { VIcon } from "./VIcon";
import { VSlider } from "./VSlider";
import { PercentField } from "./PercentField";
import { font, mono, r, sp, vela } from "../constants";
import { fadesOf, maxFadeFor, MAX_VOLUME, withFades } from "../model/audio-fade";
import type { AudioTrackClip } from "../model/types";
import { useEditor } from "../store/editorStore";

/** "…/media/1720-Walk%20In%20The%20Park.mp3" → "Walk In The Park". */
function nameOf(src: string): string {
  const tail = src.split("?")[0].split("/").pop() ?? src;
  let decoded = tail;
  try {
    decoded = decodeURIComponent(tail);
  } catch {
    // A stray % in a filename is not worth failing over.
  }
  const dot = decoded.lastIndexOf(".");
  const stem = dot > 0 ? decoded.slice(0, dot) : decoded;
  // Imported files carry a timestamp prefix from `copyIntoMedia`.
  return stem.replace(/^\d{6,}[-_]/, "").trim() || "Audio";
}

function clock(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
}

export function AudioClipSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const selected = useEditor((s) => s.selected);
  const project = useEditor((s) => s.project);
  const trimClip = useEditor((s) => s.trimClip);
  const applyAudioFades = useEditor((s) => s.applyAudioFades);
  const applyAudioVolumeToAll = useEditor((s) => s.applyAudioVolumeToAll);
  const mediaDurations = useEditor((s) => s.mediaDurations);

  const track = project?.tracks?.find((t) => t.id === selected?.trackId);
  const clip =
    track?.kind === "audio"
      ? (track.clips.find((c) => c.id === selected?.clipId) as
          | AudioTrackClip
          | undefined)
      : undefined;

  // Snapshotted on open: the sliders drive the store, and reading back from it
  // each render would fight the finger.
  const [fades, setFades] = useState(() =>
    clip ? fadesOf(clip) : { volume: 1, fadeIn: 0, fadeOut: 0 },
  );
  const [trimIn, setTrimIn] = useState(clip?.trimIn ?? 0);
  const [duration, setDuration] = useState(clip?.duration ?? 0);

  const close = () => setPanel(null);
  const title = useMemo(() => (clip ? nameOf(clip.src) : ""), [clip]);

  if (!clip || !selected) {
    return (
      <BottomSheet onClose={close} style={s.sheet}>
        <Text style={s.title}>No audio selected</Text>
        <Text style={s.sub}>Tap a music clip on the timeline to edit it.</Text>
      </BottomSheet>
    );
  }

  const sourceLen = mediaDurations[clip.src];
  const trackClips = track?.clips.length ?? 1;
  const maxFade = maxFadeFor(duration);
  const commitFades = (next: NonNullable<typeof fades>) => {
    setFades(next);
    applyAudioFades(selected.trackId, clip.id, next);
  };
  /*
   * Names its scope, and confirms first. It reaches every clip on THIS audio
   * track — the one the selected clip is on — and it moves the LEVEL only, so a
   * clip with its own fades keeps them.
   */
  const applyVolumeToAll = (volume: number) =>
    Alert.alert(
      "Apply to all",
      `Set every clip on this track to ${Math.round(volume * 100)}%. That is ${
        trackClips
      } clip${trackClips === 1 ? "" : "s"}. Fades on each clip are kept.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: () => applyAudioVolumeToAll(selected.trackId, volume),
        },
      ],
    );
  const commitTrim = (nextIn: number, nextDur: number) => {
    setTrimIn(nextIn);
    setDuration(nextDur);
    trimClip(selected.trackId, clip.id, {
      trimIn: nextIn,
      duration: nextDur,
    });
    // The plateau stays where it is, but a fade is a fraction of the clip, so
    // the curve has to be rewritten against the new length or the fades drift.
    if (fades && (fades.fadeIn > 0 || fades.fadeOut > 0))
      applyAudioFades(selected.trackId, clip.id, fades);
  };

  return (
    <BottomSheet onClose={close} style={s.sheet}>
      <View style={s.head}>
        <View style={s.headText}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.sub}>
            {clock(duration)}
            {sourceLen ? ` of ${clock(sourceLen)}` : ""}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={close}
          hitSlop={10}
        >
          <VIcon name="check" size={24} color={vela.accent} />
        </Pressable>
      </View>

      {/*
        Where the clip sits inside the source file. Two real numbers and a bar
        drawn to their proportion — not a waveform, because we do not decode the
        samples and a drawn-from-nothing waveform would be a picture of data we
        do not have.
      */}
      {sourceLen ? (
        <View style={s.block}>
          <View style={s.blockHead}>
            <Text style={s.blockLabel}>In the track</Text>
            <Text style={s.value}>
              {clock(trimIn)} – {clock(trimIn + duration)}
            </Text>
          </View>
          <View style={s.extent}>
            <View
              style={[
                s.extentFill,
                {
                  left: `${(trimIn / sourceLen) * 100}%`,
                  width: `${Math.min(1, duration / sourceLen) * 100}%`,
                },
              ]}
            />
          </View>
          <Row label="Start">
            <VSlider
              value={trimIn}
              min={0}
              max={Math.max(0.1, sourceLen - 0.5)}
              step={0.1}
              onChange={(v) => commitTrim(v, Math.min(duration, sourceLen - v))}
            />
          </Row>
          <Row label="Length">
            <VSlider
              value={duration}
              min={0.5}
              max={Math.max(0.6, sourceLen - trimIn)}
              step={0.1}
              onChange={(v) => commitTrim(trimIn, v)}
            />
          </Row>
        </View>
      ) : null}

      {fades ? (
        <View style={s.block}>
          <Row
            label="Volume"
            value={
              <PercentField
                label="Volume"
                value={fades.volume}
                min={0}
                max={MAX_VOLUME}
                onCommit={(v) => commitFades({ ...fades, volume: v })}
              />
            }
          >
            {/* 5% steps: the track spans 0–500%, so a finer grid is a value
                nobody can hit deliberately and a write nobody asked for. */}
            <VSlider
              value={fades.volume}
              min={0}
              max={MAX_VOLUME}
              step={0.05}
              ticks={0.5}
              defaultValue={1}
              onChange={(v) => commitFades({ ...fades, volume: v })}
            />
          </Row>
          <Row label="Fade in" value={`${fades.fadeIn.toFixed(1)}s`}>
            <VSlider
              value={fades.fadeIn}
              min={0}
              max={Math.max(0.1, maxFade)}
              step={0.1}
              onChange={(v) => commitFades({ ...fades, fadeIn: v })}
            />
          </Row>
          <Row label="Fade out" value={`${fades.fadeOut.toFixed(1)}s`}>
            <VSlider
              value={fades.fadeOut}
              min={0}
              max={Math.max(0.1, maxFade)}
              step={0.1}
              onChange={(v) => commitFades({ ...fades, fadeOut: v })}
            />
          </Row>
          <Pressable
            accessibilityRole="button"
            style={s.apply}
            onPress={() => applyVolumeToAll(fades.volume)}
            disabled={trackClips < 2}
          >
            <VIcon
              name="duplicate"
              size={17}
              color={trackClips < 2 ? vela.lightMuted : vela.accent}
            />
            <Text style={[s.applyText, trackClips < 2 && s.applyOff]}>
              {trackClips < 2
                ? "No other clip on this track"
                : `Apply this volume to all ${trackClips} clips`}
            </Text>
          </Pressable>
        </View>
      ) : (
        // A duck or a hand-drawn ramp. Overwriting it with two fade sliders
        // would silently throw the shape away.
        <Pressable style={s.customRow} onPress={() => setPanel("curve")}>
          <VIcon name="curve" size={20} color={vela.ink2} />
          <View style={{ flex: 1 }}>
            <Text style={s.customTitle}>Custom volume curve</Text>
            <Text style={s.sub}>
              This clip's volume is shaped by hand. Open the curve editor to
              change it.
            </Text>
          </View>
          <VIcon name="chevronRight" size={18} color={vela.lightMuted} />
        </Pressable>
      )}
    </BottomSheet>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  /** A read-only string, or a control — the volume row hands over a field. */
  value?: string | React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
      {typeof value === "string" ? (
        <Text style={s.value}>{value}</Text>
      ) : (
        (value ?? null)
      )}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    backgroundColor: vela.lightCard,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    gap: sp.lg,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: sp.md },
  headText: { flex: 1, gap: 2 },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  sub: { color: vela.lightMuted, fontFamily: font.regular, fontSize: 13 },
  block: { gap: sp.md },
  blockHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  blockLabel: { color: vela.ink2, fontFamily: font.semibold, fontSize: 13 },
  extent: {
    height: 6,
    borderRadius: 3,
    backgroundColor: vela.lightSurface,
    overflow: "hidden",
  },
  extentFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: vela.accent,
  },
  row: { flexDirection: "row", alignItems: "center", gap: sp.md },
  apply: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp.sm,
    marginTop: sp.xs,
    paddingVertical: 13,
    borderRadius: r.md,
    borderCurve: "continuous",
    backgroundColor: vela.homeBg,
  },
  applyText: { color: vela.accent, fontFamily: font.semibold, fontSize: 14 },
  applyOff: { color: vela.lightMuted3 },
  rowLabel: {
    width: 62,
    color: vela.ink2,
    fontFamily: font.medium,
    fontSize: 13,
  },
  // Mono only where the content is genuinely a changing number, so the digits
  // do not jitter as they change width.
  value: {
    minWidth: 52,
    textAlign: "right",
    color: vela.ink2,
    fontFamily: mono.regular,
    fontSize: 12.5,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp.md,
    paddingVertical: sp.md,
  },
  customTitle: { color: vela.ink, fontFamily: font.semibold, fontSize: 15 },
});
