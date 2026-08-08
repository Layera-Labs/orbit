/**
 * Which status-bar glyphs a surface needs, in ONE place.
 *
 * ## Why this is stated per screen and never `auto`
 *
 * `expo-status-bar`'s `auto` follows the APP'S colour scheme, not what is
 * actually behind the bar — and `app.json` declares `userInterfaceStyle:
 * "dark"`, so `auto` resolves to white glyphs on every device and every system
 * setting. On a light screen that puts a white clock, wifi and battery on
 * `#f7f7fa`. The right glyph colour is a property of the SURFACE, so it is
 * derived from the screen.
 *
 * ## Why it is a function rather than a list at the call site
 *
 * The router had its own inline `darkTop` expression and every full-screen
 * sheet had its own literal, so "which screens are dark" was written in several
 * places and drifted: `ai` was in the router's dark list while
 * `AiStudioScreen`'s root is `vela.homeBg` with `vela.ink` text — a light
 * screen wearing white glyphs, which is exactly the bug this file exists to
 * stop. One function, and adding a screen means answering the question once.
 */
export type BarStyle = "light" | "dark";

/**
 * The routable screens, spelled out here rather than imported from the store.
 *
 * Not a duplicate for its own sake: importing `Screen` pulls `editorStore` —
 * and through it React Native's own Flow-typed source, whose `import typeof`
 * the test runner's parser cannot read. Every mobile test that exists is over a
 * pure module for exactly this reason, and this rule deserves a test more than
 * it deserves one fewer line.
 *
 * The two unions cannot drift silently: `App.tsx` calls `barStyleFor(screen)`
 * with the store's own `Screen`, so a name added or renamed there fails to
 * compile at the real call site.
 */
export type BarScreen =
  | "projects"
  | "discover"
  | "library"
  | "ai"
  | "profile"
  | "pick"
  | "generate"
  | "editor";

/**
 * The DARK-surfaced screens — the only ones that want light glyphs.
 *
 * `pick` is here deliberately: it is the first step of editing and wears the
 * editor's dark chrome (`vela.editorBg`), not Home's light.
 *
 * `ai` is deliberately NOT here. It reads like editor chrome because it is
 * reached from the same rail, but `AiStudioScreen` is a light screen.
 * `generate` is reached from `ai` and shares its surface, so it is not here
 * either — unlike `pick`, which is reached from Home and wears the editor's.
 */
const DARK_SCREENS: ReadonlySet<BarScreen> = new Set<BarScreen>([
  "editor",
  "pick",
]);

export function barStyleFor(screen: BarScreen): BarStyle {
  return DARK_SCREENS.has(screen) ? "light" : "dark";
}
