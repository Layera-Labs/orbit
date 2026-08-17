# Releasing `@layera-labs/orbit-*`

Twelve packages publish to **public npm**. Eight stay private, and each says why
in its own `//private` note. The version is one number across the whole repo —
the twelve, the root, `services/render` and `apps/web` — so there is never a
`0.0.1` SDK sitting inside a `1.0.0-beta.x` product.

Registry and access are settled: `publishConfig: { "access": "public" }` is in
every published manifest. A scoped package defaults to `restricted`, so without
that field the publish fails with a 402 — loud, but only after you have already
bumped and tagged.

## The checklist

Run all of it. There is no CI, so nothing else will.

```bash
pnpm install && pnpm build      # 26/26
pnpm test && pnpm typecheck     # 41/41 each
```

Then the two checks that exist because `beta.2` shipped broken:

**1. No `workspace:` specifier may survive into a published manifest.**

```bash
pnpm pack --pack-destination /tmp/packs   # in each package
```

Unpack and grep the manifests for `"workspace:`. It must find nothing —
`@layera-labs/orbit-react` declares `"@layera-labs/orbit-agentic": "workspace:*"` locally and
has to arrive as `"1.0.0-beta.4"`.

> **Use `pnpm pack`, never `npm pack`.** `npm` does not know the workspace
> protocol and copies it through verbatim, so `npm pack` reports nine packages
> "failing" this check when nothing is wrong — and, far worse, `npm publish`
> would ship exactly that: manifests whose dependencies no registry can resolve.
> The substitution is pnpm's, and it happens at pack and publish time.

**2. Every `exports` target must exist inside the tarball.**

Walk `package.json#exports` and confirm each `types`/`import`/`default` path is
really in `package/`. Forty-five targets across the twelve.

**3. The one the other two miss.** A symbol can be compiled into `dist/`,
typed, documented and tested while being reachable by no specifier at all — the
exports map admits only the subpaths it names, and a bundler rejects a deep
`@layera-labs/orbit-video/dist/karaoke.js` outright. That is what `beta.2` shipped and
what `beta.3` shipped again for the karaoke plate keys.

`packages/video/src/__tests__/export-reachability.test.ts` now fails on it, so
`pnpm test` covers this. It is listed here anyway, because the test only guards
`video`.

## Publishing

```bash
npm login                       # if `npm whoami` 401s
pnpm publish -r --dry-run       # confirm the set and the order
pnpm publish -r
```

`pnpm publish -r` sorts the workspace topologically — do not sequence by hand.
If you ever must, the order is `shared` · `model` · `video` → `effects` ·
`agentic` · `providers` → `core` · `ui` · `render` → `react` · `editor` → `next`.

## Afterwards, the same day

Re-point `orbit-mobile` at the new version. Its twelve parity files import
`@layera-labs/orbit-video/browser` to prove its vendored mirrors still match the
engine, and they are the only thing enforcing the dual-render invariant on the
Skia preview. A published engine the mobile app is not tracking is an invariant
nobody is checking.

```bash
cd /Volumes/Workspace/github/orbit-mobile && npx vitest run   # expect 328/328
```
