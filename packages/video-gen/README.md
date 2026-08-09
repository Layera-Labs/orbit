# @layera-labs/video-gen

Generative media (image / video / TTS) behind a **credit-metered** service.
Every call checks the account can afford the operation, calls the provider, then
debits the [`@layera-labs/billing`](../billing) ledger — so generation can never run
for free (the plan's *billing-before-generation* rule, enforced in code).

```ts
import { GenerationService } from '@layera-labs/video-gen';
import { Ledger, InMemoryLedgerStore, makeAccountId } from '@layera-labs/billing';

const ledger = new Ledger(new InMemoryLedgerStore()); // swap for a DB store in prod
const account = makeAccountId('orbit_sk_…', 'end-user-1');
await ledger.credit(account, 1000);

const gen = new GenerationService(new FalProvider(process.env.FAL_KEY!), ledger);
const { url } = await gen.generateImage(account, { prompt: 'a neon diwali poster' });
// → debits generate_image credits; `url` is the asset (store in R2, then add as an image clip)
```

## Wiring a real provider

Implement the `MediaProvider` interface against fal.ai / Replicate / ElevenLabs
(only the methods you support). The HTTP/polling details live in your adapter —
the service stays the same:

```ts
import type { MediaProvider, GenResult } from '@layera-labs/video-gen';

class FalProvider implements MediaProvider {
  constructor(private apiKey: string) {}
  async generateImage(req): Promise<GenResult> {
    // POST to fal, poll, return { url } of the produced image
  }
  async generateVideo(req): Promise<GenResult> { /* … */ }
}
```

## Feeding results back into a video

`GenResult.url` slots straight into `@layera-labs/video`:

- image → an `image` clip, or a base for a lyric/quote video
- video → a `video` clip
- tts → an `audio` track (voiceover)

## Status

- ✅ **Service + metering** — built and tested with `MockMediaProvider` (no keys).
- ⏳ **Live providers** — implement `MediaProvider` with your fal/Replicate key; the
  service, billing, and refusal-on-insufficient-credits all work today.
