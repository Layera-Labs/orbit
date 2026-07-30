/**
 * What you look at while a video exports.
 *
 * The previous version was an `ActivityIndicator` and one line of text on a
 * 200px card over an 80% black scrim, and the line said "Rendering on server…"
 * — the implementation describing itself to someone who only wants their video.
 * Worse, it was a spinner: no sense of how far along, how long is left, or
 * whether anything is happening at all, for what is usually the longest wait in
 * the app.
 *
 * So: the video itself, big, at its real aspect ratio, and a bar that means
 * something because the server now measures the encode.
 */
import { useEffect, useState } from "react";
import { Image, Modal, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { font, mono, sp, r, vela } from "../constants";
import { exportStageLabel, useEditor } from "../store/editorStore";

/**
 * Things worth knowing about Orbit, shown one at a time while the wait runs.
 *
 * All true, all checkable in the app. The alternative — brand voice filler —
 * goes stale by the tenth export, and a line you have read nine times is worse
 * than no line at all.
 */
const TIPS = [
  "Drag a clip's edge to trim it. The rest of the timeline stays where you put it.",
  "Pinch the timeline to zoom in for frame-accurate cuts.",
  "Captions export as a separate .srt file as well as burned into the picture.",
  "Drop a second clip on the image lane to get picture-in-picture.",
  "Hold a photo in the media drawer to pick several at once.",
  "A clip's speed changes its sound too — the pitch follows.",
  "Anything you generate with AI is saved to your Library for every project.",
  "Your projects sync across devices once you sign in.",
];

/** How long each tip stays up. Long enough to read twice, unhurried. */
const TIP_MS = 6500;

export function ExportOverlay() {
  const exporting = useEditor((s) => s.exporting);
  const state = useEditor((s) => s.exportState);
  const project = useEditor((s) => s.project);
  const posterUri = useEditor((s) => s.posterUri);

  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (!exporting) {
      setTip(0);
      return;
    }
    const timer = setInterval(
      () => setTip((n) => (n + 1) % TIPS.length),
      TIP_MS,
    );
    return () => clearInterval(timer);
  }, [exporting]);

  const ratio =
    project && project.height > 0 ? project.width / project.height : 9 / 16;
  const pct = state?.progress ?? null;

  return (
    <Modal visible={exporting} animationType="fade" statusBarTranslucent>
      <View style={s.screen}>
        {/*
          The video, given the room. `aspectRatio` with both maxes set means a
          tall 9:16 project is bounded by height and a wide 16:9 one by width,
          so neither is ever cropped or pushed off the screen.
        */}
        <View style={s.stage}>
          <View style={[s.frame, { aspectRatio: ratio }]}>
            {posterUri ? (
              <Image
                source={{ uri: posterUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : null}
          </View>
        </View>

        {/*
          Anchored to the bottom and left-aligned, rather than a stack of
          centred rows — the frame above is the composition, and this reads as
          a caption to it.
        */}
        <View style={s.readout}>
          <View style={s.headRow}>
            <Text style={s.head}>Exporting</Text>
            {pct != null ? (
              <Text style={s.pct}>{Math.round(pct * 100)}%</Text>
            ) : null}
          </View>

          <ProgressBar value={pct} />

          <Text style={s.stageLine}>
            {state ? exportStageLabel(state) : "Getting your video ready"}
          </Text>

          {/*
            Rendered at full opacity from the first frame. Nothing here waits on
            an animation to become visible.
          */}
          <Text style={s.tip}>{TIPS[tip]}</Text>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The bar.
 *
 * Animates WIDTH, not `scaleY` or `scaleX` on a rounded shape — scaling a
 * rounded rect distorts its caps mid-transition, which is the giveaway of a
 * fill animation done the easy way. The fill keeps its own radius and travels
 * the full track.
 *
 * `value` of null means genuinely unmeasured (an older server, or ffmpeg has
 * not reported yet), and the bar holds a small honest sliver rather than
 * claiming zero or inventing motion.
 */
function ProgressBar({ value }: { value: number | null }) {
  const width = useSharedValue(value ?? 0.02);

  useEffect(() => {
    width.value = withTiming(value ?? 0.02, {
      // Slower than the poll interval, so the bar glides between measurements
      // instead of stepping.
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, width]);

  const style = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, width.value)) * 100}%`,
  }));

  return (
    <View style={s.track} accessibilityRole="progressbar">
      <Animated.View style={[s.fill, style]} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: vela.editorBg,
    paddingHorizontal: sp.lg,
    paddingTop: sp.xl,
    paddingBottom: sp.xl,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: sp.lg,
  },
  frame: {
    maxWidth: "100%",
    maxHeight: "100%",
    borderRadius: r.lg,
    overflow: "hidden",
    backgroundColor: vela.card,
  },
  readout: { gap: sp.sm },
  headRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  head: { color: vela.textLight, fontSize: 26, fontFamily: font.semibold },
  // Mono here is not costume: it is a number that changes every second, and a
  // proportional face makes it jitter as the digits change width.
  pct: { color: vela.textLight2, fontSize: 15, fontFamily: mono.regular },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: vela.divider,
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: vela.accent },
  stageLine: {
    color: vela.textLight2,
    fontSize: 14,
    fontFamily: font.medium,
  },
  tip: {
    color: vela.muted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: font.regular,
    marginTop: sp.sm,
  },
});
