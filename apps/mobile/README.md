# Orbit Video — mobile (Expo)

A thin React Native app that drives the [`@orbit/render-service`](../render-service):
type a quote (or a prompt), tap **Render**, and the rendered MP4 plays on the
phone. The heavy lifting (engine, ffmpeg, AI) is all server-side — the app is
just a client.

> ⚠️ **Unverified on device.** This scaffold was written but not run on hardware.
> You are the first to run it on an iPhone/Android. Treat the steps below as the
> starting point; expect to tweak versions via `npx expo install`.

## Run it

**1. Start the render service on your Mac** (from the repo root):
```bash
pnpm --filter @orbit/render-service build
PORT=8787 node apps/render-service/dist/main.js
# For the "AI describe" mode, export your key first (stays server-side):
#   export ANTHROPIC_API_KEY=sk-ant-...   then start the service
```
Make sure `ffmpeg` is on PATH on that machine.

**2. Point the app at your Mac's LAN IP.** Find it:
```bash
ipconfig getifaddr en0     # e.g. 192.168.1.23
```
Edit `DEFAULT_SERVER` in `App.tsx` to `http://<that-ip>:8787` (the phone and Mac
must be on the same Wi-Fi).

**3. Install and start Expo** (this app is standalone — it is *excluded* from the
pnpm workspace, so install it on its own):
```bash
cd apps/mobile
npm install
npx expo start
```
Scan the QR code with **Expo Go** (iOS/Android) on a device on the same network.

**4. Tap Render.**
- **Quote (no key):** the app builds a `VideoProject` JSON and calls `/v1/render`.
- **AI describe:** the app sends the prompt to `/v1/generate` (needs the server's
  `ANTHROPIC_API_KEY`).

## Notes
- `expo-av` is used for playback; if your Expo SDK has moved it to `expo-video`,
  swap the import. Run `npx expo install --fix` to align dependency versions.
- This is the **WebView-free** path: the app is native chrome around a
  server-rendered video. The richer in-app *editing* preview (react-native-skia)
  is the next step.
