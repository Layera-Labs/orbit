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
| `@layera-labs/orbit-react` | `npm install @layera-labs/orbit-react` | React wrapper + full UI |
| `@layera-labs/orbit-next` | `npm install @layera-labs/orbit-next` | Next.js wrapper |
| `@layera-labs/orbit-core` | `npm install @layera-labs/orbit-core` | Vanilla canvas engine |
| `@layera-labs/orbit-ui` | `npm install @layera-labs/orbit-ui` | UI component library |
| `@layera-labs/orbit-shared` | `npm install @layera-labs/orbit-shared` | Types & utilities |
| `@layera-labs/orbit-agentic` | `npm install @layera-labs/orbit-agentic` | AI backend adapter |
| `@layera-labs/orbit-effects` | `npm install @layera-labs/orbit-effects` | WebGL shaders |
| `@layera-labs/orbit-assets` | `npm install @layera-labs/orbit-assets` | Asset utilities |

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
