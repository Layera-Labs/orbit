# Deploying Orbit

What a real deployment needs, in the order it bites you. Everything here has
been run; nothing is aspirational.

There are three deployable pieces and they are independent:

| Piece | What it is | Where it runs |
|---|---|---|
| `services/render` | Express + ffmpeg. Auth, credits, uploads, renders, AI. | A container. Not serverless — see below. |
| `apps/web` | Next 14. The editor and AI studio. | Vercel, or `next start` anywhere. |
| `examples/mobile` | Expo / React Native example. | EAS build, if you want it on a device at all. |

Both are clients of the service. **Deploy the service first** — neither can sign
in, export or generate without it.

---

## 1. The render service

### It cannot be serverless

`/v1/render` holds a connection for as long as ffmpeg runs, `/v1/upload` streams
files up to 500 MB, and the engine shells out to `ffmpeg` and `ffprobe`. No
function platform survives any of those. Use a container.

```bash
# From the REPO ROOT — the service imports workspace packages by source and
# needs the whole pnpm workspace to install.
ORBIT_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  docker compose -f services/render/compose.yaml up --build
```

That compose file is the **reference for what the service needs**, not a
deployment: no database, no TLS, and its files live in the container's temp dir
and die with it. For a single VPS (Contabo, Hetzner, DigitalOcean — any box with
a public IP) use `compose.vps.yaml` instead, which adds Postgres, a volume for
media and renders, and Caddy for automatic HTTPS:

```bash
docker compose -f services/render/compose.vps.yaml up -d --build
```

Its variables go in **`services/render/.env`**, next to the compose file —
*not* the repo root, even though that is where you run the command. Compose
reads `.env` from its project directory, which defaults to wherever the compose
file lives. A root `.env` is silently ignored, and the failure names a variable
you can plainly see set in a file you are looking at.

Two things about it are worth knowing before you change them. The media and
output directories are **not configurable** — the service writes to the OS temp
dir — so the volume works by pointing `TMPDIR` at it, and dropping that env var
silently goes back to losing every render on redeploy. And HTTPS is not
decoration: iOS App Transport Security blocks plain HTTP, so a device build
cannot reach an `http://` service at all.

### Behind an existing web panel or nginx

Caddy is behind a `caddy` profile and is **off by default**, because a box
running aaPanel, Plesk, cPanel or a hand-rolled nginx already has ports 80 and
443 taken. The command above therefore starts only the service and its
database, with the service on `127.0.0.1:8787` — reachable by a proxy on the
same box, not from the internet. Point the panel's reverse proxy at it and let
the panel issue the certificate.

**Two proxy settings are not optional, and both fail in ways that look like a
broken app rather than a broken proxy:**

| Setting | nginx default | Needs to be | What breaks |
|---|---|---|---|
| `client_max_body_size` | 1 MB | ≥ `512m` | Any real upload dies at the proxy with a 413. Uploads go to 500 MB. |
| `proxy_read_timeout` | 60s | ≥ `3600s` | A render that takes over a minute is killed **after ffmpeg finishes the work**, so the box burns the CPU and the client still sees a failure. |

Also set `proxy_request_buffering off`, or nginx spools the entire upload to its
own disk before the service sees a byte — doubling the write and the wait on
every piece of media.

```nginx
client_max_body_size 512m;
proxy_request_buffering off;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;

location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Render progress is **polled**, not streamed, so `proxy_buffering` can be left
alone.

### The one variable it will not start without

```
ORBIT_JWT_SECRET
```

It signs every session token **and every guest token**. The image runs with
`NODE_ENV=production`, where the service **refuses to boot** without it rather
than inventing one — a guessed secret would make every token forgeable, and it
would do so silently.

**Treat it as permanent.** Changing it signs everyone out, and that includes
guests, who have no password to sign back in with; their credits and their
render history become unreachable. Back it up with the database.

### Storage: the difference between a demo and a product

| Unset | What actually happens |
|---|---|
| `DATABASE_URL` | Credits and accounts live in memory and **reset on every restart**. The service warns on boot. |
| `ORBIT_S3_BUCKET` | Uploads and renders live on the container's disk and **die with it**. A second replica cannot see the first one's files. |

Both are fine for a demo and are silent data loss in production. Any
S3-compatible bucket works (R2, B2, MinIO, S3) via `ORBIT_S3_ENDPOINT`. A
HALF-set S3 config throws on boot rather than quietly falling back to disk.

If the bucket is private, output URLs are presigned GETs valid for 6 hours. Set
`ORBIT_S3_PUBLIC_BASE` if you front it with a CDN.

### Scaling past one box

Set `DATABASE_URL` **and** non-local storage, and renders move to a shared
Postgres queue where every instance is also a worker — adding a machine adds
capacity. It **refuses to enable on local disk**, and says which half is
missing, because a worker would otherwise be handed an upload token naming a
file only the receiving box has.

`ORBIT_MAX_CONCURRENT_RENDERS` (default 2) should match the container's **CPU
limit**, not the host's. ffmpeg will use every core it is given.

### Checking it

```bash
curl -s https://your-service/health
```

```json
{
  "ok": true,
  "version": "1.0.0-beta.1",
  "commit": "abc1234",
  "storage": "s3",
  "queue": "shared",
  "renders": { "running": 1, "queued": 0, "capacity": 2 }
}
```

Read it in this order: `storage` must not say `local` in production, `queue`
tells you whether replicas share work, and `commit` answers "is the fix
deployed?" — during an incident that is the first question, not the fifth.

`ok` stays `true` while the service is merely busy. That is deliberate: a load
balancer pulling the one box that is doing the work is precisely wrong.

### Password reset needs two more variables

Register and sign in work out of the box. **Reset does not**, and the way it
fails is quiet: `POST /v1/auth/forgot` answers `503 email-unconfigured` and the
apps tell the user reset is unavailable. Someone who forgets their password then
has no route back to their account or their credits.

```
RESEND_API_KEY=re_…                       # resend.com → API Keys
EMAIL_FROM=Orbit <no-reply@yourdomain>    # a verified Resend sender or domain
ORBIT_PUBLIC_URL=https://your-service     # this service's own public address
```

`ORBIT_PUBLIC_URL` is what turns the mail into a **link** to the reset page the
service serves at `/reset`. Without it the raw token is emailed instead, to be
pasted into the app — which works, but the token is a ~300-character JWT and
mail clients wrap it, so what comes back off the clipboard often no longer
verifies. Set it.

It has to be **stated**, never inferred from the request's `Host` header. That
shortcut is the classic reset-poisoning hole: anyone can POST to
`/v1/auth/forgot` with a `Host` of their choosing and have a valid reset token
mailed to your user, pointed at their box.

Two failure modes worth knowing, because neither says what it is:

- **Compose passes through only the variables a service names.** Putting these
  in `.env` alone is not enough — `compose.vps.yaml` lists them, so a hand-rolled
  compose file must too. The symptom is a 503 from a server whose `.env` plainly
  contains the key.
- **A send failure is deliberately invisible to the caller.** `/v1/auth/forgot`
  answers `200` whether or not the mail went out, because a send is only
  attempted when the account exists — surfacing the error would turn the route
  into an oracle for which addresses are registered. Grep the logs for
  `reset-email-failed`; that is where a bad key or an unverified sender shows up.

Check it end to end with an address you own: request a reset in the app, and the
mail should carry `https://your-service/reset?token=…`.

