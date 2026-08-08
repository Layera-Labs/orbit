# Orbit — project context for Claude

Read this first. It exists so the user never has to re-explain the project.

## What Orbit is

Open-source, embeddable, white-label **design-canvas editor SDK** for **image + video**,
with an agentic (AI) layer. Inspired by **Polotno SDK** and **Canva**. Targets React,
Next.js, and React Native.

**This repo is the SDK.** The mobile video editor was extracted to its own repo on
2026-08-08 and **purged from this history** — it is a product, not part of what is
being published, and it was 40k lines of app sitting where an SDK's examples
belong. It lives at `~/Github/orbit-mobile` with its own 182 commits and its own
CLAUDE.md carrying everything that was learned building it.

**One brand, settled 2026-07-31: Layera Labs is the org, Orbit is the product.**
`github.com/Layera-Labs/orbit`. The SDK is Orbit SDK and the app is Orbit — not two
names. Naming the SDK **Galaxy was considered and rejected**: Apple's identifier
namespace is global and another team holds `com.galaxy.*` (see the bundle-id note
below, which cost a rename), Samsung owns the mark in exactly this space, and the
codebase is `@orbit/*` down to storage keys, `ORBIT_JWT_SECRET`, the `.orbit` CSS
scope and the bundle id. Don't re-open it.

Source-of-truth docs: [docs/roadmap.md](docs/roadmap.md),
[docs/architecture-v2.md](docs/architecture-v2.md),
[docs/feature-status.md](docs/feature-status.md) (audit, 2026-07-26),
[AGENTS.md](AGENTS.md) (repo conventions).

## Repo shape

pnpm + Turbo TypeScript monorepo, Node >= 20, pnpm 10.29.2.

**Four top-level directories, split by what a thing IS** (2026-08-08): `packages/`
is the SDK, `services/` is what gets deployed, `apps/` is the shipped products,
`examples/` is small demos. `apps/render-service` became `services/render` and the
four demos moved to `examples/` in the same change — the container's build context
is still the repo root, so nothing about the Dockerfile's depth changed.

| Path | Role |
|---|---|
| `services/render` | Express service: `/v1/upload`, `/v1/render`, AI gen endpoints, auth, billing. |
| `apps/web` | **The web product.** Next 14 / React 18. Image editor + AI studio + video editor. |
| `examples/studio`, `examples/demo`, `examples/demo-next`, `examples/webview-host` | Small demos, one idea each. Not products. |
| `examples/mobile` | An Expo example: AI studio, timeline, export. Standalone npm, not in the workspace. |
| `packages/video` | **Canonical video engine** — ffmpeg arg builder + `renderProject`, effect math. |
| `packages/video-gen`, `packages/video-ai` | AI providers (ElevenLabs TTS, image/video gen). |
| `packages/model` / `render` / `providers` / `editor` | v2 web SDK: Valtio doc model → react-konva renderer → provider registry → React UI. |
| `packages/core`, `react`, `next`, `ui`, `shared`, `assets`, `effects`, `agentic` | v1 web SDK (legacy, still building). |

## Hard rules (violating these breaks things)

1. **Every effect is rendered twice and the two must agree.** A change to a
   filter, transition, blur, motion or mask lands in BOTH the preview and the
   ffmpeg export, with a test parsing the real filtergraph. A broken agreement
   test stops the line.
2. **Measure ffmpeg; do not reason about it.** Probe the filter with known RGB
   bytes and read the output. That method has caught several shipping bugs that
   looked obviously correct on paper.
3. **Never import the default `@orbit/video` entry from a browser bundle.** Use
   `@orbit/video/browser` (pure) or `@orbit/video/node` (ffmpeg, resvg, fs).
   `browser-safety.test.ts` walks the import graph and fails on a `node:` builtin.
4. **Any Expo app in `examples/` installs with npm, never pnpm** — pnpm's symlinked
   store corrupts Metro's module resolution. That is why `examples/mobile` is
   outside the workspace.

