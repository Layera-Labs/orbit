# Repository Guidelines

## Project Structure & Module Organization

Orbit is a pnpm/Turbo TypeScript monorepo. Workspace entries live under `packages/*` and `apps/*`.

- `packages/core`: canvas engine, scene graph, renderer, history, audio/video utilities.
- `packages/react` and `packages/next`: React and Next.js editor wrappers.
- `packages/ui`, `packages/shared`, `packages/assets`, `packages/effects`, `packages/agentic`: reusable UI, types, asset providers, effects, and AI workflow modules.
- `apps/demo`: Vite React demo. `apps/demo-next`: Next.js demo.
- `docs/`: API and guide markdown. Tests are colocated in `src/__tests__/` with `*.test.ts` names.

## Build, Test, and Development Commands

Use Node `>=20` and pnpm `10.29.2`.

- `pnpm install`: install workspace dependencies.
- `pnpm dev`: run all package/app development tasks through Turbo.
- `pnpm --filter @orbit/demo dev`: start the Vite demo.
- `pnpm --filter @orbit/demo-next dev`: start the Next.js demo.
- `pnpm build`: build packages and apps, producing `dist/` and `.next/` outputs.
- `pnpm typecheck`: run strict TypeScript checks across buildable packages.
- `pnpm test`: run Vitest suites with the shared root config.
- `pnpm lint`: run configured lint tasks, currently mainly the Next demo.
- `pnpm format`: format `ts`, `tsx`, `md`, and `json` files with Prettier.

## Coding Style & Naming Conventions

Code is ESM TypeScript with strict compiler settings. Keep exports typed, avoid unused locals/parameters, and follow nearby file style. Use PascalCase for React components (`OrbitEditor.tsx`), `useX` for hooks, camelCase for utilities, and domain-oriented module names such as `scene-graph.ts` or `layerPlacement.ts`. Prefer workspace imports like `@orbit/shared` over deep relative paths when a package export exists.

## Testing Guidelines

Use Vitest with the shared `vitest.config.ts` and `jsdom` environment. Add tests next to the package code in `src/__tests__/`, using descriptive `*.test.ts` filenames. Cover engine, command, renderer-adjacent, and state-management changes with focused unit tests before relying on demo verification.

## Commit & Pull Request Guidelines

Git history currently only shows `Initial commit`, so there is no established convention to preserve. Use short, imperative commit subjects; scoped prefixes are helpful, for example `core: fix viewport bounds` or `react: add upload state test`. Pull requests should include a clear summary, commands run, linked issues, and screenshots or screen recordings for editor UI changes.

## Security & Configuration Tips

Turbo treats `**/.env.*local` as global dependencies. Keep secrets in local env files, do not commit them, and document any required public demo variables in the relevant app or docs page.
