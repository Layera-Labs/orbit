# @layera-labs/orbit-brand

Orbit's brand primitives, in the one place both products read them from: the
**Plate** mark, the **Icon** set, and the display face.

Private on purpose. Publishing it would hand anyone the pieces to build an
interface that looks like Orbit's, which is precisely what a white-label SDK
must not do. The themeable surface a consumer *is* meant to mount is
`@layera-labs/orbit-ui`.

```tsx
import { Plate, Icon } from '@layera-labs/orbit-brand';
import '@layera-labs/orbit-brand/type.css';
```

## What is here, and what is deliberately not

Here: the marks and the type. These are the things it would be *wrong* to have
two of — a second Plate drawn slightly differently, or a headline set in a face
the other product doesn't use, is a brand splitting in half.

Not here: colour, spacing, radii. The editor is a workspace and its palette
("The Instrument", `apps/web/src/styles/tokens.css`) is deliberately austere —
warm graphite, hierarchy from tone rather than hue, one desaturated clay accent
that is never a button fill. That restraint is right for a tool somebody stares
at for an hour and wrong for a page somebody sees for eight seconds. Each
surface owns its own palette; they meet at the type and the geometry.

## The one weight

Gambarino ships in a single weight. There is no bold and no italic, and asking
for one gets a synthesised face that reads as a rendering fault. Emphasis comes
from size, spacing and colour.
