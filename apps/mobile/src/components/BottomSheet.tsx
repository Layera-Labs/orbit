/**
 * BottomSheet — the one animated bottom sheet used across the app. The sheet
 * slides up from the bottom while the backdrop *fades* in (it does not slide);
 * both reverse on dismiss. Pass `style` to override the sheet surface (e.g. a
 * light background for the Home project menu). Colour differs per surface;
 * structure and motion stay identical everywhere.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { vela } from '../constants';

const SCREEN_H = Dimensions.get('window').height;

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
  const anim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [anim]);

  const close = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 190, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [anim, onClose]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] });

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      {/* Backdrop fades (never slides). */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dim, opacity: anim }]} />
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