### Everything else

`services/render/.env.example` documents every variable with the reasoning.
The ones most often wanted:

- `RUNWAY_API_TOKEN`, `ELEVENLABS_API_KEY` — generation and voice. Absent, those
  routes report themselves unconfigured instead of failing mid-request.
- `ORBIT_FREE_CREDITS` (default 100) — granted once per account, guests included.
- `ORBIT_RENDER_COST` (default 0) — leaves export unmetered, which is the
  guest-first default the apps are built around.
- `ORBIT_LLM_BASE_URL`, `ORBIT_LLM_MODEL`, `ORBIT_LLM_API_KEY` — any
  OpenAI-compatible `chat/completions` endpoint. All three, or `/v1/generate`
  reports itself unconfigured and the generation worker does not start.
- `ORBIT_GENERATION_COST` (default 0) — what one generated video costs. Worth
  setting to something even on a private box: a generation spends real money at
  a language model, a TTS provider and a stock search before the encoder runs,
  so it is the one route where unmetered means an open tab on someone else's
  bill. The credits are HELD when the job is accepted and settled only when a
  file exists; a generation that fails gives them back.
- `ORBIT_ALLOWED_ORIGINS` — unset means any origin, because Orbit is an
  embeddable SDK called from customers' own pages. Safe here specifically
  because auth is a bearer token the client attaches itself, not a cookie the
  browser attaches for it.

---

## 2. The web app

```bash
NEXT_PUBLIC_ORBIT_RENDER_URL=https://your-service   # the browser calls this directly
ORBIT_SERVER_URL=https://your-service               # server-side proxy target
```

Both are needed and they are not the same thing. `/v1/upload` and `/v1/render`
go **direct** from the browser (too long and too large for a function); the
metered AI routes go through `/api/orbit/*` so the service URL stays off the
client. `NEXT_PUBLIC_ORBIT_RENDER_URL` is also compiled into the Content
Security Policy at build time, so **changing it requires a rebuild, not just a
restart** — a runtime-only change leaves the browser blocking its own requests.

On Vercel, use Pro or self-host: `/v1/generate-video` polls up to 180s twice and
Hobby caps functions at 60s.

Projects live in the visitor's IndexedDB. There is no cloud sync in beta 1 — see
the scope note below.

---

## 3. The mobile example

There is nothing to deploy here — `examples/mobile` is a demo you run locally,
not a product. It is worth reading anyway, because it is the shortest complete
statement of what a native client has to do: mint a guest token, upload media,
post a render job, poll it, and save the result.

```bash
cd examples/mobile      # standalone npm — never `pnpm install` here
npm install
npx expo run:ios
```

It finds the service by itself: `extra.serverUrl` in `app.json` if you set one,
otherwise Expo's dev `hostUri` on port 8787, otherwise `localhost:8787`. That
middle step is why a dev build on a physical device reaches your Mac with no
configuration — and why the path is not exercised when you launch the simulator
against `localhost`.

If you do put it on a device, note that `ios/` is gitignored (CNG; `app.json` is
canonical), so **a new native module needs a rebuild**, not just a reload.

---

## Upgrading from before beta 1

One breaking change, and it is worth knowing about:

**Every request now requires a JWT.** The `X-Orbit-Account` header is ignored
entirely. A client older than this release will get `401` on every call —
including upload and render, which used to be open. There is no compatibility
mode, because the header WAS the vulnerability: it was an account name the
caller chose, so anyone could type someone else's and spend their credits.

Shipped clients handle this themselves: they ask `POST /v1/auth/guest` for a
token on first use, so "no login required" still holds.
