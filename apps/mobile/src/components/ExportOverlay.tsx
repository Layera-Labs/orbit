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
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { font, mono, sp, r, vela } from "../constants";
import type { VideoProject } from "../model/types";
import { exportStageLabel, useEditor } from "../store/editorStore";

/**
 * Things worth knowing about Orbit, shown one at a time while the wait runs.
 *
 * All true, all checkable in the app. The alternative — brand voice filler —
 * goes stale by the tenth export, and a line you have read nine times is worse
 * than no line at all.
 */
interface Tip {
  text: string;
  /** Left out when it does not apply to the project being exported. */
  when?: (project: VideoProject) => boolean;
}

const TIPS: Tip[] = [
  {
    text: "Drag a clip's edge to trim it. The rest of the timeline stays where you put it.",
  },
  { text: "Pinch the timeline to zoom in for frame-accurate cuts." },
  {
    text: "Captions export as a separate .srt file as well as burned into the picture.",
    // Nobody wants to be told about the .srt file for a video with no words in
    // it — a true statement about someone else's project.
    when: (p) => p.overlays.length > 0,
  },
  { text: "Drop a second clip on the image lane to get picture-in-picture." },
  { text: "Hold a photo in the media drawer to pick several at once." },
  {
    text: "A clip's speed changes its sound too — the pitch follows.",
    when: (p) =>
      (p.tracks ?? []).some((t) =>
        t.clips.some((c) => "type" in c && c.type === "video"),
      ),
  },
  {
    text: "Anything you generate with AI is saved to your Library for every project.",
  },
  { text: "Your projects sync across devices once you sign in." },
];

/** Shared by the tip and the slot that reserves room for two lines of it. */
const TIP_LINE_HEIGHT = 19;

/** How long each tip stays up. Long enough to read twice, unhurried. */
const TIP_MS = 6500;

export function ExportOverlay() {
  const exporting = useEditor((s) => s.exporting);
  const state = useEditor((s) => s.exportState);
  const project = useEditor((s) => s.project);
  const posterUri = useEditor((s) => s.posterUri);

  const tips = useMemo(
    () =>
      TIPS.filter((t) => !t.when || (project && t.when(project))).map(
        (t) => t.text,
      ),
    [project],
  );

  const [tip, setTip] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);
  useEffect(() => {
    if (!exporting) {
      setTip(0);
      setPosterFailed(false);
      return;
    }
    const timer = setInterval(() => setTip((n) => n + 1), TIP_MS);
    return () => clearInterval(timer);
  }, [exporting]);

  const ratio =
    project && project.height > 0 ? project.width / project.height : 9 / 16;
  const [stage, setStage] = useState({ w: 0, h: 0 });
  // Fit inside the stage on BOTH axes: a tall 9:16 is bounded by height, a wide
  // 16:9 by width, and neither is ever cropped or pushed off the screen.
  const frameW = Math.max(0, Math.min(stage.w, stage.h * ratio));
  const frameH = ratio > 0 ? frameW / ratio : 0;
  const pct = state?.progress ?? null;
  /*
   * A project can be built entirely from stickers and captions on a colour, in
   * which case there is no frame to poster and the flat background IS the
   * video's first frame — more honest than an empty grey rectangle.
   */
  const bg = project?.background;
  const frameFill = bg?.type === "color" && bg.color ? bg.color : vela.card;

  return (
    /*
     * SafeAreaView keeps the frame out from under the status bar and the tip
     * out of the home-indicator zone — but it carries NO padding of its own,
     * and that is not a style preference.
     *
     * RN's SafeAreaView applies the insets by writing `padding` onto its own
     * native view, which silently REPLACES whatever padding its style asked
     * for. In portrait the left and right insets are zero, so a
     * `paddingHorizontal` declared here became 0 and the headline, the bar and
     * the tip all ran flush to both rims. The gutter has to live on a child the
     * insets cannot reach.
     */
    <Modal visible={exporting} animationType="fade" statusBarTranslucent>
      <SafeAreaView style={s.safe}>
        <View style={s.screen}>
          {/*
            The video, given the room — sized in JS from the measured stage, the
            same way `EditorScreen` sizes the live preview.

            This was `aspectRatio` with `maxWidth`/`maxHeight` at 100%, which
            looks like it should work and does not: a max is a CLAMP, not a
            size, so with no width or height to start from Yoga resolved the
            frame to **zero** and the whole top of the screen was empty. The
            poster had nowhere to draw even when there was one, which is why
            fixing the poster's uri alone would not have fixed the screen.
          */}
          <View
            style={s.stage}
            onLayout={(e) =>
              setStage({
                w: e.nativeEvent.layout.width,
                h: e.nativeEvent.layout.height,
              })
            }
          >
            <View
              style={[
                s.frame,
                { width: frameW, height: frameH, backgroundColor: frameFill },
              ]}
            >
              {posterUri && !posterFailed ? (
                <Image
                  source={{ uri: posterUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  // A poster is an absolute path into a container iOS renumbers
                  // on every install. `<Image>` fails silently on a dead one, so
                  // without this the frame is an unexplained rectangle and there
                  // is nothing on screen or in the log to say why.
                  onError={() => setPosterFailed(true)}
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
            {/*
            The slot is sized for TWO lines whatever this tip needs, because
            the tips rotate and they are not all the same length. Sized to the
            text, a one-line tip followed by a two-line one grew the block by
            19pt and shoved everything above it up the screen — a progress
            screen twitching while you wait on it, for no reason but the copy.

            minHeight rather than a fixed height, and no numberOfLines: a tip
            that somehow needs three (a longer string, or larger accessibility
            text) still shows in full. It costs a rare small jump instead of
            silently truncating the sentence.
          */}
            <View style={s.tipSlot}>
              <Text style={s.tip}>{tips[tip % tips.length]}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: vela.editorBg },
  screen: {
    flex: 1,
    // A real gutter. At 16 the copy ran almost to the rim on both sides, which
    // reads as a missing margin rather than a full-bleed decision.
    paddingHorizontal: sp.xxl,
    paddingTop: sp.xl,
    // Enough that the tip is not the last thing before the edge of the screen.
    // The home indicator itself is already cleared by the safe area above.
    paddingBottom: sp.xl,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    // A MARGIN, not padding: the gap to the readout has to sit outside the box
    // `onLayout` reports, or the frame would be sized against space it is not
    // allowed to use and would push into the text below it.
    marginBottom: sp.xxl,
  },
  frame: {
    borderRadius: r.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    // A project on a black background is black on a near-black screen, so
    // without an edge the frame has no findable boundary and the whole top of
    // the screen reads as empty rather than as a video waiting to be made.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: vela.divider,
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
  tipSlot: {
    // Two lines of `tip`'s own lineHeight. Stated from the same number the
    // text uses, so changing one cannot silently stop matching the other.
    minHeight: TIP_LINE_HEIGHT * 2,
    marginTop: sp.sm,
    justifyContent: "center",
  },
  tip: {
    color: vela.muted,
    fontSize: 13,
    lineHeight: TIP_LINE_HEIGHT,
    fontFamily: font.regular,
  },
});
