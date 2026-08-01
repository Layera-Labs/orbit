/**
 * Turning a Photos asset into something `<Image>` can actually draw.
 *
 * `MediaLibrary.getAssetsAsync` hands back `ph://<uuid>/L0/001` on iOS — a
 * PHAsset identifier, not a URL. React Native's image loader has no handler
 * for that scheme, so passing one to `<Image source={{uri}}>` does not degrade
 * to a blank tile: it throws `No suitable image URL loader found for ph://…`
 * and takes the screen down with a redbox.
 *
 * `getAssetInfoAsync` is what resolves one to a real `file://`. It is async and
 * per-asset, which is why this is a hook with a cache rather than something the
 * list can do up front — a grid scrolls through hundreds of assets and only a
 * screenful is ever on show.
 *
 * **Simulator-only testing would never have caught this.** The simulator's
 * seeded photo library resolves differently; it took a real device with a real
 * Photos library to produce the crash.
 */
import { useEffect, useState } from "react";
import * as MediaLibrary from "expo-media-library";

/** asset id → resolved `file://`. Lives for the session; Photos ids are stable. */
const resolved = new Map<string, string>();

/** Anything that is not a PHAsset identifier is already drawable. */
export function isPhotoAssetUri(uri: string | undefined): boolean {
  return !!uri && uri.startsWith("ph://");
}

/**
 * A drawable uri for a Photos asset, or `undefined` until one is known.
 *
 * Undefined is a real state, not an error — the caller shows its placeholder
 * for a frame or two. Returning the `ph://` uri instead would put the redbox
 * back, which is the whole point of this.
 */
export function useAssetUri(id?: string, uri?: string): string | undefined {
  // A `file://`/`http` uri needs no resolving, and must not be delayed by a
  // state round-trip — that would flash a placeholder over every stock tile.
  const direct = isPhotoAssetUri(uri) ? undefined : uri;
  const [local, setLocal] = useState<string | undefined>(() =>
    id ? resolved.get(id) : undefined,
  );

  useEffect(() => {
    if (direct || !id || !isPhotoAssetUri(uri)) return;
    const hit = resolved.get(id);
    if (hit) {
      setLocal(hit);
      return;
    }
    let alive = true;
    /*
     * `shouldDownloadFromNetwork: false` matters: without it, scrolling a grid
     * of iCloud-backed photos silently pulls each one down over the network.
     * A thumbnail is not worth that. An asset that is not on the device simply
     * stays a placeholder here — it downloads when the user actually picks it.
     */
    MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false })
      .then((info) => {
        const uriOut = info?.localUri;
        if (!uriOut) return;
        resolved.set(id, uriOut);
        if (alive) setLocal(uriOut);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, uri, direct]);

  return direct ?? local;
}
