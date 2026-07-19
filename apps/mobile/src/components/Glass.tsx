/**
 * Glass — the one place liquid glass is applied. On iOS 26 (where
 * `isLiquidGlassAvailable()`), it renders Apple's native `UIGlassEffect` via
 * expo-glass-effect, which refracts the real content behind it. Everywhere else
 * it falls back to a plain solid surface — never a fake CSS/blur "glass".
 *
 * Use it only over real content worth refracting (the floating nav / action
 * bars over the scrolling list), not over flat fills.
 */
import { View, type ViewProps } from 'react-native';
import { GlassView, isLiquidGlassAvailable, type GlassStyle, type GlassColorScheme } from 'expo-glass-effect';

export const LIQUID_GLASS = isLiquidGlassAvailable();

export function Glass({
  glassStyle = 'regular',
  tint,
  interactive = false,
  colorScheme,
  fallbackColor,
  style,
  children,
  ...rest
}: ViewProps & {
  glassStyle?: GlassStyle;
  tint?: string;
  interactive?: boolean;
  /**
   * Pin the glass appearance instead of letting it adapt to the backdrop.
   * The floating bars sit over a light app, so pinning `light` keeps their
   * dark icons legible even when darker content scrolls behind them.
   */
  colorScheme?: GlassColorScheme;
  /** Solid surface used when liquid glass is unavailable. */
  fallbackColor: string;
}) {
  if (LIQUID_GLASS) {
    return (
      <GlassView style={style} glassEffectStyle={glassStyle} tintColor={tint} isInteractive={interactive} colorScheme={colorScheme} {...rest}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, { backgroundColor: fallbackColor }]} {...rest}>
      {children}
    </View>
  );
}
