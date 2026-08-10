# @layera-labs/orbit-providers

Where the Orbit v2 editor gets its **content** from: templates, fonts, photos, videos,
backgrounds, stock assets, storage, publishing. This package defines the interfaces
and a registry that resolves them by kind, plus four small built-ins so a demo runs
with no keys.

It contains no UI and no network client of consequence. It is the seam you implement
so the editor shows *your* templates and *your* asset library instead of somebody
else's.

This is **v2**, alongside `@layera-labs/orbit-model`, `@layera-labs/orbit-render` and
`@layera-labs/orbit-editor`.

```bash
npm i @layera-labs/orbit-providers@beta
```

> **Beta.** `1.0.0-beta.3` under the `beta` tag; the API moves without notice.

## An absent provider hides its panel

This is the design decision worth knowing, and it is borrowed from Polotno. Sections
in the editor UI read from the registry and **hide themselves when their provider is
absent**. You do not configure which panels appear; you supply providers, and the
panels follow.

So a registry with a font provider and nothing else produces an editor with a Fonts
panel and no Templates, Photos or Backgrounds panel — not an editor with four panels,
three of which are empty or throw.

```ts
import { ProviderRegistry, GoogleFontProvider, PicsumPhotoProvider } from '@layera-labs/orbit-providers';

const registry = new ProviderRegistry({
  fonts: new GoogleFontProvider(),
  photos: new PicsumPhotoProvider(),
  // no `templates`, so the editor renders no Templates section
});

registry.has('backgrounds');                  // false
registry.set('backgrounds', myBackgrounds);   // now it does
registry.all();                               // the ProviderMap back out
```

Note the keys are **plural** (`photos`, `videos`, `templates`, `fonts`, `backgrounds`,
`assets`) while each provider's own `kind` is singular (`'photo'`, `'template'`). The
map is a slot list; the `kind` is a discriminant on the object.

`@layera-labs/orbit-editor` takes the `ProviderMap` itself, not the registry — it builds the
registry internally:

```tsx
<OrbitEditor providers={{ fonts: new GoogleFontProvider() }} />
```

Construct a `ProviderRegistry` when you are resolving providers in your own code.

## Writing one

Every provider is a plain object with an `id` and the methods for its kind. Nothing is
subclassed and nothing is registered globally.

```ts
import type { TemplateProvider, TemplateSummary } from '@layera-labs/orbit-providers';

export const houseTemplates: TemplateProvider = {
  id: 'house',
  kind: 'template',
  async list(opts) {
    const res = await fetch(`/api/templates?page=${opts?.page ?? 1}`);
    return (await res.json()) as TemplateSummary[];
  },
  async getDocument(id) {
    return (await fetch(`/api/templates/${id}`)).json();
  },
};
```

A `TemplateProvider` returns lightweight `TemplateSummary` records for the grid and a
full `Document` (from `@layera-labs/orbit-model`) on `get`, so a panel of two hundred
templates does not download two hundred documents.

## The kinds

`photo`, `video`, `asset`, `template`, `font`, `background` resolve through
`ProviderRegistry`. `StorageProvider` and `PublishTarget` are declared here too but are
not part of the registry map — they are separate interfaces a host implements for
persistence and for publishing a finished design.

## The built-ins

`PicsumPhotoProvider` (Lorem Picsum, no key), `GoogleFontProvider`,
`PresetBackgroundProvider` and `DemoTemplateProvider`. They exist so the examples run
out of the box. They are demo-grade, and honestly so: `PicsumPhotoProvider` does not
search at all, it feeds the query into picsum.photos as a *seed*, so the results are
stable for a given term and have nothing to do with it. Swap in an Unsplash or Pexels
provider against the same `PhotoProvider` interface before shipping.

## Links

- [Repository](https://github.com/Layera-Labs/orbit)
- [docs/architecture-v2.md](https://github.com/Layera-Labs/orbit/blob/main/docs/architecture-v2.md)
- [docs/guide/configuration.md](https://github.com/Layera-Labs/orbit/blob/main/docs/guide/configuration.md)

MIT.
