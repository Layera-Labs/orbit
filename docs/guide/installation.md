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

| Package | Install | Description |
|---------|---------|-------------|
| `@orbit/react` | `npm install @orbit/react` | React wrapper + full UI |
| `@orbit/next` | `npm install @orbit/next` | Next.js wrapper |
| `@orbit/core` | `npm install @orbit/core` | Vanilla canvas engine |
| `@orbit/ui` | `npm install @orbit/ui` | UI component library |
| `@orbit/shared` | `npm install @orbit/shared` | Types & utilities |
| `@orbit/agentic` | `npm install @orbit/agentic` | AI backend adapter |
| `@orbit/effects` | `npm install @orbit/effects` | WebGL shaders |
| `@orbit/assets` | `npm install @orbit/assets` | Asset utilities |

## Quick Install (React)

```bash
npm install @orbit/react
```

`@orbit/react` includes `@orbit/core`, `@orbit/ui`, `@orbit/shared`, and `@orbit/agentic` as dependencies. You only need this one package for most React projects.

## Framework-Specific

### Next.js

```bash
npm install @orbit/next
```

The Next.js package re-exports everything from `@orbit/react` with additional SSR-safe initialization.

### Vue / Svelte / Angular

Use `@orbit/core` directly:

```bash
npm install @orbit/core @orbit/ui @orbit/agentic @orbit/shared
```

Mount the engine in your framework's `onMount` equivalent and bind the state to your reactive store.

### CDN (No Build Step)

Orbit is not currently distributed via CDN. Use `esm.sh` or `unpkg` at your own risk for prototyping:

```html
<script type="module">
  import { OrbitEngine } from 'https://esm.sh/@orbit/core';
</script>
```

## TypeScript

All packages ship with `.d.ts` declaration files. No additional `@types` packages needed.

## Tree Shaking

All packages declare `"sideEffects": false` in `package.json`. Use a modern bundler (Vite, Rollup, webpack 5, esbuild) for automatic tree-shaking.