**The mobile editor's rules moved with it** to `~/Github/orbit-mobile/CLAUDE.md`:
the vendored-model discipline, the parity tests, Vela, VIcon, the simulator
verification workflow. If you are changing `@orbit/video` in a way that touches an
effect that app mirrors, that file names the mirrors.

## The web app (`apps/web`)

Next 14 App Router. **One editor** over the v2 SDK plus a browser video engine.

- **`/design/[id]` is the only editor.** `/image/[id]` and `/video/[id]` are `redirect()`
  stubs so old links still open. The shell is a four-column CSS grid — rail · panel ·
  canvas · inspector — with a full-width strip beneath. **Every cell names its own
  `grid-column`**: the panel is conditionally rendered, and with auto-placement its absence
  slides the canvas into the panel's `auto` track and the inspector into the canvas's `1fr`,
  leaving a dead gulf on the right.
- **Two document kinds, one shell.** `OrbitDocument` and `VideoProject` stay separate —
  merging them would mean rewriting the ffmpeg arg builder and re-proving dual-render.
  `DesignClient` branches into `StillDesign` / `MotionDesign` because each owns a different
  set of hooks; one component with conditionals would call hooks conditionally.
- **The still surface does NOT mount `<OrbitEditor>`.** It renders `Workspace` plus the
  SDK's section `Panel`s inside its own chrome, wrapped in
  `<div className="orbit orbitEmbedded">` — `.orbit` scopes the ~30 `--o-*` variables AND
  the `.o-*` class rules both the panels and the Konva selection chrome depend on, and
  `orbitEmbedded` undoes its `position: absolute` so the grid survives.
- **The timeline is a single sticky-scrolled grid.** Visual tracks render in REVERSE array
  order (array order is z-order, so the last track belongs at the top on screen); caption
  lanes sit above everything because overlays composite last. `useClipDrag` handles move,
  trim and cross-lane in one gesture and commits **once on pointerup** — per-pointermove
  would push sixty history entries per drag.
- **`removeClip` and `applyToClip` deliberately do not re-pack the track.** Packing lays a
  track end-to-end from zero, which destroys every deliberate gap once clips can be dragged.
  Closing a hole is a separate, explicitly-chosen edit: `rippleDeleteClip`, and it ripples
  ONLY the clip's own track so captions and music stay where they were put.
- **Local-effect geometry is shared, not reimplemented.** `regionBoxPx`, `mosaicStepPx`,
  `mosaicBlurSigma`, `magnifierCropPx` and `ROUNDED_R` live in `packages/video/src/layout.ts`
  and are called by BOTH `ffmpeg.ts` and `compose.ts`, so a mosaic or lens lands on the same
  pixels in preview and export. `scratch()` in `compose.ts` is namespaced for the same
  reason a mosaic must not be handed the canvas it is reading from.
- Stickers are image clips on an overlay track with a normalized `rect`, so they are
  dual-rendered for free. House marks are authored as SVG and **rasterized to PNG before
  storage** — ffmpeg cannot read SVG.
- The transition **picker** offers exactly what BOTH previews render — Cut, Fade,
  Wipe×4, Slide×4, Push×4, Reveal×4 — from `previewableTransitions()`, which reads the
  same tables `xfadeStateAt` reads, so it grows when the renderer does and not a commit
  before. Transitions are on the first visual track only. The engine under it is `xfade`
  — see the transitions section below.

- **Versions are pinned exactly** — `next 14.2.35` / `react 18.3.1`. Every v2 package peers
  React 18 and `react-konva@18.2.x` is the React-18 line; two React copies is a hard crash
  in Konva's reconciler. Do not bump without migrating `packages/{editor,render}` and
  `react-konva` together.
- **Never alias `react`/`react-dom` in `next.config.mjs`.** Next resolves them through export
  conditions (the server needs the `react-server` build with `React.cache`); an alias bypasses
  the exports map and hydration dies leaving an EMPTY DOCUMENT. Only konva/react-konva/valtio
  are deduped, client-bundle only. `canvas: false` stubs Konva's native Node build.
