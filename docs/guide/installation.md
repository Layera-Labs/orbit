# Installation

> **Not yet on npm.** These packages are not published to a registry; the
> install commands below describe the intended shape once they are. Today Orbit is
> consumed from source in the monorepo — see the [README](../../README.md) for what
> actually works, and the roadmap for when this changes. There is no Orbit API key:
> the render service authenticates with its own JWTs, including guest tokens.

Orbit is distributed as a monorepo of scoped npm packages. Install only what you need for your framework and features.

## Requirements

- Node.js 20+
- React 18+ (for React/Next.js wrappers)
- A valid Orbit API key

## Package Overview

**The current SDK (v2), and the engine underneath it.**

| Package | Install | What it is |
|---------|---------|------------|
| `@layera-labs/orbit-video` | `npm i @layera-labs/orbit-video` | The engine: timeline model, effect maths, the ffmpeg argument builder. Depends on nothing else here |
| `@layera-labs/orbit-model` | `npm i @layera-labs/orbit-model` | Headless reactive document model, with history |
| `@layera-labs/orbit-render` | `npm i @layera-labs/orbit-render` | Konva renderer — the canvas as a pure function of the model |
| `@layera-labs/orbit-providers` | `npm i @layera-labs/orbit-providers` | Interfaces for templates, fonts, backgrounds and stock photos |
| `@layera-labs/orbit-editor` | `npm i @layera-labs/orbit-editor` | The assembled React editor |

**v1 — feature-complete and in maintenance.** It still builds and is still
published; new work goes into v2. Most of this guide documents v1.

| Package | Install | What it is |
|---------|---------|------------|
| `@layera-labs/orbit-react` | `npm i @layera-labs/orbit-react` | React wrapper + full UI |
| `@layera-labs/orbit-next` | `npm i @layera-labs/orbit-next` | Next.js wrapper |
| `@layera-labs/orbit-core` | `npm i @layera-labs/orbit-core` | Vanilla canvas engine |
| `@layera-labs/orbit-ui` | `npm i @layera-labs/orbit-ui` | UI component library |
| `@layera-labs/orbit-shared` | `npm i @layera-labs/orbit-shared` | Types and utilities |
| `@layera-labs/orbit-effects` | `npm i @layera-labs/orbit-effects` | WebGL shaders |
| `@layera-labs/orbit-agentic` | `npm i @layera-labs/orbit-agentic` | AI backend adapter. An OPTIONAL peer — v1 builds and runs without it |

> `@layera-labs/orbit-assets` used to be listed here. It is **private and not
> published**, so the install line 404s. It is an internal dependency of the
> render service, not something a consumer mounts.

## Quick Install (React)

```bash
npm install @layera-labs/orbit-react
```

`@layera-labs/orbit-react` includes `@layera-labs/orbit-core`, `@layera-labs/orbit-ui`, `@layera-labs/orbit-shared`, and `@layera-labs/orbit-agentic` as dependencies. You only need this one package for most React projects.

## Framework-Specific

### Next.js

```bash
npm install @layera-labs/orbit-next
```

The Next.js package re-exports everything from `@layera-labs/orbit-react` with additional SSR-safe initialization.

### Vue / Svelte / Angular

Use `@layera-labs/orbit-core` directly:

```bash
npm install @layera-labs/orbit-core @layera-labs/orbit-ui @layera-labs/orbit-agentic @layera-labs/orbit-shared
```

Mount the engine in your framework's `onMount` equivalent and bind the state to your reactive store.

### CDN (No Build Step)

Orbit is not currently distributed via CDN. Use `esm.sh` or `unpkg` at your own risk for prototyping:

```html
<script type="module">
  import { OrbitEngine } from 'https://esm.sh/@layera-labs/orbit-core';
</script>
```

## TypeScript

All packages ship with `.d.ts` declaration files. No additional `@types` packages needed.

## Tree Shaking

All packages declare `"sideEffects": false` in `package.json`. Use a modern bundler (Vite, Rollup, webpack 5, esbuild) for automatic tree-shaking.
