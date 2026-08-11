/**
 * Orbit's brand, in the one place both products read it from.
 *
 * What lives here is what would be WRONG to have two of: the mark, the icon
 * set, the display face, and the handful of tokens that are decisions about
 * the brand rather than about a surface.
 *
 * What deliberately does NOT live here is colour. The editor
 * (`apps/web/src/styles/tokens.css`, "The Instrument") is a workspace — warm
 * graphite, hierarchy from tone rather than hue, one desaturated clay accent
 * that is never a button fill. That restraint is correct for a tool somebody
 * stares at for an hour and wrong for a page somebody sees for eight seconds.
 * Forcing both through one palette would either flatten the site or loosen the
 * editor, so each owns its own surfaces and they meet here, at the type, the
 * geometry and the marks.
 */
export { Plate } from './Plate';
export { Icon } from './Icon';
export type { IconName } from './Icon';
