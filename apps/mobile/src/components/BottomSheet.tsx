/**
 * BottomSheet — the one animated bottom sheet used across the app. The sheet
 * springs up from the bottom with a gently damped settle while the backdrop
 * *fades* in (it never slides); both reverse with a quick eased glide on
 * dismiss (shared motion — see `useSheetMotion`). Pass `style` to override the
 * sheet surface when needed. App sheets are light by default; the editor canvas
 * remains dark behind them.
 */
import { useEffect, useState } from "react";
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { vela } from "../constants";
import { useSheetMotion } from "./sheetMotion";
import { useDismissKeyboardOnUnmount } from "./keyboard";

/**
 * How far the keyboard currently covers the screen.
 *
 * A sheet is anchored to the bottom, so the keyboard opens straight over
 * whatever is lowest in it — which is exactly where a text field and its Done
 * button tend to sit. Padding the container by the keyboard's height lifts the
 * whole sheet clear of it.
 *
 * `will*` on iOS, not `did*`: the will events fire BEFORE the keyboard's
 * animation, so the sheet travels with it instead of snapping up afterwards.
 * Android has no will events. `willChangeFrame` looks like the more complete
 * choice and is not — it also fires while the keyboard is leaving, racing
 * `willHide` to restore an inset that should be going to zero.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(
      ios ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setInset(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(
      ios ? "keyboardWillHide" : "keyboardDidHide",
      () => setInset(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return inset;
}

export function BottomSheet({
  onClose,
  children,
  style,
  dim = "#0008",
}: {
  onClose: () => void;
  children: React.ReactNode;
  style?: object;
  dim?: string;
}) {
  const { translateY, backdrop, close } = useSheetMotion(onClose);
  const keyboardInset = useKeyboardInset();
  /*
   * Every sheet in the app is one of these, so this is the one place that has
   * to know: a sheet raising the keyboard owns lowering it again. Without it a
   * sheet dismissed with a field focused leaves the keyboard floating over the
   * screen behind, which has nothing left to type into.
   */
  useDismissKeyboardOnUnmount();

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={close}
    >
      {/* Backdrop fades (never slides). */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: dim, opacity: backdrop },
        ]}
      />
      <View style={[styles.fill, { paddingBottom: keyboardInset }]}>
        {/* Tap-outside-to-close sits behind the sheet. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View
          style={[styles.sheet, style, { transform: [{ translateY }] }]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: vela.lightCard,
    padding: 18,
    paddingBottom: 34,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
  },
});
