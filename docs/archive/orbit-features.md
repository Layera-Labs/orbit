> **ARCHIVED — a snapshot, not current status.**
>
> A twenty-item engine audit written against `5f7adc2`. It moved here from the
> Shortspilot planning folder because it audits THIS engine and belongs with it.
>
> Much of it is now closed: shape overlays draw in all three renderers (`7bc1018`),
> word timings render (`f07c1c4`), the render returns a poster frame (`c39bd2d`),
> the ledger holds credits (`20914d0`), the generation queue exists (`a303197`),
> and `beta.4` closed the export gaps it could not have known about.
>
> The method — every claim carrying its file and line — is why it was worth
> keeping.

# Orbit SDK — gaps, defects and wanted features

*What Shortspilot needs from `@orbit/*` that isn't there yet, and what I'd fix
regardless. Every item is grounded in code read on branch `staging`, with the
evidence linked. Nothing here is speculation about what Orbit "probably" does.*

**Verified against `5f7adc2`, working tree clean.** The first edition of this
document was written against `1037150`. Fourteen commits have landed since, and
they close five of the twenty items outright and move three more. The table
below is the re-verified state, not the original one.

Companion to [shortspilot-build-plan.md](shortspilot-build-plan.md). Move this
to `orbit/docs/` if you'd rather it live with the engine.

**Legend** — Severity: 🔴 blocks a Shortspilot phase · 🟠 will bite in production ·
🟡 quality / margin. Effort: S ≤1 day · M ≤1 week · L >1 week.
Status: ✅ closed · ◐ partially closed · ○ open.

---

## Summary

