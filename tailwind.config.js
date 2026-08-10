/**
 * The repository's own Tailwind build.
 *
 * The `orbit-*` theme extension this used to spell out in full now lives in
 * `packages/ui/tailwind.preset.cjs`, because it had to be PUBLISHED: the
 * components in `@layera-labs/orbit-ui` emit those class names, and a consumer who
 * installed the package got no rules for any of them. Keeping a second copy
 * here would mean the preset consumers use and the theme the components are
 * developed against could quietly disagree, which is the same failure the
 * hand-typed `ORBIT_VERSION` was. One object, used from both sides.
 *
 * What stays here is what is genuinely local: which files to scan, and the
 * dark-mode selector this repo's own apps use.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('./packages/ui/tailwind.preset.cjs')],
  darkMode: ['class', '[data-theme="orbit-dark"]'],
  content: [
    './packages/ui/src/**/*.{ts,tsx}',
    './packages/react/src/**/*.{ts,tsx}',
    './apps/**/*.{ts,tsx}',
  ],
};
