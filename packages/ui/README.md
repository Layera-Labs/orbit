# @layera-labs/ui

The component library the **v1** Orbit editor is built from: fourteen React
components, six hooks, and a light/dark theme pair expressed as CSS custom properties.

```bash
npm i @layera-labs/ui@beta
```

> **Beta.** `1.0.0-beta.2` under the `beta` tag; the API moves without notice.
>
> **This is part of the v1 line, which is legacy.** It exists because
> `@layera-labs/react` uses it. The v2 editor
> ([`@layera-labs/editor`](https://github.com/Layera-Labs/orbit/tree/main/packages/editor#readme))
> does not depend on this package and ships its own stylesheet.
>
> **React 18 only.** `react` and `react-dom` are peers at `^18.0.0`.

## It needs Tailwind, and it needs your colours

Read this before installing, because it is the thing that will surprise you.

The components are built with [`clsx`](https://github.com/lukeed/clsx) and
[`tailwind-merge`](https://github.com/dcastil/tailwind-merge) and emit **Tailwind
utility classes**, including project-specific colour names like `bg-orbit-accent`,
`text-orbit-text` and `border-orbit-border`. This package ships **no CSS and no
Tailwind preset**. You need Tailwind in your build, and you need to define those
`orbit-*` colours in your own `tailwind.config`, or every component renders unstyled.

The `themes` export gives you the values but not the wiring — `darkTheme` and
`lightTheme` are `OrbitTheme` records of CSS custom properties (`--orbit-panel-bg`,
`--orbit-text-primary`, and so on). Mapping those variables onto Tailwind colour names
is the step you have to write yourself. That gap is real and it is not documented
anywhere else; it is the main reason to prefer `@layera-labs/editor` for new work.

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
