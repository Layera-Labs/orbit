# @layera-labs/editor

The React UI for the Orbit v2 canvas editor: the shell, the side panels, the context
toolbar, export, theming, and the keyboard shortcuts. It mounts
`@layera-labs/render`'s canvas inside all of that and drives `@layera-labs/model`.

This is the package to install if you want an editor. The other three v2 packages are
its parts, and it re-exports both `@layera-labs/model` and `@layera-labs/providers`, so
`createStore` and `ProviderRegistry` are available from here without a second import.

It is **v2**, the current line. `@layera-labs/react` is the *older* v1 editor and is
not this — see the bottom of this file.

```bash
npm i @layera-labs/editor@beta konva react-konva
```

> **Beta.** `1.0.0-beta.3` under the `beta` tag; the API moves without notice.
>
> **React 18 only.** `react`, `react-dom`, `konva` and `react-konva` are peers pinned
> to the React-18 line, because `react-konva@18.2.x` is that line and two React copies
> is a hard crash in Konva's reconciler, not a warning.

## Mount it

```tsx
import { OrbitEditor, createStore } from '@layera-labs/editor';
import '@layera-labs/editor/styles.css';

const store = createStore({ width: 1080, height: 1080 });

export default function Page() {
  return <OrbitEditor store={store} defaultTheme="light" />;
}
```

`styles.css` is not optional. The editor's variables (`--o-*`) and the canvas
selection chrome (`.o-*`) are both scoped under `.orbit`, which this stylesheet
declares.

## Control the theme, or lose it

`OrbitEditor` takes `theme` and `onThemeChange` for the controlled case and
`defaultTheme` for the uncontrolled one. Pass `theme` and the host owns it.

If you only pass `defaultTheme`, the editor keeps its own stored preference, and a
returning user's stored choice **outlives your default** — which is how you end up
with a light editor sitting inside a dark application. If your app has a theme, make
the editor controlled.

## Choose what panels exist

Panels are `sections`, and by default the editor renders `DEFAULT_SECTIONS`. Sections
whose provider is missing from the registry hide themselves, so the set you get is a
consequence of what you supply rather than a list you maintain.

```tsx
import {
  OrbitEditor, createStore, defineSection,
  TemplatesSection, TextSection, LayersSection,
} from '@layera-labs/editor';

const brandKit = defineSection({
  id: 'brand',
  label: 'Brand',
  icon: <BrandIcon />,          // a ReactNode, not an icon name
  Panel: BrandPanel,            // a ComponentType, taking no props
  visible: ({ hasProvider }) => hasProvider('templates'),
});

<OrbitEditor
  store={createStore()}
  providers={{ templates: myTemplates }}
  sections={[TemplatesSection, TextSection, brandKit, LayersSection]}
/>;
```

`providers` is a plain `ProviderMap` — the editor builds the registry from it. The
`visible` guard is exactly how the built-in sections hide themselves; it receives
`hasProvider` and nothing else.

`CORE_SECTIONS` is the subset that needs no provider at all (text, elements, layers) —
a useful base when you are assembling your own list.

## Building your own chrome

If you want the panels but not the shell, the pieces are exported individually:
`SidePanel`, `TopBar`, `ContextToolbar`, `PagesPanel`, `SelectionActions`,
`ExportMenu`, `ZoomControl`, `ThemeToggle`, `SizeBackgroundBar`, plus `Popover` and
`SliderRow` for matching your own controls to the editor's. `useEditorShortcuts`
installs the keymap on its own.

Composing these yourself means rendering `Workspace` from `@layera-labs/render` and
wrapping the lot in `<div className="orbit">`, which is what the shell does. The web
app in this repo does exactly that, and adds `orbitEmbedded` to undo the shell's
`position: absolute` so a CSS grid survives around it.

Inside any of these, `useEditor`, `useStore`, `useEditorState`, `useSelectedElement`,
`useHistory`, `useProviders` and `useTheme` read from the surrounding
`EditorProvider`.

## Export

`ExportMenu` covers PNG, JPEG, SVG and PDF (via `jspdf`). Video export is not in this
package — the video timeline is a different document kind, in
[`@layera-labs/video`](https://github.com/Layera-Labs/orbit/tree/main/packages/video#readme),
and rendering it to an MP4 needs ffmpeg on a server.

## v1 versus v2

`@layera-labs/react` also exports a component called `OrbitEditor`. It is the v1 SDK: a
fabric.js engine (`@layera-labs/core`), Zustand, its own panels. It is legacy and
maintenance-only. This package is the current architecture and shares no code with it.
Do not install both and expect them to interoperate.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/architecture-v2.md](https://github.com/Layera-Labs/orbit/blob/main/docs/architecture-v2.md)

MIT.
