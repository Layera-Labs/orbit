# @layera-labs/next

`@layera-labs/react`'s editor, wrapped for the Next.js App Router. This is the
smallest package in the SDK and it is honest to say what it contains: one `'use
client'` module that re-exports `OrbitEditor` through `next/dynamic` with `ssr: false`.

```bash
npm i @layera-labs/next@beta
```

That is the whole thing:

```ts
'use client';
import dynamic from 'next/dynamic';

const OrbitEditor = dynamic(() => import('@layera-labs/react').then((m) => m.OrbitEditor), {
  ssr: false,
});
```

## Why it exists

The v1 editor is a canvas application. It touches `window` and `document` at module
scope through Fabric.js, so importing it into a server component is a build-time
crash, not a runtime warning. Every consumer was writing the same `dynamic(...)`
wrapper and some were getting it subtly wrong — a missing `'use client'`, or `ssr`
left at its default.

If you would rather write those four lines yourself, do. Nothing else here is doing
work for you.

## Usage

```tsx
// app/design/page.tsx
import { OrbitEditor } from '@layera-labs/next';

export default function Page() {
  return <OrbitEditor theme="dark" />;
}
```

Props are `OrbitEditorProps` from `@layera-labs/react`, unchanged. See
[that package's README](https://github.com/Layera-Labs/orbit/tree/main/packages/react#readme)
for `exportBackend`, `aiBackend` and the rest — including the fact that `apiKey` and
`backendUrl` are inert.

## Status

> **Beta.** `1.0.0-beta.3` under the `beta` tag; the API moves without notice.
>
> **This is the v1 line, which is legacy.** The current architecture is
> [`@layera-labs/editor`](https://github.com/Layera-Labs/orbit/tree/main/packages/editor#readme),
> and there is no `@layera-labs/next` equivalent for it — the v2 editor is a client
> component you import directly and wrap yourself if you need to.
>
> **Peers:** `next ^14.0.0`, `react ^18.0.0`, `react-dom ^18.0.0`. React 18 only,
> because the SDK's Konva renderer is on the React-18 line and two React copies is a
> hard crash in its reconciler. Next 15 is not tested here.

The web application in this repository runs on Next 14.2.35 pinned exactly, and does
**not** use this package — it mounts the v2 editor directly.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/guide/installation.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/installation.md)

MIT.
