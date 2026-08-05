/**
 * Applying the bar style, kept apart from DECIDING it.
 *
 * The decision lives in `barStyle.ts`, which imports nothing. That split is
 * what makes it testable: `expo-status-bar` reaches React Native's own
 * Flow-typed source, whose `import typeof` the test runner's parser rejects
 * outright — so a module that touches it can never be imported by a test, and
 * the rule about which screen wears which glyphs is exactly the part worth
 * pinning.
 */
import { useEffect } from "react";
import { setStatusBarStyle } from "expo-status-bar";
import { barStyleFor, type BarScreen, type BarStyle } from "./barStyle";

export { barStyleFor } from "./barStyle";
export type { BarScreen, BarStyle } from "./barStyle";

/**
 * Hold a style while something is mounted, and put the screen's own back after.
 *
 * `expo-status-bar` has no stack: its `StatusBar` component applies a style on
 * render and does nothing on unmount. So a light full-screen sheet opened over
 * the dark editor set dark glyphs, and closing it left them dark ON the dark
 * editor — the same invisibility, arrived at from the other side. The root
 * `<StatusBar>` does not rescue it, because its own effect only re-runs when
 * its style prop changes, and the screen has not changed.
 *
 * Restoring on unmount is what makes the two cases one rule.
 */
export function useStatusBarStyle(style: BarStyle, screen: BarScreen): void {
  useEffect(() => {
    setStatusBarStyle(style);
    return () => setStatusBarStyle(barStyleFor(screen));
  }, [style, screen]);
}