| # | Issue | Sev | Eff | Status | Blocks |
|---|---|:--:|:--:|:--:|---|
| [1](#1) | `ShapeOverlay` is declared but nothing draws it | 🔴 | M | ◐ | Chat bubbles, quiz cards, scrims |
| [2](#2) | Text is measured at a flat 0.58em/char | — | — | ✅ | — |
| [3](#3) | No automatic text wrapping | — | — | ✅ | — |
| [4](#4) | Word timings reach the timeline but nothing renders them | 🔴 | M | ◐ | The signature short-form look |
| [5](#5) | No thumbnail / poster frame from a render | 🔴 | S | ○ | Library, publish covers |
| [6](#6) | `Ledger` has no reserve/settle — debit only | 🔴 | S | ○ | Batch, multi-step jobs |
| [7](#7) | The queue runs renders, not pipelines | 🔴 | M | ○ | The whole generation pipeline |
| [8](#8) | Projects have no version history | 🟠 | M | ○ | Re-render, audit, undo |
| [9](#9) | The SSE client exists; no server serves it | 🟠 | S | ◐ | Batch UX |
| [10](#10) | Render is billed as a flat constant | 🟠 | S | ○ | Margin on long-form |
| [11](#11) | Observability is `console.log` | 🟠 | M | ○ | Operating it at all |
| [12](#12) | Generation endpoints have no rate limit | 🟠 | S | ○ | Provider spend spikes |
| [13](#13) | Schema is `CREATE TABLE IF NOT EXISTS`, no migration tool | 🟠 | M | ○ | Every future schema change |
| [14](#14) | Fonts are downloaded from Google at render time | — | — | ✅ | — |
| [15](#15) | TTS audio travels as a base64 data URI | 🟡 | S | ○ | Long narration, batch |
| [16](#16) | Stock video exists as a panel, not as a resolver | 🔴 | S | ◐ | Phase 1 visuals |
| [17](#17) | `renderProject()` returns a path and nothing else | 🟡 | S | ◐ | Billing, UI, publish |
| [18](#18) | ffmpeg capability differences aren't exposed | — | — | ✅ | — |
| [19](#19) | No segment rendering | 🟡 | L | ○ | Long-form |
| [20](#20) | Three templates, none of them a viral format | 🔴 | L | ○ | The moat |

**Twelve open, three partial, five closed.** The five closures are real work, not
relabelling: real font metrics, real wrapping, a real overlay union with a working
image kind, real font-resolution ordering, and a real capabilities probe on
`/health`.

---

## What changed since `1037150`

Five commits carry almost all of it:

| Commit | What it closed |
|---|---|
| `6b5a404` video: make the overlay list a union, and make every renderer say what it draws | Most of [#1](#1) |
| `feea58c` video: put a sticker on the overlay stack instead of a track of its own | The rest of the image half of [#1](#1) |
| `8215ef0` video: give a caption one answer about where its lines break | [#3](#3) |
| `7dd5893` video: draw captions in the font the export uses | [#2](#2) and [#14](#14) |
| `880c00a` video: make renderProject report something the caller did not already know | Most of [#17](#17) |
| `5f7adc2` video: keep the words a transcript was grouped from | The data half of [#4](#4) |

The pattern worth noticing: every one of these landed on both sides of the
dual-render invariant, with a test asserting agreement (`overlay-union.test.ts`,
`image-overlay.test.ts`, `text-wrap.test.ts`, `font-metrics.test.ts`,
`caption-words.test.ts`, `render-result.test.ts`). That is the codebase behaving
exactly as the first edition of this document predicted it would: slower per
change, and correct.

---

## A. Still blocks the format library

<a id="1"></a>
### 1. 🔴 M — ◐ `ShapeOverlay` is declared but nothing draws it

The union landed:

```ts
// packages/video/src/types.ts:218
export type Overlay = TextOverlay | ImageOverlay | ShapeOverlay;
```

`ImageOverlay` is **fully wired** and well done. It goes down the clip path in
both renderers rather than getting a second copy of the placement arithmetic:
`imageOverlayAsClip` ([overlay-clip.ts:69](../orbit/packages/video/src/overlay-clip.ts#L69))
turns it into the `VisualTrackClip` that the preview
([frame.ts:380](../orbit/packages/video/src/frame.ts#L380)) and the export
([ffmpeg.ts:1258](../orbit/packages/video/src/ffmpeg.ts#L1258)) already agree on.
**Brand logo watermarks work today.** That was a named casualty in the first
edition and it is fixed.

`ShapeOverlay` is the remaining hole, and it is a hole in all three renderers:

```ts
// packages/video/src/frame.ts:366   (preview)
if (o.type !== 'text' && o.type !== 'image') continue;

// packages/video/src/render.ts:376  (rasterizer)
if (overlay.type !== 'text') continue;

// packages/video/src/ffmpeg.ts:1254 (export)
.filter((o) => (o.type === "text" && capIdx.has(o.id)) || o.type === "image")
```

The skip is deliberate and documented in both places, and the reasoning is right:
handing a shape to `overlayToSVG` would read a `text` that isn't there and paint
an empty caption box across the frame. A missing picture beats a wrong one. But
the type promises something the engine cannot deliver, which is its own trap: a
format author will write a shape, see nothing, and have no error to read.

**What it still blocks:** fake-text/chat bubbles, quiz and title cards, countdown
and progress indicators, caption scrims, lower-third plates. Three of the five
viral archetypes.

**Fix:** teach `overlayToSVG` to emit `<rect rx>` / `<ellipse>` for a
`ShapeOverlay`, rasterize it in `render.ts` alongside text, admit it to the
`drawableOverlays` filter, and draw it in `frame.ts`. The geometry is already
defined and already matches `ImageOverlay` exactly, so the placement rules are
settled. Extend `overlay-union.test.ts`, which exists precisely to catch a
renderer that disagrees about what it draws. Effort is down from L to M because
the union, the geometry and the test harness are all in place.

<a id="4"></a>
### 4. 🔴 M — ◐ Word timings reach the timeline; nothing renders them

The data now survives to compose time:

```ts
// packages/video/src/types.ts:132
words?: WordTiming[];
```

And it is handled with care: the timings are stored in **absolute timeline
seconds**, not offsets into the transcribed audio, because `setAutoCaptions` is
the one place that knows where the clip sits. `captionWordsValid`
([captions.ts:53](../orbit/packages/video/src/captions.ts#L53)) exists so a
consumer can tell a live transcript from one left stale by a retyped caption,
on the correct reasoning that a stale array is worse than an absent one.

The remaining half is stated in the type's own doc comment:

```
// packages/video/src/types.ts:105
* again. Nothing RENDERS a word timing today — this is the data a word-level
* effect (a karaoke highlight, a word-by-word reveal) would need, landed
* separately from the effect so the effect does not also have to invent a
* transcript format.
```

That is a good decision about sequencing, and it means the effect is now a
self-contained piece of work with its inputs already guaranteed. The karaoke
caption is still *the* visual signature of faceless short-form, and Orbit still
cannot draw one.

**Fix:** an active-word style on `TextOverlay` (a colour, a scale, a highlight
box), resolved per frame from `words` in `frame.ts` and baked per caption line in
the rasterizer. The tricky part is the export: a highlight that moves within a
line means the caption PNG is no longer static, so either rasterize one PNG per
word window and drive them with `enable=between(t,…)`, or accept N overlays per
line. The first keeps the overlay count flat and is the one worth building. #2
supplies the metrics that position the highlight, and #2 is now done, so this is
unblocked.

<a id="20"></a>
### 20. 🔴 L — ○ Three templates, none of them a viral format

Unchanged. `TEMPLATE_LIST`
([templates.ts:158](../orbit/packages/video/src/templates.ts#L158)) is still
exactly `caption-reel`, `lyric-video`, `quote-card`. There is no
`packages/formats` and no `packages/pipeline`. `packages/video-ai/src/agent.ts`
is still 86 lines.

The *shape* remains right and worth keeping: pure `Input → VideoProject`
functions. It's the library that's empty.

**What is now unblocked:** split-screen needed no engine work before and still
doesn't. **Reddit/story** is now fully buildable, because it wants a title card,
B-roll, voice and captions, and the only thing it was waiting on (text that wraps
and measures correctly) has landed. Listicle needs shapes for its progress
indicator. Fake-text and quiz need shapes. So the sequencing is: story and
split-screen now, the other three behind [#1](#1).

---

## B. Still blocks the generation pipeline

<a id="5"></a>
### 5. 🔴 S — ○ A render produces no thumbnail

Unchanged, and re-checked repo-wide: the only matches for "thumbnail" in the
video packages are two comments about how something *looks* in one, plus an
unrelated `thumbnail` field on the design-editor's provider types
(`packages/providers`), which is a different subsystem.

`renderProject()` now returns `{path, durationSec, bytes}` ([#17](#17)), so the
result object it would hang off already exists. That makes this smaller than it
was: add `thumbnailPath` to `RenderResult` and one `-vframes 1` output at a
caller-chosen timestamp.

Still needed by the library grid, the batch dashboard, the result screen, and the
cover frame every publishing platform asks for.

<a id="6"></a>
### 6. 🔴 S — ○ The ledger cannot hold credits

Unchanged.

```ts
// packages/billing/src/ledger.ts:16
class Ledger { balance() · history() · canAfford() · credit() · debit() }
```

`meter()` ([metering.ts:20](../orbit/packages/billing/src/metering.ts#L20)) is
still a straight `debit`, so `canAfford` then `debit` remains a check-then-act
with a gap in the middle. One generation spends across five-plus provider calls;
a batch of twenty starts twenty of them.

**Fix:** `hold(account, amount) → holdId`, `settle(holdId, actual)`,
`release(holdId)`, with holds subtracted from the available balance. The
`ledger_entries` table is append-only, so a hold is a row like any other. Still
the smallest change on this page with the largest blast radius if skipped, and
now the single highest-value open item, because [#7](#7) and Phase 4's batch both
sit on top of it.

<a id="7"></a>
### 7. 🔴 M — ○ The queue runs renders, not pipelines

Unchanged. `PgJobQueue`
([job-queue.ts:43](../orbit/apps/render-service/src/job-queue.ts#L43)) still
creates exactly `render_jobs`, and it is still strictly `project JSONB → MP4`.

**Fix:** unchanged, and still the right one. Don't replace it and don't add Redis
next to it. Add a `generation_jobs` table with the same claim/heartbeat shape
plus a `step` column, and key every step by `(job_id, step)` so a retry cannot
re-charge a provider for work already paid for.

<a id="16"></a>
### 16. 🔴 S — ◐ Stock video exists as a panel, not as a resolver

Half of this closed. `PexelsProvider` now takes a mode:

```ts
// packages/assets/src/providers/pexels.ts:8
private mode: 'photos' | 'videos' = 'photos'
```

and in `videos` mode it hits `api.pexels.com/videos/search`, returns
`type: 'video'`, and resolves `item.video_files[0].link`. Same API key as the
image path, exactly as predicted.

What is still missing is the seam in front of it. `packages/assets/src/index.ts`
exports the two providers, a `types` module, and `AssetCache` — which is an
**IndexedDB** cache (`indexedDB.open('orbit-assets')`), so it is browser-only and
keyed by a caller-supplied `id`, not by content hash. There is no `resolveVisual`
anywhere in the repo.

**Fix:** a `resolveVisual(scene, mode, brand) → NormalizedAsset` seam in
`@orbit/pipeline`, with a server-side content-hash cache in front of it. The
providers underneath are ready; nothing a pipeline runs on the server can call
them yet.

---

## C. Production hardening

<a id="8"></a>
### 8. 🟠 M — ○ Projects have no version history

Unchanged. `project-store.ts` still creates one `projects` table, one row per
project, last-write-wins by the client's own timestamp, with no `project_versions`
anywhere.

The conflict handling is still thoughtful (a stale write is refused *with the
stored copy attached*), and there is still no history: you cannot re-render last
week's version, diff an AI generation against a user's edit, or recover from a
bad save that synced.

<a id="9"></a>
### 9. 🟠 S — ◐ The SSE client exists; no server serves it

This one was mis-scoped in the first edition. There **is** an SSE consumer:

```ts
// packages/core/src/video-export/job-poller.ts:2
* ExportJobPoller — Polls export job status via SSE with fallback to polling
```

It opens an `EventSource` and falls back to a `setInterval` poll, and it has
tests. What does not exist is anything serving it: `apps/render-service/src`
contains no `text/event-stream` response, and the only job routes are
`GET /v1/render/:id` ([server.ts:1331](../orbit/apps/render-service/src/server.ts#L1331))
and `GET /v1/credits`. So every client is running the fallback path.

That is a better position than "no progress push" implied, because the client
contract is already written and already tested. Effort drops from M to S.

**Fix:** one SSE endpoint per job (and later per batch), fed by the `progress`
column `PgJobQueue` already maintains, shaped to what `ExportJobPoller` already
parses.

<a id="10"></a>
### 10. 🟠 S — ○ Render is billed as a flat constant

Unchanged in the billing code:
`const RENDER_COST = envNumber("ORBIT_RENDER_COST", 0, 0)`
([server.ts:856](../orbit/apps/render-service/src/server.ts#L856)), still a single
env number, still off by default.

But the **input** to a duration-based price now exists: `RenderResult.durationSec`
and `RenderResult.bytes` come back from the render that just finished
([#17](#17)), so pricing on output duration no longer requires re-probing the
file. This got cheaper to fix without being fixed.

<a id="11"></a>
### 11. 🟠 M — ○ Observability is `console.log`

Unchanged, and slightly worse by volume: 14 `console.*` calls in `server.ts`
alone, 2 in `main.ts`, 1 in `jobs.ts`. No `pino`, no `winston`, no logger module
anywhere in `apps/render-service` or `packages/*`. No request ids, no traces, no
per-provider latency or cost metrics.

The build plan's own line — *"you will live in these dashboards"* — still has no
dashboards to live in.

<a id="12"></a>
### 12. 🟠 S — ○ Generation endpoints have no rate limit

Unchanged, and this is the cheapest open item on the page. `rateLimit(...)` guards
upload (1046), render (1083), fonts (1391), the auth routes (1598–1740) and the
billing webhook (2063). These four register with none:

```
server.ts:1772  app.post("/v1/generate-image", async (req, res) => {
server.ts:1826  app.post("/v1/generate-video", async (req, res) => {
server.ts:1900  app.post("/v1/tts",            async (req, res) => {
server.ts:1964  app.post("/v1/transcribe",     async (req, res) => {
```

Credits bound *spend*, which is the important half, but they don't bound *request
rate* against a provider that will happily rate-limit or ban the key for all your
users at once.

**Fix:** the existing `rateLimit` middleware, four lines.

<a id="13"></a>
### 13. 🟠 M — ○ Schema by `CREATE TABLE IF NOT EXISTS`, no migration tool

Unchanged. Tables are still created in-code across `job-queue.ts`, `pg-store.ts`
and `project-store.ts`, and altered by `ADD COLUMN IF NOT EXISTS`
(`job-queue.ts:66`, `job-queue.ts:76`, `pg-store.ts:159`). No migration runner in
any `package.json`.

The reasoning behind it is careful and it genuinely works for additive changes on
a handful of tables. It stops working the first time you need to backfill, change
a type, or drop something — and Shortspilot adds `generation_jobs`, `holds`,
`project_versions`, `publish_targets`, `publish_jobs`, `assets`.

**Fix:** adopt a migration runner before adding those six tables, not after. This
is a scheduling item more than an engineering one, and the window for doing it
cheaply closes the moment [#7](#7) lands.

<a id="15"></a>
### 15. 🟡 S — ○ TTS audio travels as a base64 data URI

Unchanged. `ElevenLabsProvider.tts()` still returns
`` url: `data:audio/mpeg;base64,${base64(bytes)}` ``
([elevenlabs.ts:81](../orbit/packages/video-gen/src/providers/elevenlabs.ts#L81)).

Still deliberate, still keeps the provider storage-agnostic, and still +33% bytes
held in memory as a JS string against an `express.json({ limit: "8mb" })` ceiling.
Per-scene narration is small; a single long-form pass is not.

<a id="17"></a>
### 17. 🟡 S — ◐ `renderProject()` returns more, but not everything

Mostly closed.

```ts
// packages/video/src/render.ts:39
export interface RenderResult {
  path: string;
  durationSec: number;
  bytes: number;
}
```

The two fields billing and the UI need most are there, with
`render-result.test.ts` behind them. Still absent: `width`, `height`, `fps`,
`encodeMs`. Resolution and fps matter to the publish step (platforms validate
both) and `encodeMs` is what tells you whether [#19](#19) has become urgent.

**Fix:** four more fields, all of them already known inside `renderProject` at the
moment it returns.

<a id="19"></a>
### 19. 🟡 L — ○ No segment rendering

Unchanged. One `renderProject()` call is still one monolithic encode; no
`segment` or `concat` logic in `render.ts`.

**Fix:** split the timeline at scene boundaries, render chunks in parallel across
workers, concat with stream-copy. Not needed until long-form ships. Listed so it
isn't discovered *during* long-form.

---

## D. Closed since the first edition

Kept with their evidence, because "we fixed that" is worth being able to check.

<a id="2"></a>
### 2. ✅ Text is measured from real font metrics

`packages/video/src/font-metrics.ts` is a real sfnt parser: `sfntTables`,
`readCmap`, `parseFontMetrics`, `measureLine`, `measurerFor`. `render.ts:363`
builds a `Map<family, Uint8Array>` of the actual font bytes so a caption is
measured from real advance widths, and the comment there names the exact reason
it has to be the same map the preview builds from `/v1/fonts/:family`: the
caption's background box is computed once and baked into the SVG string **both**
renderers consume, so measuring differently on the two sides would size that box
differently in the preview and the file.

`APPROX_EM_PER_CHAR = 0.58` survives as the documented fallback for a family that
could not be read, and that case is reported through `onWarning` with a
`font-missing` code rather than passing silently.

**Caveat for Shortspilot:** the fallback is still reachable. If a brand preset
names a family the render host cannot resolve, boxes will be sized by the old
guess and the warning is the only signal. Treat `font-missing` as a job failure
in the pipeline runner, not a log line.

<a id="3"></a>
### 3. ✅ Text wraps

`TextOverlay.maxWidth` ([types.ts:151](../orbit/packages/video/src/types.ts#L151))
is a wrap width in output pixels, the same units as `fontSize`, so a caption
breaks in the same place at any preview scale. `wrapLines` and `linesOf`
([font-metrics.ts:296, 342](../orbit/packages/video/src/font-metrics.ts#L296)) do
a greedy wrap through the same measurer as everything else, and both
`overlayBox` and `overlayToSVG` route through `linesOf` so there is one answer
about where a line breaks. `text-wrap.test.ts` covers it.

**Two caveats that matter to a generated pipeline, both by design:**

1. **Absent `maxWidth` means no wrapping.** Only `\n` breaks a line, which is
   what every pre-existing project did and still does. Backward compatibility,
   correctly chosen. But it means the "90-character hook renders off both edges"
   failure is still reachable — it is now *opt-out* rather than *unavoidable*.
   **Every format in `@orbit/formats` must set `maxWidth` on every text overlay
   it emits.** Make that a lint or a test in the formats package, not a
   convention.
2. **A single word longer than `maxWidth` overflows rather than being cut**
   ([font-metrics.ts:292](../orbit/packages/video/src/font-metrics.ts#L292)).
   Right call for legibility; still means an LLM emitting a long URL or a
   hashtag chain can push past the frame. Autofit `fontSize` from the returned
   line count rather than trusting the wrap alone.

<a id="14"></a>
### 14. ✅ Fonts resolve from disk before the network

`google-fonts.ts` now resolves **local directories first, disk cache second, the
network last**, and the header states the ordering is the point: a render that
can be satisfied from disk never makes a network call.

All three original defects are addressed. Both fetches have timeouts
(`ORBIT_FONT_TIMEOUT_MS`, default 5s), failure is reported through `resolveFonts`
→ `onWarning` instead of silently substituting a different face, and
`ORBIT_FONT_CACHE_DIR` points the cache at a mounted volume. `ORBIT_FONT_NETWORK=0`
turns the network off entirely, which is what a byte-reproducible render sets.

**Caveat, and it is a deployment task rather than engine work:** the *default*
cache directory is still `os.tmpdir()`, and a family that cannot be resolved
still warns rather than failing. For Shortspilot, bake the supported families
into the render image, set `ORBIT_FONT_DIR`, and set `ORBIT_FONT_NETWORK=0`. Then
the failure mode is a loud missing-font warning on a deterministic render rather
than a quiet substitution on a networked one.

<a id="18"></a>
### 18. ✅ Capabilities are exposed at `/health`

```
// apps/render-service/src/server.ts:1022
capabilities: { hdr, transitions }
```

Both probes are cached per binary, so this costs one spawn. The refusal behaviour
in `renderProject` is unchanged and should stay unchanged — a push is not a slide,
and substituting quietly would hand back a file that doesn't match the timeline
the user watched. What changed is the timing: a picker can now hide a transition
the host cannot encode, instead of the user discovering it minutes into an export.

**Remaining wiring, and it is client work not engine work:** nothing reads this
yet. The editor's transition picker still offers everything.

---

## What I'd deliberately not change

Unchanged from the first edition, and reinforced by what the last fourteen commits
actually did:

- **The Postgres queue.** Adding BullMQ/Redis beside it would be a second queue,
  not a better one. `SKIP LOCKED` + heartbeat + stale-claim recovery is the correct
  design and it's already written.
- **Refusing unsupported transitions and HDR.** Keep the refusal; [#18](#18) moved
  it earlier, which was the whole ask.
- **Charging only after the file exists.** Right, and rarer than it should be.
- **The dual-render invariant and its filtergraph tests.** Every closure above
  shipped through it, and every one of them shipped with a test asserting the two
  renderers agree — including `overlay-union.test.ts`, which exists specifically
  so a third overlay kind cannot be half-added. That test is the reason [#1](#1)
  is honestly reported as partial rather than quietly shipped as done.
- **Skipping what cannot be drawn correctly.** Both renderers skip `ShapeOverlay`
  in the same way and say so in comments that point at each other. A missing
  picture beats a wrong one. The fix for [#1](#1) is to draw it, not to remove
  the guard.
- **Templates as pure `Input → VideoProject` functions.** Still three, still the
  right shape. Grow it, don't redesign it.
- **The comments.** They still explain *why*, including where the code is wrong.
  `types.ts:105` says outright that nothing renders a word timing yet. Half this
  document was written by believing them, and re-verification found them accurate
  every time.

---

## Recommended order for Shortspilot

Re-ranked against the verified state, not the original one.

**Before anything else** (three days, all small, all unblock something bigger):

1. [#6](#6) `Ledger.hold/settle/release`. Everything with a cost sits on it.
2. [#12](#12) rate limits on the four generation routes. Four lines.
3. [#5](#5) thumbnail on `RenderResult`. Four screens want it.
4. [#13](#13) pick a migration runner. Free today, expensive after [#7](#7).

**Phase 1** (the pipeline, one format):

5. [#7](#7) `generation_jobs`, modelled on `PgJobQueue`.
6. [#16](#16) `resolveVisual` seam over the now-working Pexels video provider.
7. [#9](#9) an SSE route matching the client contract that already exists.
8. [#20](#20) the story archetype, which needs no further engine work.

**Phase 2** (the format library, and the only genuine engine work left):

9. [#1](#1) the shape renderer, across all three paths, with the agreement test.
10. [#4](#4) the active-word caption effect.
11. The remaining three archetypes, which both of the above unblock.

**As they start to hurt:** [#11](#11) observability, [#10](#10) duration-based
render pricing, [#17](#17) the remaining four fields, [#8](#8) version history,
[#15](#15) streamed TTS, [#19](#19) segment rendering.

The headline for planning: **Phase 2's engine budget is roughly half what the
first edition estimated.** Font metrics and wrapping are done, image overlays are
done, and what's left is one shape renderer and one caption effect.
