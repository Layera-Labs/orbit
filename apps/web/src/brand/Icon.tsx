/**
 * Orbit Web's in-house icon set.
 *
 * Not an icon pack, and not a pack redrawn: the set has one invented rule it
 * keeps everywhere — a glyph is a FRAME or a RULE, plus a solid disc where a
 * value is being read. That disc is the same mark that rides the Plate's limb,
 * so the icons, the brand mark and the playhead all speak one language.
 *
 * 24×24, 1.5 stroke, round caps and joins, drawn on the same grid.
 */
import type { ReactNode } from 'react';

export type IconName =
  | 'image'
  | 'video'
  | 'studio'
  | 'library'
  | 'bench'
  | 'profile'
  | 'plus'
  | 'close'
  | 'check'
  | 'trash'
  | 'download'
  | 'upload'
  | 'play'
  | 'pause'
  | 'undo'
  | 'redo'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'search'
  | 'more'
  | 'openDiagonal'
  | 'text'
  | 'sound'
  | 'sliders'
  | 'reading'
  | 'layers'
  | 'split'
  | 'duration'
  /* --- the editor set --- */
  | 'template'
  | 'elements'
  | 'design'
  | 'music'
  | 'mic'
  | 'effects'
  | 'transition'
  | 'eye'
  | 'eyeOff'
  | 'lock'
  | 'duplicate'
  | 'mute'
  | 'zoomIn'
  | 'zoomOut'
  | 'snap'
  | 'folder'
  | 'panel';

/** The house disc — a value being read. */
const disc = (cx: number, cy: number, r = 1.7) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

