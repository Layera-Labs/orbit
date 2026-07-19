# Bundled offline content

A small starter subset of the content library, embedded in the app so the
Stickers / Emoji / Backgrounds tabs render and can be added to a project on first
launch with **no network**. The full catalog still streams from the CDN
(see `src/content/catalog.ts`); this is just the offline floor. Registry and
resolution live in `src/content/assets.ts`.

## `emoji/` and `stickers/`

OpenMoji color PNGs at 618×618, a subset of the codes in `catalog.ts`
(`EMOJIS` / `STICKERS`). Downloaded from the same source the CDN uses
(`hfg-gmuend/openmoji@15.0.0`).

- **License:** OpenMoji — CC BY-SA 4.0 (https://openmoji.org). Attribution is
  required; keep this notice with the assets.

## `backgrounds/`

Six grained directional-gradient JPEGs at 1080×1920, generated with ffmpeg
(deep charcoal / teal / oxblood / ember / forest / stone). Generated in-repo, so
they carry no third-party license. These replace the network Picsum samples for
the offline set; curated licensed photos remain a separate follow-up.

## `sfx/`

Eleven short mono WAV sound effects (pop / click / tick / ding / beep / chime /
success / impact / whoosh / swoosh / riser), **synthesized entirely in-repo**
from sine/harmonic/noise math — see `scripts/generate-sfx.mjs`. There is no
third-party audio here, so they carry no license restriction and are released as
public-domain (CC0). Registry: `SFX` in `catalog.ts` + `BUNDLED_SFX` in
`assets.ts`. Regenerate with `node scripts/generate-sfx.mjs`.
