/**
 * Shared entrance/exit motion for the app's bottom sheets (BottomSheet,
 * InputSheet, TtsSheet, …). The sheet springs up with a gently damped settle
 * (no bounce) while its backdrop fades; on dismiss both glide back with a quick
 * eased curve. One tuned curve, used everywhere, so every sheet feels the same.
 *
 * Returns a driver you wire into the sheet: `translateY` for the surface,
 * `backdrop` (0→1) for the dim overlay's opacity, and `close` — call it instead
 * of the raw `onClose` so the exit animates before the sheet unmounts.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing } from 'react-native';

const SCREEN_H = Dimensions.get('window').height;

export function useSheetMotion(onClose: () => void) {
  const anim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown

  useEffect(() => {
    // Near-critically-damped rise: a whisper of settle, no visible bounce.
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 30,
      stiffness: 260,
      mass: 1,
      restDisplacementThreshold: 0.4,
      restSpeedThreshold: 4,
    }).start();
  }, [anim]);

  const close = useCallback(() => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [anim, onClose]);

  // Clamp so the spring's tiny overshoot can't lift the sheet past its rest
  // position or drive backdrop opacity beyond full.
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0], extrapolate: 'clamp' });
  const backdrop = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return { translateY, backdrop, close };
}
