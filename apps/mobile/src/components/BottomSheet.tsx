/**
 * BottomSheet — the one animated bottom sheet used across the app. The sheet
 * springs up from the bottom with a gently damped settle while the backdrop
 * *fades* in (it never slides); both reverse with a quick eased glide on
 * dismiss (shared motion — see `useSheetMotion`). Pass `style` to override the
 * sheet surface (e.g. a light background for the Home project menu). Colour
 * differs per surface; structure and motion stay identical everywhere.
 */
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { vela } from '../constants';
import { useSheetMotion } from './sheetMotion';

export function BottomSheet({
  onClose,
  children,
  style,
  dim = '#0008',
}: {
  onClose: () => void;
  children: React.ReactNode;
  style?: object;
  dim?: string;
}) {
  const { translateY, backdrop, close } = useSheetMotion(onClose);

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      {/* Backdrop fades (never slides). */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dim, opacity: backdrop }]} />
      <View style={styles.fill}>
        {/* Tap-outside-to-close sits behind the sheet. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[styles.sheet, style, { transform: [{ translateY }] }]}>{children}</Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: vela.sheet, padding: 18, paddingBottom: 34, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 14 },
});
