# Beta 1 — what is in it, and what is not

A beta is a promise about scope, not a disclaimer. This says exactly what works,
what is deliberately absent, where the known edges are, and what is blocked on
credentials nobody here can supply.

Version `1.0.0-beta.1`. Verify a running service with `GET /health`, which
reports its `version` and the `commit` it was built from.

---

## What works

### The render service

- **Every request is authenticated.** Signed-out is a *guest JWT* the server
  issues, not the absence of one, so guest-first onboarding survives without
  anything being anonymous.
- Uploads, synchronous renders, and **async render jobs** (`{async: true}` →
  poll an id) so nothing holds a connection through an encode.
- **Horizontal scale** when a Postgres queue and shared storage are both
  configured: every instance is also a worker, and `FOR UPDATE SKIP LOCKED`
  plus a claim heartbeat stops two workers rendering — and charging for — the
  same job.
- Durable storage on any S3-compatible bucket; the local media dir becomes a
  byte-budgeted cache that refetches an evicted upload before a render.
- Credit metering, self-hosted accounts with password reset, RevenueCat webhook.
- One JSON log line per request and a `/health` that reports storage, queue
  mode, render depth and build.
- Runs from a Dockerfile + compose that have been run, not just written.

### The web app (`apps/web`)

- **One editor** at `/design/[id]` for both stills and video.
- Stills: the v2 SDK canvas — elements, text, images, layers, backgrounds.
- Video: a real multi-track timeline. Drag, trim, cross-lane moves, ripple
  delete, snapping, filmstrips, waveforms, zoom.
- Effects that are **dual-rendered** — every one works in both the browser
  preview and the ffmpeg export, enforced by tests that parse the real
  filtergraph rather than by comments.
- AI Studio as a panel inside the editor: image, video, speech, and
  auto-captions that land on the timeline as real text clips.
- Export to MP4 through the service.
- Light and dark, light being the default.
- Accounts, or no account at all.
- **Cloud sync** for signed-in accounts: projects follow you to another machine.

### The mobile app (`apps/mobile`)

- The VN-style video editor: multi-track timeline, trim, split, PiP, effects,
  filters, transitions, blur, chroma key, Ken Burns.
- Auto-captions from speech, text overlays, TTS voiceover.
- Stickers, emoji, backgrounds; stock photos via bring-your-own-key held in the
  OS keychain.
- Export to the Photos library through the service.
- The same cloud sync, against the same account.

---

## Deliberately not in beta 1

These are decisions, not omissions.

- **Sync carries documents, not footage.** A project's timings, text, effects
  and structure follow your account; its media stays where it was uploaded. So
  a project opened on a second machine is fully editable but shows its clips as
  missing until that machine has the media — and where the service runs on
  local disk rather than a bucket, evicted media is gone for good. `/health`
  and the sync response both report `mediaDurable` so this is visible rather
  than discovered. Syncing blobs would turn a two-kilobyte sync into a
  several-hundred-megabyte one, and is its own feature.
- **Guests do not sync.** A guest has no password, so the identity cannot
  outlive a reinstall; offering "your work follows you" would be false. Signing
  in is what turns sync on, and it pushes whatever that device already had.

- **Speed ramping.** ffmpeg cannot smoothly ramp audio tempo, so there is no
  faithful preview to promise. Constant per-clip speed *is* shipped.
- **Keyframed scale and rotation.** ffmpeg cannot animate scale per-frame.
  Position keyframes and Ken Burns are shipped.
- **Transitions are Cut and Fade only.** The export applies transitions to the
  first visual track and collapses everything else to a fade — so the preview
  reproduces that collapse deliberately, and the panel offers only what both
  surfaces can actually do. Slide/wipe/zoom would be a lie in two places.
- **Chroma key hides itself where WebGL is missing** rather than being offered
  and silently skipped on export. (Colour temperature used to be in this list
  and no longer is: `colortemperature` turned out to be a plain per-channel
  gain, so it folds into the same colour matrix and the preview reproduces it.)

## Known limits worth stating

- **The colour grade is close, not exact.** Measured against real exported MP4s:
  ungraded clips and the fade-through-black transition agree to **≤2/255**; the
  grade lands **≤6/255 for every preset except `vivid`, which reaches 10** on
  saturated colour. The residue is a rounding step that comes back multiplied
  by saturation, because we are handed the decoder's 8-bit RGB and must
  reconstruct the chroma ffmpeg graded. It is not worth chasing and it is not
  byte-identical.
- **Mobile registers no URL scheme**, so emailed password-reset *links* cannot
  deep-link into the app yet. The reset code can still be pasted into the app.
- **The web app's CSP keeps `'unsafe-inline'` for scripts.** Next's per-route
  inline scripts cannot be hashed and the strict form needs a nonce that makes
  every page dynamic. No attacker-controlled HTML can reach the DOM today, so
  the trade is stated rather than papered over.
- Story mode and some editor preferences are incomplete.

---

## Blocked on credentials

Built to the point where each needs a key, and **not verified**, because
verifying them requires accounts only the project owner can create. None of
these is a code gap.

| Feature | Needs | State |
|---|---|---|
| Buying credits on web | A Stripe key | Not wired. The ledger and webhook path exist; the checkout does not. |
| Mobile paywall | App Store Connect products + RevenueCat | Code path exists (`REVENUECAT_API_KEY` is an empty placeholder and the SDK loads lazily only when set). Unverified. |
| Social login | Apple / Google OAuth client IDs | Not wired. Email + password works. |

They are listed here rather than in "what works" because an unverified feature
is not a shipped one.

---

## Before you call it deployed

1. `GET /health` reports the `commit` you expect, and `storage` is **not**
   `local`.
2. `ORBIT_JWT_SECRET` is set, backed up, and will not change. Changing it signs
   out every guest permanently — they have no password to sign back in with.
3. `DATABASE_URL` is set, or accept that credits reset on restart.
4. The web app was **rebuilt** after `NEXT_PUBLIC_ORBIT_RENDER_URL` changed —
   it is baked into both the client bundle and the CSP at build time.
5. Export one real video end to end from each client.

See [deploying.md](./deploying.md) for the detail behind each.
