# AI generation — go-live checklist

Everything below is config, not code. Each feature is independent and gated by
its own env var: leave one unset and that endpoint returns `503`/degrades, it
never crashes the server. Server env lives in `apps/render-service/.env` (copy
from `.env.example`). Client config lives in `apps/mobile/src/constants.ts`.

## 1. Storage (Postgres — Neon or Supabase)

1. Create a Postgres database (Neon or Supabase both work — it's a plain URL).
2. Set `DATABASE_URL` in the render-service `.env` (include `?sslmode=require`
   for Neon). Tables are created automatically on first run.
3. Verify: `cd apps/render-service && TEST_DATABASE_URL="<url>" npm test`
   — the 3 skipped Postgres tests should pass (they write/clean up `test:*` rows).

Without `DATABASE_URL` storage is in-memory and resets on restart — dev only.

## 2. Auth (gates AI + credits)

Pick ONE provider and set `ORBIT_AUTH_PROVIDER`. The editor stays usable
logged-out; only AI + credits require sign-in.

- **selfhosted** — set `ORBIT_JWT_SECRET`. Register/login endpoints
  (`/v1/auth/register`, `/v1/auth/login`) are served by us; the app's built-in
  email/password `AuthSheet` already works, no client SDK needed.
- **clerk / supabase / firebase** — set the provider's env
  (`CLERK_ISSUER` / `SUPABASE_JWT_SECRET` / `FIREBASE_PROJECT_ID`). The server
  only *verifies* the token; the **app must obtain it from that provider's RN SDK**
  and call `setAuthToken(token)` (see `apps/mobile/src/net/genClient.ts`). The
  app currently ships the self-hosted flow only — wire the managed SDK when you
  switch. Add the provider's RN SDK, then bundle for one active provider.

Optional: `ORBIT_SIGNUP_BONUS=50` to grant free credits on registration.
Set `AUTH_ENABLED=false` in `constants.ts` only for a local no-auth dev server.

## 3. Generation providers

- **Runway** — `RUNWAY_API_TOKEN` (https://dev.runwayml.com). Enables image,
  video, and photo→video.
- **ElevenLabs** — `ELEVENLABS_API_KEY`. Enables `/v1/tts` voiceover. Optional
  `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL`.

Verify a key end-to-end: set it in `.env`, restart, and generate from the app
(or `curl` the endpoint).

## 4. Purchases (RevenueCat)

1. **RevenueCat project**: create the app, connect App Store Connect / Play.
2. **Products**: create consumable credit-pack products whose ids match
   `ORBIT_CREDIT_PACKS` (default `credits_100`, `credits_500`, `credits_1200`),
   and add them to an Offering. Override the id→credits map via `ORBIT_CREDIT_PACKS`
   (JSON) if you use different ids.
3. **Webhook**: RevenueCat → Integrations → Webhooks → URL
   `https://<your-server>/v1/billing/webhook`, and set the Authorization header
   to a secret you also put in `REVENUECAT_WEBHOOK_AUTH`. Credits are granted
   server-side, idempotently per transaction.
4. **Client key**: put the RevenueCat public SDK keys in
   `apps/mobile/src/constants.ts` → `REVENUECAT_API_KEY = { ios, android }`.
   Until set, the SDK never loads and Buy-credits shows "not available yet".
5. **Native rebuild** (below) — `react-native-purchases` autolinks; it needs a
   fresh native build to be present.

Verify: a RevenueCat **sandbox** purchase → webhook fires → `GET /v1/credits`
reflects the pack; replaying the webhook leaves the balance unchanged.

## 5. Native rebuild (required once for purchases)

`react-native-purchases` is a native module (no Expo config plugin — it
autolinks). The current dev build predates it, so rebuild:

```
cd apps/mobile
npx expo prebuild -p ios      # regenerates ios/ with the new pod
npx expo run:ios              # pod install + native build + launch
```

⚠️ `apps/mobile` installs standalone with **npm**, not the pnpm workspace — use
`npm install` there, never `pnpm add` (it breaks Metro resolution).

## 6. Quick verification matrix

| Feature | Server env | Verify |
|---|---|---|
| Postgres | `DATABASE_URL` | `TEST_DATABASE_URL=… npm test` |
| Self-hosted auth | `ORBIT_AUTH_PROVIDER=selfhosted` + `ORBIT_JWT_SECRET` | register in-app; `GET /v1/credits` needs the bearer |
| Image/video | `RUNWAY_API_TOKEN` | generate from the AI sheet |
| Voiceover | `ELEVENLABS_API_KEY` | Insert → Audio → AI Voice |
| Purchases | `REVENUECAT_WEBHOOK_AUTH` + client key + rebuild | sandbox purchase → balance updates |
