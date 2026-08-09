# @layera-labs/ui

The component library the **v1** Orbit editor is built from: fourteen React
components, six hooks, and a light/dark theme pair expressed as CSS custom properties.

```bash
npm i @layera-labs/ui@beta
```

> **Beta.** `1.0.0-beta.3` under the `beta` tag; the API moves without notice.
>
> **This is part of the v1 line, which is legacy.** It exists because
> `@layera-labs/react` uses it. The v2 editor
> ([`@layera-labs/editor`](https://github.com/Layera-Labs/orbit/tree/main/packages/editor#readme))
> does not depend on this package and ships its own stylesheet.
>
> **React 18 only.** `react` and `react-dom` are peers at `^18.0.0`.

## Setup: Tailwind, and one preset

Read this before installing, because it is the thing that will surprise you.

The components are built with [`clsx`](https://github.com/lukeed/clsx) and
[`tailwind-merge`](https://github.com/dcastil/tailwind-merge) and emit **Tailwind
utility classes** in this design system's own namespace — `bg-orbit-accent`,
`text-orbit-text`, `rounded-orbit-md`, `duration-orbit-normal` and about fifty more.
Tailwind generates nothing for a name it has no theme entry for, so **you need
Tailwind in your build**, and you need the preset:

```js
// tailwind.config.js
module.exports = {
  presets: [require('@layera-labs/ui/tailwind.preset')],
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/@layera-labs/ui/dist/**/*.js',
  ],
};
```

Both lines of `content` matter. Tailwind only emits a utility for a class name it can
**see as literal text**, and after this package is built its class names live in
`dist/index.js` — scan only your own source and you get the names defined and none of
them generated.

Then apply a theme, because the preset's values are `var(--orbit-*)` references rather
than literal colours. That indirection is what lets a running app be recoloured without
re-rendering:

```ts
import { themeManager } from '@layera-labs/ui/themes';
themeManager.setTheme('orbit-dark');   // or 'orbit-light', or your own
```

`setTheme` writes the custom properties onto `document.documentElement`. If you would
rather not run that at startup, copy a theme's `variables` into your own `:root` — but
something has to set them, or every `orbit-*` utility resolves to nothing.

Two limits worth knowing. Tailwind's slash-opacity syntax (`bg-orbit-accent/50`) cannot
work against a variable holding a whole colour rather than channels, so it is
unsupported; the components never use it. And the preset covers colour, spacing,
radius, shadow, z-index, transitions, type and the four `animate-orbit-*` keyframes —
it does **not** ship a stylesheet, a CSS reset, or fonts. `--orbit-font-ui` names Inter
and `--orbit-font-mono` names JetBrains Mono; loading them is yours to do.

Prior to `1.0.0-beta.3` this package shipped the components and the themes with nothing
joining them, so an install produced correctly-structured, entirely unstyled output and
the mapping was left as an exercise. The preset is that mapping, and it is the same
object this repository builds its own apps with — not a second copy that can drift.

## Components

```tsx
import { OrbitButton } from '@layera-labs/ui';

<OrbitButton variant="secondary" size="sm" onClick={save}>Save</OrbitButton>;
```

`accordion`, `button`, `color-picker`, `context-menu`, `dialog`, `dropdown`, `input`,
`loading`, `resizable`, `sidebar`, `slider`, `tabs`, `toast`, `tooltip`. They are
exported under an `Orbit` prefix (`OrbitButton`, `OrbitDialog`, …). `OrbitButton`
takes `variant` (`primary` | `secondary` | `ghost` | `destructive` | `outline`), `size`
(`sm` | `md` | `lg` | `icon`) and Radix's `asChild`.

## Hooks

`useSidebar`, `useDialog`, `useDropdown`, `useAccordion`, `useToast`, and `useTheme`:

```ts
import { useTheme } from '@layera-labs/ui';

const { theme, setTheme, toggleTheme, isDark } = useTheme();
```

## Themes

```ts
import { themeManager, darkTheme, lightTheme } from '@layera-labs/ui/themes';

themeManager.registerTheme(myBrandTheme);   // an OrbitTheme from @layera-labs/shared
themeManager.setTheme('my-brand');
themeManager.getCurrentTheme();
```

`setTheme` writes the theme's `variables` onto the document as custom properties.
`themeManager` is a module-level singleton, which is worth knowing if you render two
independently-themed editors on one page: you cannot.

## There is no CLI

A `orbit-ui add <component>` binary used to be declared here, in the shadcn style. It
has been removed, because it had never worked as published and could not have: it was
written as CommonJS `require` in a `.js` file inside a `"type": "module"` package, so
every invocation crashed before reading an argument, and `add` copied from a `src/`
directory the tarball does not ship.

Import the components instead. That is what the copier existed to avoid, and it was
never the better option here — these components are not standalone files you own and
edit, they read `cn` from `@layera-labs/shared` and Radix primitives from
`node_modules`.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/configuration.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/configuration.md)

MIT.
