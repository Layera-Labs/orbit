/**
 * A small, deliberately plain set of tokens.
 *
 * Warm rather than the cool blue-charcoal every dark product defaults to, and
 * the accent is a muted tan used only for state that is genuinely live — the
 * playhead, the running step, the selected clip. A saturated brand colour
 * sprayed on every label is what makes an interface look generated.
 *
 * The typeface is the system one on purpose. This app has no brand to carry,
 * and shipping a font file would be a download for nothing.
 */
export const c = {
  /** Page. */
  ink: '#14110f',
  /** Anything raised off the page: cards, the tab bar, a field. */
  panel: '#1e1a17',
  /** Raised again — a clip block, a pressed control. */
  raised: '#2a2521',
  /** An edge you feel rather than see: the surface's own colour, lifted. */
  edge: '#332d28',
  text: '#f4efe9',
  /** Secondary copy. Clears 6.7:1 on `ink`. */
  muted: '#a89d92',
  /**
   * Tertiary: units, ticks, the inactive tab.
   *
   * Measured, not eyeballed. It has to clear 4.5:1 against `panel` as well as
   * `ink`, and `panel` is the lighter of the two, so that is the binding
   * constraint (4.9:1). A step darker looked better and failed it.
   */
  faint: '#93887e',
  accent: '#c9926a',
  /** The accent at low value, for a fill behind accented text. */
  accentDim: '#3a2b21',
  danger: '#d08a7a',
} as const;

export const s = {
  gutter: 20,
  gap: 12,
  radius: 10,
} as const;

export const type = {
  title: { fontSize: 26, fontWeight: '600', letterSpacing: -0.4, color: c.text } as const,
  heading: { fontSize: 16, fontWeight: '600', color: c.text } as const,
  body: { fontSize: 15, lineHeight: 22, color: c.muted } as const,
  label: { fontSize: 13, fontWeight: '500', color: c.muted } as const,
  mono: {
    fontSize: 13,
    // A mono here is not decoration: these are timecodes and byte counts,
    // which are genuinely tabular and jump under a proportional face.
    fontFamily: 'Menlo',
    color: c.faint,
  } as const,
} as const;
