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