const MARKS: Record<IconName, ReactNode> = {
  image: (
    <>
      <rect x={3} y={4.5} width={18} height={15} rx={1.5} />
      {disc(8.5, 9.5, 1.6)}
      <path d="M3.5 16.2 L9 11 L13.5 15 L16.5 12.6 L20.5 16.4" />
    </>
  ),
  video: (
    <>
      <rect x={3} y={5} width={18} height={14} rx={1.5} />
      <path d="M10.5 9.3 L15.8 12 L10.5 14.7 Z" fill="currentColor" />
    </>
  ),
  // The instrument itself, at icon scale.
  studio: (
    <>
      <g transform="rotate(-21 12 12)">
        <ellipse cx={12} cy={12} rx={9} ry={5.2} />
        {disc(16.5, 14.4, 2)}
      </g>
      <path d="M12 2.5 V5" />
    </>
  ),
  // A strip of frames on a rail — the light table.
  library: (
    <>
      <rect x={2.5} y={5.5} width={19} height={13} rx={1.5} />
      <path d="M9 5.5 V18.5 M15 5.5 V18.5" />
    </>
  ),
  // The bench: a rule with graduations and one reading.
  bench: (
    <>
      <path d="M3 8.5 H21" />
      <path d="M7 8.5 V12 M12 8.5 V13.5 M17 8.5 V12" />
      {disc(12, 17.5, 2)}
    </>
  ),
  profile: (
    <>
      <circle cx={12} cy={9} r={3.6} />
      <path d="M4.8 20.2 c0-3.7 3.2-5.6 7.2-5.6 s7.2 1.9 7.2 5.6" />
    </>
  ),
  plus: <path d="M12 5 V19 M5 12 H19" />,
  close: <path d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5" />,
  check: <path d="M5 12.5 L9.8 17.5 L19 7" />,
  trash: (
    <>
      <path d="M4 7 H20" />
      <path d="M9.5 7 V4.5 H14.5 V7" />
      <path d="M6.5 7 L7.5 20 H16.5 L17.5 7" />
    </>
  ),
  download: (
    <>
      <path d="M12 4 V15" />
      <path d="M7.5 10.5 L12 15.2 L16.5 10.5" />
      <path d="M4.5 20 H19.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20 V9" />
      <path d="M7.5 13.5 L12 8.8 L16.5 13.5" />
      <path d="M4.5 4 H19.5" />
    </>
  ),
  play: <path d="M7.5 5 L19 12 L7.5 19 Z" fill="currentColor" />,
  pause: (
    <>
      <rect x={7} y={5} width={3.6} height={14} rx={1} fill="currentColor" stroke="none" />
      <rect x={13.4} y={5} width={3.6} height={14} rx={1} fill="currentColor" stroke="none" />
    </>
  ),
  undo: (
    <>
      <path d="M4.5 11 H14 a5 5 0 0 1 0 10 H10" />
      <path d="M8.5 6.5 L4 11 L8.5 15.5" />
    </>
  ),
  redo: (
    <>
      <path d="M19.5 11 H10 a5 5 0 0 0 0 10 H14" />
      <path d="M15.5 6.5 L20 11 L15.5 15.5" />
    </>
  ),
  chevronDown: <path d="M6 9.5 L12 15.5 L18 9.5" />,
  chevronLeft: <path d="M15 5.5 L8.5 12 L15 18.5" />,
  chevronRight: <path d="M9 5.5 L15.5 12 L9 18.5" />,
  search: (
    <>
      <circle cx={10.5} cy={10.5} r={6} />
      <path d="M15 15 L20 20" />
    </>
  ),
  more: (
    <>
      {disc(5.5, 12)}
      {disc(12, 12)}
      {disc(18.5, 12)}
    </>
  ),
  // Diagonal, not the stock horizontal CTA arrow.
  openDiagonal: (
    <>
      <path d="M7 17 L17 7" />
      <path d="M9.5 7 H17 V14.5" />
    </>
  ),
  text: (
    <>
      <path d="M5 6.5 H19" />
      <path d="M12 6.5 V19" />
      <path d="M8.8 19 H15.2" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5 H7 L11.5 5.5 V18.5 L7 14.5 H4 Z" />
      <path d="M15 9 a4.5 4.5 0 0 1 0 6" />
    </>
  ),
  // Our own controls glyph: graduated rules, each with its reading.
  sliders: (
    <>
      <path d="M4 7.5 H20 M4 12 H20 M4 16.5 H20" />
      {disc(9, 7.5)}
      {disc(15.5, 12)}
      {disc(7, 16.5)}
    </>
  ),
  // A reading being taken — generation, in the house language rather than a sparkle.
  reading: (
    <>
      {disc(12, 12, 2.6)}
      <path d="M12 3 V6.4 M12 17.6 V21 M3 12 H6.4 M17.6 12 H21" />
    </>
  ),
  layers: (
    <>
      <ellipse cx={12} cy={8.5} rx={8} ry={4} />
      <path d="M4 12.5 c0 2.2 3.6 4 8 4 s8-1.8 8-4" />
      <path d="M4 16.5 c0 2.2 3.6 4 8 4 s8-1.8 8-4" />
    </>
  ),
  split: (
    <>
      <path d="M12 3 V21" strokeDasharray="2.5 2.5" />
      <path d="M7.5 8 L3.5 12 L7.5 16" />
      <path d="M16.5 8 L20.5 12 L16.5 16" />
    </>
  ),
  duration: (
    <>
      <circle cx={12} cy={12} r={8} />
      <path d="M12 7.5 V12 L15.2 14.2" />
    </>
  ),

  /* ---- the editor set -------------------------------------------------- */

  // A frame ruled into regions — a layout before it has content.
  template: (
    <>
      <rect x={3} y={4.5} width={18} height={15} rx={1.5} />
      <path d="M3 9.5 H21 M10 9.5 V19.5" />
    </>
  ),
  // Two primitives, overlapping — the shape drawer.
  elements: (
    <>
      <rect x={3.5} y={3.5} width={11} height={11} rx={1.5} />
      <circle cx={15} cy={15} r={5.5} />
    </>
  ),
  // The artboard itself, with its reading: size and surface.
  design: (
    <>
      <rect x={4} y={4} width={16} height={16} rx={1.5} />
      {disc(12, 12, 2.6)}
    </>
  ),
  music: (
    <>
      <path d="M9.5 17.5 V6 L19 4 V15.5" />
      <ellipse cx={7} cy={17.5} rx={2.5} ry={2.2} />
      <ellipse cx={16.5} cy={15.5} rx={2.5} ry={2.2} />
    </>
  ),
  mic: (
    <>
      <rect x={9} y={2.8} width={6} height={11} rx={3} />
      <path d="M5.5 11.5 a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18 V21.2 M8.8 21.2 H15.2" />
    </>
  ),
  // A grade: the rule bends, and the reading sits on the curve.
  effects: (
    <>
      <path d="M3.5 19 C8 19 9 5 20.5 5" />
      {disc(12, 12, 2)}
    </>
  ),
  // Two frames handing over — the overlap IS the transition.
  transition: (
    <>
      <rect x={2.5} y={6} width={11} height={12} rx={1.5} />
      <path d="M10.5 6 H21.5 V18 H10.5" strokeDasharray="2.4 2.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12 C5 7.5 8.4 5.5 12 5.5 s7 2 9.5 6.5 c-2.5 4.5-5.9 6.5-9.5 6.5 s-7-2-9.5-6.5 Z" />
      {disc(12, 12, 2.4)}
    </>
  ),
  eyeOff: (
    <>
      <path d="M4.6 7.6 C3.7 8.8 2.9 10.2 2.5 12 c2.5 4.5 5.9 6.5 9.5 6.5 1.6 0 3.2-.4 4.6-1.2" />
      <path d="M9.3 5.9 A9.6 9.6 0 0 1 12 5.5 c3.6 0 7 2 9.5 6.5 -.9 1.7-2 3-3.2 4" />
      <path d="M9.9 9.9 a3 3 0 0 0 4.2 4.2" />
      <path d="M4 4 L20 20" />
    </>
  ),
  lock: (
    <>
      <rect x={4.5} y={10.5} width={15} height={10} rx={1.5} />
      <path d="M8 10.5 V7.8 a4 4 0 0 1 8 0 V10.5" />
      {disc(12, 15.5, 1.6)}
    </>
  ),
  duplicate: (
    <>
      <rect x={8} y={8} width={12.5} height={12.5} rx={1.5} />
      <path d="M16 4.5 H4.5 V16" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5 H7 L11.5 5.5 V18.5 L7 14.5 H4 Z" />
      <path d="M15.5 9.8 L20.5 14.8 M20.5 9.8 L15.5 14.8" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx={10.5} cy={10.5} r={6} />
      <path d="M10.5 7.8 V13.2 M7.8 10.5 H13.2" />
      <path d="M15 15 L20 20" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx={10.5} cy={10.5} r={6} />
      <path d="M7.8 10.5 H13.2" />
      <path d="M15 15 L20 20" />
    </>
  ),
  // Snapping: a rule, and a reading that has landed exactly on its graduation.
  snap: (
    <>
      <path d="M12 3 V21" />
      <path d="M6.5 7.5 H8.5 M6.5 12 H8.5 M6.5 16.5 H8.5" />
      {disc(15.5, 12, 2.4)}
    </>
  ),
  folder: (
    <>
      <path d="M3 6.5 A1.5 1.5 0 0 1 4.5 5 H9.4 l2 2.6 H19.5 A1.5 1.5 0 0 1 21 9.1 V18 A1.5 1.5 0 0 1 19.5 19.5 H4.5 A1.5 1.5 0 0 1 3 18 Z" />
    </>
  ),
  // Panel open/closed — a frame with its rail filled.
  panel: (
    <>
      <rect x={3} y={4.5} width={18} height={15} rx={1.5} />
      <path d="M9.5 4.5 V19.5" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 20, className, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {MARKS[name]}
    </svg>
  );
}