- **`next dev` and `next build` use different output dirs** (`NEXT_DIST_DIR=.next-dev`).
  Sharing one made `pnpm build` corrupt a running dev server into blank pages.
- **Browser video engine** (`src/video/engine/`): canvas 2D, one rAF loop on a project clock,
  `<video>` elements as decoders, WebAudio for sound. It **computes nothing** — `frameStateAt`
  in `@orbit/video` returns a `DrawOp[]` and the compositor executes it. Each clip is drawn
  into a **scratch canvas** first, because `ctx.filter` and `globalCompositeOperation` apply to
  the whole canvas, not the clip rect. Grades use an SVG `feColorMatrix`, not CSS
  `brightness()`, because ffmpeg's `eq=brightness` ADDS and CSS multiplies.
- **The grade's exactness, measured (2026-07-28).** ffmpeg's filters were probed with
  known RGB bytes rather than reasoned about, and two things came out of it.
  `colortemperature` is a plain **per-channel gain** (ported as `temperatureGains`,
  ffmpeg's `kelvin2rgb`), so it folds into the same matrix and is EXACT — it used to be
  dropped entirely, which made Warm and Cool preview nearly identically. `eq` is NOT
  exact: it works on YUV planes in limited range, so everything uses **BT.601**
  coefficients, not Rec.709 (709 put `mono` 39/255 off; 601 puts it 3 off).
- **`eq` is modelled where it actually runs, on the YUV planes** (`gradeMatrix` in
  `packages/video/src/filters.ts`, 2026-07-28). Contrast and brightness go over luma,
  saturation over chroma, and because every step either side is affine the whole chain
  collapses into ONE 4×5 colour matrix — which is what both previews apply (web as an SVG
  `feColorMatrix`, mobile as Skia `<ColorMatrix>`; mobile mirrors the function because it
  cannot import the package). It replaced per-channel RGB contrast/saturation, which
  agreed on mid-tones and diverged badly on saturated colour.
- **How far off, measured against a real MP4 (2026-07-28).** Flat-colour clips rendered by
  `frameStateAt` + `renderFrame`, exported through `/v1/render`, frames pulled back with
  ffmpeg and probed at the same timestamps. Ungraded clips and the fade-through-black
  transition agree to **≤2/255** — timing, alpha ramp and geometry are effectively exact.
  The grade now lands **≤6/255 for every preset except `vivid`, which reaches 10** on
  saturated colour; before `gradeMatrix` the same sweep was as bad as **25** (film on a
  saturated red). What is left is a systematic ~2–3% and it is not worth chasing: we are
  handed the decoder's 8-bit RGB and have to reconstruct the chroma ffmpeg graded, so a
  rounding step comes back multiplied by the saturation and again by the chroma→blue gain.
  Assumes BT.601 limited range; nothing in either preview can see the stream's tagging.
  Do not re-assert that the grade is byte-identical; it is not.
- **Chroma key runs in a WebGL fragment shader** (`engine/cutout.ts`), not `getImageData` —
  a full-frame clip is 2M pixels and a JS loop drops the preview under 30fps. It mirrors
  ffmpeg `colorkey` (`alpha = clamp((diff − similarity)/blend)`, `diff = √(Σd²/3)`, RGB
  untouched, no despill), verified byte-for-byte. The control hides itself where WebGL is
  missing rather than offering an effect the preview would skip.
- **Dual-render is enforced by tests, not comments**:
  `packages/video/src/__tests__/dual-render.test.ts` parses the real filtergraph out of
  `buildFFmpegArgs` and asserts it agrees with `frameStateAt`; `browser-safety.test.ts` walks
  the `browser.ts` import graph for `node:`/`@resvg`. Both were mutation-tested.
- **Media**: projects store `orbit-media:<id>` (IndexedDB blob), swapped to `upload:<token>`
  at export. Tokens are NOT durable (the service evicts oldest-first), so a failed render
  clears them and re-uploads.
- **`/api/orbit/*` proxies only the credit-metered endpoints** so the account id lives in an
  httpOnly cookie. Upload and render go direct — they are too long/large for a function.
- Design system "The Instrument" — see `src/styles/tokens.css` and `src/brand/Plate.tsx`.
  Warm graphite, one clay accent for LIVE state only, Gambarino (Fontshare) + system-ui.
  Deliberately NOT mobile's Vela.
- **Home's signature is "the bench"** (2026-07-28) — the six start formats drawn to ONE
  scale (`--bench-h` against a 1920 long edge, in `Home.module.css`) standing on one rule,
  so the row is a true proportion chart rather than six equal tiles. The proportions travel
  from JS as `--fw`/`--fh` and the scale stays in CSS, so a breakpoint shrinks frames and
  rule together. Below 680px it becomes a grid of three — NOT `flex-wrap`, which stranded a
  sixth frame on its own row — and the shared rule is dropped, since it would run under the
  first line only.
- **Light is the DEFAULT theme** (added 2026-07-28). The light palette sits on bare
  `:root`; dark is `:root[data-theme='dark']`, opt-in and stored, applied before paint
  by a script in `layout.tsx`. Not a `prefers-color-scheme` media query — light is the
  product's default, not merely what a light-set OS gets. The light surface is a **warm
  stone at hue ~20**, pulled toward the clay accent: NOT the cool UI-kit gray and NOT
  cream, both of which the design law names. `color-scheme` is declared in CSS, never
  written onto `<html>` (an inline style the server didn't render warns at hydration).
  Anything constant across themes — a dark scrim over a photograph and its text — uses
  `--w-scrim`/`--w-on-scrim`, which do not flip.
- **The SDK skin must match the theme selectors explicitly.** `@orbit/editor` ships a
  `.orbit[data-theme='light']` block re-declaring ~25 `--o-*` vars, which outranks a
  plain `.orbit`. `orbit-editor-skin.css` therefore declares on
  `.orbit, .orbit[data-theme='light'], .orbit[data-theme='dark']` — drop that and the
  embedded editor silently reverts to the stock palette in light mode.
- **Never import a value into a server component from a `'use client'` module.** It
  arrives as a client reference proxy, not the value. `THEME_KEY` did, and
  `JSON.stringify` inlined `{}` into the pre-paint script, so the stored theme never
  came back — with no error anywhere. Shared constants live in plain modules
  (`store/themeKey.ts`).
- **Security headers ship from `next.config.mjs`** (2026-07-29) — CSP, nosniff,
  frame-ancestors, Referrer-Policy, Permissions-Policy. `script-src` keeps
  `'unsafe-inline'` deliberately: Next's per-route inline scripts can't be hashed and
  the strict form needs a middleware nonce that makes every page dynamic — not worth it
  while no attacker-controlled HTML can reach the DOM (all three
  `dangerouslySetInnerHTML` sites render static module constants). **`'unsafe-eval'` is
  added in DEV only, and you must not remove it**: without it `next dev`'s eval-based
  chunks are blocked, the server-rendered HTML still arrives so the page LOOKS fine, but
  React never hydrates — no effect runs, no data loads, and the editor sits on an empty
  frame forever. Debugged the hard way once already.
- **`db()` handles `blocked`/`blocking`/`terminated`, and must keep doing so.** Every
  screen awaits that one promise, so a blocked upgrade (two tabs, a deploy that bumps
  `DB_VERSION`) meant they ALL sat in their loading state with no error and no timeout.
  `blocking` makes the old connection step aside; `blocked` rejects with something
  actionable. It also must not cache a rejected promise — that turned one transient
  failure into a permanently dead database for the life of the page.

`packages/video` now has subpath exports: `@orbit/video/browser` (pure, browser-safe) and
`@orbit/video` (adds ffmpeg/resvg/fs). Never import the default entry from a web bundle.

**Hand-built SVG is an injection surface** (2026-07-29). A `VideoProject` arrives as JSON
and is cast, never validated, so every field TypeScript calls a `number` is whatever the
caller sent. `font-size="${o.fontSize}"` carrying `48" /><image href="…">` made resvg read
a file off local disk into the frame — another account's upload came back as render
output. So in `packages/video`: strings go through `esc`, numbers through `num`, **colours
and font families through `col`/`fontFamily`** — and that last part is the subtle one,
because `esc` is an XML transform the parser UNDOES, so `url('/etc/passwd')` looks escaped
and decodes back to a live reference. `rasterizeSVG` then refuses any SVG containing
`<image>`/`<use>`/`<script>`/`<foreignObject>`, since nothing we build emits those.
Never interpolate a raw value into markup here.

## Web SDK commands

```bash
pnpm install && pnpm build      # turbo
pnpm test                       # vitest, tests in src/__tests__/*.test.ts
pnpm typecheck
pnpm --filter @orbit/studio dev # v2 demo
```

## Known gaps / deliberate non-features

- **Not production-ready**, but most of the blockers closed 2026-07-28/29:
  - **Storage has a seam** — `services/render/src/storage.ts`. Local disk (serve
    from `/files`) is still the default; set `ORBIT_S3_BUCKET` + keys and BOTH uploads and
    rendered output go to any S3-compatible bucket instead. SigV4 is hand-rolled (no 2MB
    AWS SDK for one PUT) and pinned to AWS's own published example in `storage.test.ts`.
    A HALF-set config throws rather than falling back to disk. The media dir stays a
    byte-budgeted cache; `ensureLocal` fetches an evicted upload back before a render, so
    eviction stopped being data loss. Output urls are **presigned GETs** (6h) unless
    `ORBIT_S3_PUBLIC_BASE` is set — a private bucket otherwise handed the client 343 bytes
    of AccessDenied XML with a `.mp4` name on it. Outputs are evicted too
    (`ORBIT_MAX_OUTPUT_BYTES`); the directory previously grew until the volume filled.
  - **Renders can be jobs** — `POST /v1/render {async:true}` → 202 `{id}`, poll
    `GET /v1/render/:id`. Both clients use it and fall back if the server answers with a
    url outright. The synchronous path is unchanged for older clients. In-process
    (`jobs.ts`) by default, where `status` goes `queued`→`running` only when a render SLOT
    is actually held, so waiting behind the semaphore is distinguishable from encoding.
  - **The queue can be shared** (`job-queue.ts`) — with `DATABASE_URL` **and** non-local
    storage, jobs go in a Postgres table and every instance is also a worker
    (`ORBIT_WORKER=0` opts out), so adding a machine adds capacity. `FOR UPDATE SKIP
    LOCKED` is what stops two workers rendering (and charging for) the same job; a claim
    heartbeats, so a worker killed mid-encode has its job re-offered rather than stranding
    it in `running`. It **refuses to enable on local disk** and names the missing half:
    a worker would be handed an upload token naming a file only the receiving box has.
    Polling, not LISTEN/NOTIFY — a notification is lost if nobody is listening at that
    instant. Tested against a real Postgres; the suite skips without
    `ORBIT_TEST_DATABASE_URL` rather than passing on a stub.
  - **Operated through `scripts/orbit-render`** — `caps` (what the box's ffmpeg can do,
    as a verdict rather than a dump), `health`, `deploy` (pull, rebuild, wait, print the
    build that answered), `verify`, `logs`, `sh`. It resolves the compose file from its
    OWN path, through symlinks, so it works from anywhere: `docker compose -f
    services/render/compose.vps.yaml …` is relative and failed twice for exactly that
    reason. `caps` excludes `custom` from its count for the same reason
    `parseXfadeTokens` does, so it cannot disagree with `/health` by one. Symlink it into
    `/usr/local/bin` on the box and the path prefix goes too.
  - **Deployable** — `Dockerfile` + `compose.yaml` (Postgres + MinIO). Built from the repo
    root because it is a pnpm workspace. Note `Dockerfile.dockerignore`: Docker reads
    `<context>/.dockerignore` and the context is the repo root, so a `.dockerignore` inside
    `services/render/` is silently ignored and `.env` lands in the image.
    `pnpm prune --prod` does NOT work here — it strips the per-package `node_modules` a
    workspace resolves through; install with `--prod --filter` a second time instead.
  - **Shutdown is a real shutdown** (2026-07-29) — `main.ts` owns SIGTERM/SIGINT and
    ACTUALLY EXITS. Installing a listener REPLACES Node's default terminate, so the old
    handler (which only set `stopping = true`, inside the queue block) left the process
    alive until Docker's grace period ran out and SIGKILLed it — stranding whatever was
    mid-encode in `running`, owned by a worker that no longer existed, until the 15-minute
    stale sweep. Now a worker hands its claim back (`PgJobQueue.release`) and
    `killLiveRenders()` stops the encoders, because a signal reaches the SERVICE, not its
    children: ffmpeg is a separate process and survives its parent outside a container.
    `heartbeat`/`finish`/`fail` are all guarded on `claimed_by`, so a superseded worker
    cannot reach back into a job that now belongs to someone else — which is also what
    makes the shutdown ordering safe (release, then kill; the resulting `fail` no-ops).
  - **Observability** — one JSON line per request (no bodies/query: they carry upload
    tokens), and `/health` reports storage kind, queue mode, `renders.{running,queued,
    capacity}`, cluster depth when shared, and job count. `ok` stays true while merely
    busy, so a load balancer will not pull the box that is doing the work.
  - **Cloud project sync** (2026-07-29) — `projects` table + `/v1/projects` CRUD under the
    same JWT. DOCUMENTS ONLY: media travels as the `upload:` tokens a project already
    carries, so a sync is kilobytes not megabytes, and `mediaDurable` is reported because
    on local disk an evicted upload is really gone. Guests are refused (403 `kind:guest`)
    — no password means the identity dies with the app's storage. Conflicts are LWW by the
    client's `updatedAt`, resolved inside one `INSERT … ON CONFLICT … WHERE` so there is no
    read-then-write window, and a stale write gets 409 WITH THE WINNER so the client keeps
    both rather than dropping the edit. Deletes are tombstones; an absent row is
    indistinguishable from one a device has never synced. Both clients reconcile with the
    SAME rules — divergent clients against one server is a data-loss bug waiting to happen.
    **Three rules the first pass got wrong** (fixed 2026-07-29, regression-tested in
    orbit-mobile's `src/net/__tests__/syncClient.test.ts` against a fake server reproducing
    the store's LWW semantics; each fix mutation-checked):
      1. **Never push back what the pull just wrote.** `since` is still the OLD watermark
         while the push runs, so a freshly-pulled project looked like a local edit and went
         up at the exact timestamp it came down with. The server refuses an equal timestamp
         — correctly, for two real writers — the client read 409 as "both sides changed",
         and a first sync duplicated EVERY project, compounding into names like
         `Video (this browser) (this browser)`.
      2. **A pulled project keeps the SERVER'S `updatedAt`.** Web's `saveProject` stamped
         `Date.now()` unconditionally, so the copy just pulled looked newer than the one it
         came from and bounced back — two devices trading one unchanged document forever.
         Mobile already preserved it; that divergence is what this note warns about.
      3. **A pull must not overwrite a local edit.** It did, silently, and it ran BEFORE
         the push-side 409 handler written to prevent exactly that, so "keep both" was
         nearly unreachable. `local.updatedAt > since` is what "edited here since the last
         successful sync" means, and it is the only signal that the copy about to be
         replaced is not merely an older download.
    **The copies it already made** are cleaned up from Account → Sync
    (`apps/web/src/db/duplicates.ts`). The rule is narrow on purpose, because being wrong
    deletes someone's work: a project goes only when it carries the machine suffix AND is
    byte-identical to a survivor AND their base names match. Content alone is too loose —
    three projects from one preset are identical while being three different things, and
    their names are all that separate them. The fingerprint sorts keys at every level,
    since a round-tripped project came back from `jsonb` with its key order changed and a
    plain `JSON.stringify` comparison would clean up nothing.
    **A failed delete is remembered and retried** before the next listing, on both clients.
    `syncDelete` used to catch only a THROWN error, so a 500 or an expired session answered
    it successfully; and an absent tombstone is indistinguishable from a project the server
    was never told about, so the next full pull handed it straight back.
  - **Password reset is a link to a page the SERVICE serves** (2026-08-03). Register and
    login were always fine; reset was built, tested and unreachable — the deployed box
    answered `503 email-unconfigured`, so anyone who forgot a password lost their account
    and its credits. Three things were wrong and only one was the missing API key.
    `compose.vps.yaml` **never forwarded the email variables at all**, so a key in `.env`
    would have changed nothing (compose passes through only what a service names); and
    once forwarded, `${EMAIL_PROVIDER:-}` passes the EMPTY STRING, which `??` does not
    fire on — `env.EMAIL_PROVIDER ?? …` resolved to `""`, missed the `resend` branch and
    returned null on a box whose `.env` plainly contained the key. Every read in
    `emailSenderFromEnv` is truthiness now, for exactly the reason the byte budgets are.
    The delivered token is a **~300-character JWT**, so "paste this code in the app" was
    never really usable: mail clients hard-wrap it and what comes back off the clipboard
    no longer verifies. So the service serves `GET /reset` itself (`src/reset-page.ts`) —
    a deep link needs a URL scheme the app does not have, and `apps/web` is not deployed,
    while the API is already on HTTPS and is the one origin that can hold the form AND
    answer it. Five things about it are deliberate:
      - **The token is never interpolated into the markup.** It is read client-side out of
        `location.search`, which makes the response a CONSTANT — `RESET_PAGE_HTML` is a
        plain `const`, not a function, so nobody can pass it the token later. Same rule as
        the SVG builder, same reason.
      - **`Referrer-Policy: no-referrer` and `connect-src 'self'`.** The token rides in the
        URL, so any outbound request would carry it in `Referer`; the CSP means even an
        injected script could not post it off-origin. Plus `frame-ancestors 'none'` — a
        reset form is a clickjacking target. `replaceState` strips the token from the
        address bar so it stays out of history and out of anything the user copies.
      - **The reset link's base is STATED (`ORBIT_PUBLIC_URL`), never derived from the
        request.** Building it from the `Host` header is the classic reset-poisoning hole:
        POST to `/v1/auth/forgot` with a `Host` of your choosing and a VALID token is
        mailed to someone else's user, aimed at your box.
      - **A send failure never reaches the caller.** It used to 500, which was an
        enumeration oracle — a send is only ATTEMPTED when the account exists, so 500 vs
        200 named the registered addresses and defeated the identical-response rule
        directly above it. It logs `reset-email-failed` and answers 200.
      - **`/v1/auth/forgot` returns `delivery: 'link' | 'code'`**, and both clients read it.
        That is a property of the SERVER, not of the account, so saying it leaks nothing —
        and without it the app sent everyone to a paste-a-code screen after mailing a
        link, which is a working flow that reads as broken. A server predating this omits
        the field and only ever mailed the token, so absent means `code`.
  - Still open: purchase config, social login. Both are credential-dependent, and the
    Apple/Google buttons in `AuthSheet` are still dead controls that answer "coming soon".
- Per-clip audio: the **legacy concat path drops it** (`buildFFmpegArgs` concats with `a=0`,
  `ffmpeg.ts:254`) — only a lone clip's original audio plus `project.audio` mix there. The
  **multi-track path does NOT**: `buildMultiTrackArgs` gives every visual clip's stream its
  own `atrim` → `adelay` → gain chain into the same `amix` as the audio tracks. Both web and
  mobile send `tracks`, so no current client hits the lossy path. Corrected 2026-07-28 — the
  note here read as a live gap for months and was not one.
- Genuinely not built, with reasons: **speed ramping** (ffmpeg can't smoothly ramp audio
  tempo, no faithful preview — constant per-clip speed IS shipped), **keyframe
  scale/rotation** (scale can't animate per-frame in ffmpeg).
- **Captions export as `.srt`** (2026-07-29) — `packages/video/src/srt.ts`, mirrored into
  orbit-mobile's `src/model/editor-ops.ts` with `__tests__/srt.test.ts` comparing the two
  OUTPUTS. EVERY text overlay travels, not just the `caption-` prefixed ones: the prefix is
  bookkeeping so a re-transcription knows what it may replace, not a category anyone chose.
  Cues are sorted by TIME (overlays are stored in layer order, which runs backwards), blank
  lines inside text are collapsed (a blank line is what ENDS a cue in SRT — one would shift
  every caption after it), and the timestamp rounds once in integer milliseconds because
  rounding the parts separately prints `00:00:60,000`. Overlaps are left alone: SRT permits
  them and silently retiming someone's captions is worse than a player stacking two lines.
- Story and some editor preferences are incomplete.

## The repo split (mobile done 2026-08-08; publishing next)

**Orbit is the SDK repo.** The mobile editor left on 2026-08-08 and Shortspilot
will follow. What stays is packages, the render service, the web app and examples.

### What already happened

`apps/mobile` was extracted with `git subtree split` — all 182 of its commits —
into `~/Github/orbit-mobile`, then **purged from this repo's history** with
`git filter-repo --path apps/mobile --invert-paths`. That was deliberate and it
was the right moment: the repo had never been public, so no clone or fork existed
to break, and the alternative (deleting from HEAD only) would have left the whole
app recoverable by anyone with `git log` the instant the repo opened.

A backup of the pre-purge repo, all refs, is at
`~/Github/orbit-backup-before-mobile-purge.bundle`. Keep it until publishing is
done.

### The cost, measured rather than predicted

**The move happened BEFORE publishing, which is the order this file previously
argued against.** That was the user's call, made knowingly, and the price is real
and now quantified: `orbit-mobile` runs **275 of 309 tests green, with 34 failing
in 12 files** — precisely the parity tests that reached
`../../../../../packages/video/src/…` to prove the vendored mirrors still match
the engine.

So **the dual-render invariant is currently unenforced on the mobile side.** A
change to an effect here can silently diverge from that app's preview, and nothing
will say so. That is a live risk with a known fix, not a mystery:

**When `@orbit/video` is published, re-point those 12 files at
`@orbit/video/browser` in orbit-mobile.** It is the first thing publishing
unblocks, and it should happen the same day.

### Still to do

1. **Publish `@orbit/*`** — `private: true` audit (18 of 20 manifests still have no
   flag), versions aligned, `publishConfig`, React 19 peers checked rather than
   claimed, `npm pack` installed into a scratch Vite app and a scratch Next app.
2. **Restore orbit-mobile's 12 parity tests** against the published package.
3. **Beta-open this repo.**
4. **Shortspilot as its own repo**, consuming published `@orbit/*` like any other
   customer. This REVERSES `shortspilot-build-plan.md` §2, which recommends
   in-monorepo — soundly, because that recommendation rested on "every `@orbit/*`
   package is private and unpublished" and publishing removes its premise. Do not
   re-litigate §2 without noticing that.
5. Then multiple products on one published SDK, which is the actual goal.

**What this makes non-negotiable:** a breaking change to `@orbit/video` is now a
release, not a refactor. Semver starts mattering at step 3, not when someone
complains.

## Working style

- Commits: short imperative subjects with a scope, e.g. `mobile: refine AI studio UI`,
  `fix(editor): …`.
- The user hits usage limits fast — be efficient: don't re-read what's already established,
  don't narrate options, act once you have enough to act.
