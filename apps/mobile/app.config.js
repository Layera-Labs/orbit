/**
 * A thin wrapper over `app.json`, which stays canonical for everything else.
 *
 * It exists for ONE reason: the server URL has to differ per build profile, and
 * `app.json` is static. Expo passes the parsed `app.json` in as `config`, so
 * everything there is preserved untouched and only `extra.serverUrl` is
 * computed.
 *
 * **The default is deliberately empty**, and that is what keeps local
 * development working. `constants.ts` resolves the server as
 * `extra.serverUrl` → Expo's dev `hostUri` → `localhost:8787`, so an empty
 * value falls through to the machine running Metro — which is why a dev build
 * on a physical device reaches your Mac with no configuration at all. Hardcode
 * a production URL here and that fallback is gone: every dev build would talk
 * to the deployed service, and every debug export would burn a render slot on
 * a shared box.
 *
 * So the URL is set per profile in `eas.json` instead — on `preview` and
 * `production` only. BOTH development profiles deliberately leave it unset, so
 * a dev client keeps reaching whichever machine is running Metro. Test against
 * the deployed service with a `preview` build, which is a standalone app and
 * needs no Metro at all.
 *
 * To point a one-off build somewhere else, set the env var on the command:
 *   ORBIT_SERVER_URL=https://staging.example.com npx eas build --profile preview
 */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    serverUrl: process.env.ORBIT_SERVER_URL || config.extra?.serverUrl || '',
  },
});
