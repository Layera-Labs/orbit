/**
 * Every word on the marketing pages, in one place.
 *
 * The point is that changing the copy never means opening a layout file. Edit
 * here and the pages follow. Colours live in `styles/tokens.css` for the same
 * reason — the two things most likely to change are the two things that are not
 * scattered.
 *
 * FIGURES ARE NOT COPY. Anything numeric that the product also computes —
 * credit rates, tier names, pack sizes — is imported from the packages that
 * define it, never typed in here, so the page cannot drift from the service.
 * What lives in this file is prose.
 */

export const site = {
  name: 'Orbit',
  org: 'Layera Labs',
  repo: 'https://github.com/Layera-Labs/orbit',
  npm: 'https://www.npmjs.com/org/layera-labs',
  version: '1.0.0-beta.4',
};

/** Band 1 — the hero, which is the dual-render proof and nothing else. */
export const hero = {
  headline: 'The preview is the export.',
  lede:
    'Orbit is an embeddable editor SDK for image and video. Every effect — every filter, transition, blur, mask and Ken Burns move — is defined once and drawn twice: canvas in the browser, ffmpeg on the server. Tests parse the real filtergraph and check the two agree, so a preview that lies about the export is a failing build rather than a support ticket.',
  primary: { label: 'Get an API key', href: '/signup' },
  secondary: { label: 'View source', href: 'https://github.com/Layera-Labs/orbit' },
};

/** Band 2 — the package set. */
export const packages = {
  heading: 'Twelve packages, and the shape they make.',
  body:
    'Take the whole editor, or take one piece. The engine depends on nothing else here, which is precisely what lets a browser and a server agree through it. Above it sits a document model, a Konva renderer, a provider registry you fill in, and an assembled React editor.',
  aside:
    'The v1 half is still published and still documented. It is feature-complete and in maintenance; new work goes into v2.',
};

/** Band 3 — what it can actually do. Three groups, not a card wall. */
export const capability = {
  heading: 'What you get when you mount it.',
  groups: [
    {
      title: 'The canvas',
      body: 'Text, images, video, audio, shapes, lines, SVG, QR codes, gradients, patterns and groups. Crop, corner radius, stroke, shadow, blur. Eight blend modes, multi-page documents, undo and redo.',
      figure: '12',
      figureLabel: 'element types',
    },
    {
      title: 'The timeline',
      body: 'Multi-track video with drag, trim and cross-lane moves in one gesture. Per-clip rotation, crop, speed, volume and audio fades. Captions with SRT export, chroma key, mosaic and lens effects, keyframed motion, HDR10.',
      figure: '51',
      figureLabel: 'transitions, in 21 families',
    },
    {
      title: 'The AI layer',
      body: 'Generate and edit images, generate video, synthesise speech, transcribe to captions. An optional peer dependency: the SDK builds and runs without it, and nothing is charged unless the generation succeeds.',
      figure: '6',
      figureLabel: 'operations, optional',
    },
  ],
};

/** Band 4 on home, and the spine of /pricing. */
export const pricing = {
  heading: 'Render in the cloud, priced by the second.',
  body:
    'Point the SDK at the hosted API and renders happen on our machines. Credits are held before ffmpeg starts and settled against the real output, so a failed encode refunds rather than charges. Authenticate a server with an API key, or a signed-in person with their session.',
  shortEdge: {
    heading: 'The tier comes from the short edge.',
    body:
      'A 1080×1920 vertical video is priced as 1080p, not as the 2K its long edge would suggest. Almost every video shot on a phone is vertical, so pricing on the long edge would overcharge the common case. This is the rule worth knowing before you budget.',
  },
  rules: [
    'Seconds round up, so the number is one you can predict from your own timeline.',
    'Credits are whole numbers. A balance is always exact.',
    'A zero-length project bills nothing.',
    'A failed render releases its hold in full.',
  ],
  packsHeading: 'Credit packs',
  packsBody:
    'Larger packs carry more credits per pack. Checkout is not live yet: the price per credit is still being set.',
  packsUnavailable: 'Not yet available',
  aiHeading: 'Generation costs',
  aiBody: 'Charged only on success. A failed generation does not debit.',
};

/** Band 5 — the honest alternative. */
export const selfHost = {
  heading: 'Or run the whole thing yourself.',
  body:
    'The render service is in the repository, not behind the API. It ships with a Dockerfile, a compose file bringing up Postgres and MinIO, and a shared Postgres job queue so adding a machine adds capacity. Storage is a seam: local disk by default, any S3-compatible bucket when you set the keys.',
  aside:
    'The hosted API is the same service with our ffmpeg builds and our operational problems. Nothing about the SDK requires it.',
  command: `git clone https://github.com/Layera-Labs/orbit
docker compose -f services/render/compose.yaml up`,
};

/** Band 6 — one action, the same one as the top bar. */
export const signup = {
  heading: 'Start with a key.',
  body: 'Sign in with GitHub, create a key, make your first render.',
  cta: { label: 'Continue with GitHub', href: '/signup' },
};
