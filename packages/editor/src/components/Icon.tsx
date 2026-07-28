/**
 * Orbit's icon set, drawn in-house.
 *
 * Previously a `lucide-react` lookup. The uniform thin-stroke pack look is a
 * giveaway on every project that ships it, and it also meant this SDK dragged a
 * whole icon library into every consumer's bundle for 44 glyphs. These are drawn
 * on one 24×24 grid at a single stroke weight.
 *
 * The `IconName` union and the `<Icon name size strokeWidth …/>` signature are
 * unchanged on purpose, so no other file in the editor had to be touched.
 */
import type * as React from 'react';

/** Icon name → the inner markup of a 24×24 stroked SVG. */
const PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/>',
  template:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M9.5 9.5V19.5"/>',
  shapes: '<circle cx="8" cy="8" r="4"/><rect x="11.5" y="11.5" width="9" height="9" rx="1.5"/>',
  text: '<path d="M5 6.5h14M12 6.5V19M9 19h6"/>',
  image:
    '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" stroke="none"/><path d="M3.5 16.2 9 11l4.5 4 3-2.4 4.5 3.8"/>',
  palette:
    '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.5-1.3-1.8-1.3-3 0-.9.8-1.6 1.8-1.6h1.6A4.4 4.4 0 0 0 20.5 9c0-3-3.8-5.5-8.5-5.5Z"/><circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>',
  font: '<path d="M4 19 10 5l6 14M6.2 14.5h7.6M17.5 19h2.5"/>',
  layers:
    '<path d="M12 3.5 21 8l-9 4.5L3 8Z"/><path d="M3 12.5 12 17l9-4.5"/><path d="M3 16.8 12 21.3l9-4.5"/>',
  upload: '<path d="M12 20V8"/><path d="M7.5 12.5 12 8l4.5 4.5"/><path d="M4.5 4h15"/>',
  bold: '<path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7Z"/><path d="M7 12h6.5a3.5 3.5 0 0 1 0 7H7Z"/>',
  italic: '<path d="M15.5 5h-4M12.5 19h-4M14 5l-4 14"/>',
  underline: '<path d="M7 4.5V11a5 5 0 0 0 10 0V4.5"/><path d="M5.5 20h13"/>',
  alignLeft: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  alignCenter: '<path d="M4 6h16M7 12h10M5.5 18h13"/>',
  alignRight: '<path d="M4 6h16M10 12h10M7 18h13"/>',
  distributeH: '<path d="M4.5 4v16M19.5 4v16"/><rect x="9" y="8" width="6" height="8" rx="1"/>',
  distributeV: '<path d="M4 4.5h16M4 19.5h16"/><rect x="8" y="9" width="8" height="6" rx="1"/>',
  code: '<path d="M8.5 7.5 4 12l4.5 4.5"/><path d="M15.5 7.5 20 12l-4.5 4.5"/><path d="M13.5 4.5 10.5 19.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="1.5"/><path d="M15.5 5.5h-11a1 1 0 0 0-1 1v10"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock:
    '<rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7 7.5 20h9L17.5 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevronDown: '<path d="M6 9.5 12 15.5 18 9.5"/>',
  close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
  eyeOff:
    '<path d="M4 4.5 20 19.5"/><path d="M9.3 6.1A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9"/><path d="M6.4 8.2A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 3.2-.55"/>',
  group:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
  export: '<path d="M12 4v11"/><path d="M7.5 10.5 12 15.2l4.5-4.7"/><path d="M4.5 20h15"/>',
  // A reading being taken, in the house language — not a sparkle.
  sparkle:
    '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 3v3.4M12 17.6V21M3 12h3.4M17.6 12H21"/>',
  shadow:
    '<rect x="3.5" y="3.5" width="13" height="13" rx="1.5"/><path d="M8 20.5h11a1.5 1.5 0 0 0 1.5-1.5V8" stroke-dasharray="2.5 2.5"/>',
  spacing:
    '<path d="M4 5h16M4 19h16"/><path d="M12 8.5v7"/><path d="M9.5 11 12 8.5 14.5 11M9.5 13 12 15.5 14.5 13"/>',
  corner: '<path d="M4 20V10a6 6 0 0 1 6-6h10"/>',
  opacity:
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none"/>',
  blend: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
  crop: '<path d="M7 3v14h14"/><path d="M3 7h14v14"/>',
  stripH: '<path d="M3 6.5h18M3 17.5h18"/><path d="M8 12h8"/>',
  stripV: '<path d="M6.5 3v18M17.5 3v18"/><path d="M12 8v8"/>',
  // Diagonal rather than the stock horizontal CTA arrow.
  arrow: '<path d="M7 17 17 7"/><path d="M9.5 7H17v7.5"/>',
  dots: '<circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  resize: '<path d="M4 10V4h6"/><path d="M20 14v6h-6"/><path d="M4 4l7 7M20 20l-7-7"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>',
} satisfies Record<string, string>;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
  /** Accepted for API compatibility; these marks are stroked. */
  filled?: boolean;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, style, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.shapes }}
    />
  );
}
