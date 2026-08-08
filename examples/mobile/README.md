# Orbit example — mobile

A small React Native app that does three things with the Orbit render service,
one per tab:

| Tab | What it shows |
|---|---|
| **AI studio** | `POST /v1/generate` — a topic goes in, the service plans, narrates, captions, illustrates, cuts and renders, and a finished video comes back. Start-then-poll. |
| **Timeline** | The video model as plain data. Import clips, reorder them, trim either edge, scrub. All the arithmetic is pure functions in `src/orbit/timeline.ts`. |
| **Export** | Upload the local media, `POST /v1/render` as a job, poll it, download the MP4 and save it to Photos. |

It is roughly 1,400 lines. It is meant to be read start to finish.

## What this is not

This is an **example**, not a product. There is no preview renderer, no
effects, no transitions, no captions, no multi-track, no undo, no sign-in and no
project storage — every one of those is real work that would bury the three
ideas above. The full mobile editor lives in its own repository.

Anything below `src/orbit/` is the part worth copying. `src/screens/` is one
plausible interface over it, not the interface.

## Running it

```bash
cd examples/mobile
npm install
```

**npm, never pnpm.** This app deliberately sits outside the pnpm workspace
(`pnpm-workspace.yaml` excludes it): pnpm's symlinked store corrupts Metro's
module resolution, and the failure looks like a missing module in a package
you can plainly see installed.

Then start the render service — the app is a client and does nothing useful
without one — and launch:

```bash
npx expo run:ios
```

The service URL resolves in this order (`src/orbit/server.ts`):

1. `extra.serverUrl` in `app.json`, if you set it.
2. Expo's dev host — the machine running Metro, on port 8787. This is why a dev
   build on a physical phone reaches your Mac with no configuration.
3. `http://localhost:8787`, which is what the simulator uses.

The timeline and export tabs work against any Orbit service, with nothing
configured. The AI studio tab additionally needs a language model and a voice:
`ORBIT_LLM_BASE_URL`, `ORBIT_LLM_MODEL`, `ORBIT_LLM_API_KEY` and
`ELEVENLABS_API_KEY`. Without them `/v1/generate` answers `503`, and the screen
says which variables are missing rather than offering a retry that cannot work.

## Tests

```bash
npm test
```

19 tests over `src/orbit/timeline.ts` — packing, trim clamps at both edges,
which clip is on screen at a given time. Plain data in, plain data out, so they
run at a terminal in milliseconds with no simulator involved. The screens are
not tested; they are meant to be read and looked at.

## No account required

Every route on the service needs a JWT, but that does not mean signing in. A
device with no account asks `POST /v1/auth/guest` for a token the *service*
issued and signed, and uploads, renders and generates against that identity's
free credits. `src/orbit/session.ts` is the whole of it, and the two comments in
it — one in-flight bootstrap, and retry a 401 exactly once — are both there
because getting them wrong costs real credits.

## The one piece of scaffolding

`src/orbit/types.ts` hand-copies the slice of Orbit's video model this app
touches. **It is temporary.** `@orbit/video` is not published yet, and an Expo
app cannot join the pnpm workspace to reach it by source. When the package
ships, that whole file becomes one line:

```ts
export type { VideoProject, VisualTrack, VisualTrackClip } from '@orbit/video/browser';
```

Every field in it is a copy — same names, same units, same optionality — so the
JSON this app posts to `/v1/render` is a real Orbit project and not a lookalike.
