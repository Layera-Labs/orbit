/**
 * VIcon — the single icon component for the Vela reskin.
 *
 * Icons are translated 1:1 from Vela.dc.html: each named entry stores the exact
 * `d` path strings (plus circles/rects where Vela composed primitives) on a
 * 24×24 viewBox. Most are stroked (round caps/joins); a few transport glyphs are
 * filled. Pass `name` for a catalogued icon, or `d` (+ optional circles/rects)
 * as an escape hatch for data-driven glyphs (folders, project menu, etc.).
 */
import Svg, { Path, Circle, Rect } from 'react-native-svg';

type Circ = [cx: number, cy: number, r: number];
type RectT = [x: number, y: number, w: number, h: number, rx?: number];

interface IconSpec {
  /** stroke (default) or fill */
  mode?: 'stroke' | 'fill';
  /** default stroke width */
  sw?: number;
  /** override viewBox (e.g. the non-square ratio-chip frame) */
  vb?: string;
  paths?: string[];
  circles?: Circ[];
  rects?: RectT[];
}

const ICONS = {
  // ---- top bar ----
  back: { paths: ['M15 5l-7 7 7 7'], sw: 2.4 },
  help: {
    circles: [[12, 12, 9]],
    paths: ['M9.5 9.5a2.5 2.5 0 113.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01'],
    sw: 2,
  },
  dots: { mode: 'fill', circles: [[5, 12, 2], [12, 12, 2], [19, 12, 2]] },
  save: { paths: ['M5 4h11l3 3v13H5z', 'M8 4v5h7M8 14h8v6H8z'], sw: 1.8 },
  export: { paths: ['M12 16V4M7 9l5-5 5 5M5 20h14'], sw: 2 },
  frame: { rects: [[3, 2, 10, 16, 2]], sw: 1.8, vb: '0 0 16 20' },
  chevronDown: { paths: ['M6 9l6 6 6-6'], sw: 2.4 },
  chevronRight: { paths: ['M9 6l6 6-6 6'], sw: 2.4 },
  close: { paths: ['M6 6l12 12M18 6L6 18'], sw: 2.2 },
  check: { paths: ['M5 12l5 5 9-11'], sw: 2.4 },
  chevronUp: { paths: ['M6 15l6-6 6 6'], sw: 2.4 },
  trash: { paths: ['M5 7h14M9 7V4h6v3M6 7l1 13h10l1-13'], sw: 1.8 },

  // ---- transport ----
  prev: { mode: 'fill', paths: ['M18 5v14l-9-7zM7 5h-2v14h2z'] },
  play: { mode: 'fill', paths: ['M8 5v14l11-7z'] },
  pause: { mode: 'fill', paths: ['M7 5h3v14H7zM14 5h3v14h-3z'] },
  next: { mode: 'fill', paths: ['M6 5v14l9-7zM17 5h2v14h-2z'] },
  prefs: { circles: [[7, 8, 2], [17, 16, 2]], paths: ['M9 8h11M4 16h11'], sw: 2 },
  fullscreen: { paths: ['M9 3H4v5M15 3h5v5M9 21H4v-5M15 21h5v-5'], sw: 2 },
  undo: { paths: ['M9 14l-4-4 4-4', 'M5 10h8a5 5 0 015 5v1'], sw: 2 },
  redo: { paths: ['M15 14l4-4-4-4', 'M19 10h-8a5 5 0 00-5 5v1'], sw: 2 },

  // ---- bottom toolbar (tools) ----
  filter: { paths: ['M8 7a4 4 0 100 8 4 4 0 000-8zM14 9a4 4 0 100 8 4 4 0 000-8z'], sw: 1.7 },
  trim: { paths: ['M7 5v14M17 5v14M7 9h10M7 15h10'], sw: 1.7 },
  fx: {
    paths: [
      'M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z',
      'M18 14l.9 2.3L21 17l-2.1.7L18 20l-.9-2.3L15 17l2.1-.7z',
    ],
    sw: 1.7,
  },
  split: { paths: ['M7 6a2 2 0 104 0 2 2 0 00-4 0zM7 18a2 2 0 104 0 2 2 0 00-4 0zM9 8l9 8M18 8L9 16'], sw: 1.7 },
  cutout: { paths: ['M12 7a3 3 0 100 6 3 3 0 000-6zM5 20a7 7 0 0114 0'], sw: 1.7 },
  quality: { paths: ['M4 6h16v12H4zM10 10l5 3-5 3z'], sw: 1.7 },
  speed: { paths: ['M4 15a8 8 0 1116 0M12 15l4-4'], sw: 1.7 },
  volume: { paths: ['M5 10v4h3l4 3V7L8 10zM16 9a4 4 0 010 6M18.5 7a7 7 0 010 10'], sw: 1.7 },

  // ---- insert / add sheets ----
  photos: { paths: ['M4 5h16v14H4zM4 16l5-4 4 3 3-3 4 3M9 9a1.4 1.4 0 100 .01'], sw: 1.9 },
  audio: { paths: ['M9 18V6l10-2v12M6 18a2.5 2.5 0 105 0 2.5 2.5 0 00-5 0M16 16a2.5 2.5 0 105 0 2.5 2.5 0 00-5 0'], sw: 1.9 },
  text: { paths: ['M6 6h12M12 6v12'], sw: 1.9 },
  sticker: { paths: ['M5 4h14v10l-5 5H5zM14 19v-5h5'], sw: 1.9 },
  effects: { paths: ['M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z'], sw: 1.9 },
  record: { paths: ['M12 4a3 3 0 013 3v5a3 3 0 01-6 0V7a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v3'], sw: 1.9 },
  soundfx: { paths: ['M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4'], sw: 1.9 },

  // ---- timeline gutter ----
  gutterAudio: { circles: [[6, 18, 2.5], [16, 16, 2.5]], paths: ['M9 18V6l10-2v12'], sw: 2 },
  subtitle: { paths: ['M4 6h16M4 12h16M4 18h10'], sw: 2 },
  image: { rects: [[3, 4, 18, 14, 2]], paths: ['M3 14l5-4 4 3 4-4 5 4'], sw: 2 },
  video: { rects: [[3, 6, 18, 12, 2]], paths: ['M3 10h18M8 6v12M16 6v12'], sw: 1.8 },
  plus: { paths: ['M12 5v14M5 12h14'], sw: 2.4 },

  // ---- bottom nav ----
  navHome: { paths: ['M4 11l8-7 8 7M6 10v9h12v-9'], sw: 2 },
  search: { circles: [[11, 11, 7]], paths: ['M20 20l-4-4'], sw: 2.2 },
  templates: { paths: ['M4 8l4 4 4-7 4 7 4-4-2 11H6z'], sw: 2 },
  profile: { circles: [[12, 9, 3.2]], paths: ['M5 20a7 7 0 0114 0'], sw: 2 },
  crown: { paths: ['M4 8.5l3.4 3L12 5l4.6 6.5 3.4-3L18.5 19h-13zM6 19h12'], sw: 1.9 },

  // ---- home / discover headers ----
  crop: { paths: ['M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3'], sw: 2 },
  grid: { rects: [[4, 4, 7, 7, 1.5], [13, 4, 7, 7, 1.5], [4, 13, 7, 7, 1.5], [13, 13, 7, 7, 1.5]], sw: 1.8 },
  bolt: { paths: ['M13 3L5 13h6l-1 8 8-10h-6z'], sw: 2 },
  picture: { rects: [[4, 4, 16, 16, 3]], circles: [[9, 9, 1.35]], paths: ['M4.5 17l4-4 3 3 4-4.5 4 4.5'], sw: 1.9 },
  list: { paths: ['M8 7h12M8 12h12M8 17h12M3.5 7h.01M3.5 12h.01M3.5 17h.01'], sw: 2 },

  // ---- editor preferences ----
  prefTracks: { rects: [[3, 7, 18, 10, 2]], paths: ['M7 7v10M11 7v10M15 7v10'], sw: 1.8 },
  prefLinkage: { rects: [[3, 9, 11, 11, 2]], paths: ['M9 9V5a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2h-4'], sw: 1.8 },
  prefSnap: { rects: [[9, 9, 6, 6, 1]], paths: ['M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4'], sw: 1.8 },
  prefFps: { circles: [[8, 8, 4], [15, 13, 4]], sw: 1.8 },
  pencil: { paths: ['M4 20h4L18 10l-4-4L4 16zM14 6l4 4'], sw: 1.8 },

  // ---- selection action bar ----
  motion: { circles: [[12, 12, 8], [12, 12, 2.5]], sw: 1.8 },
  keyframe: { paths: ['M12 4l7 8-7 8-7-8z'], sw: 1.8 },
  curve: { paths: ['M5 19C6 11 13 6 19 5'], circles: [[5, 19, 1.8], [19, 5, 1.8]], sw: 1.8 },
  lock: { rects: [[5, 11, 14, 9, 2]], paths: ['M8 11V7.5a4 4 0 018 0V11'], sw: 1.8 },
  duplicate: { paths: ['M8 8h12v12H8z', 'M4 4h12v3', 'M4 4v12h3'], sw: 1.8 },

  // ---- text toolbar ----
  font: { paths: ['M5 19l5-14 5 14M7 14h6'], sw: 1.8 },
  fontsize: { paths: ['M3 18l3-9 3 9M4.2 15h3.6M12 18l4.5-12 4.5 12M13.5 14h6'], sw: 1.8 },
  format: { paths: ['M4 6h16M4 12h10M4 18h14'], sw: 1.8 },
  spacing: { paths: ['M5 4v16M5 4l-2.2 2.4M5 4l2.2 2.4M5 20l-2.2-2.4M5 20l2.2-2.4M10 7h10M10 12h10M10 17h10'], sw: 1.8 },
  style: { rects: [[3, 4, 18, 16, 3]], paths: ['M8 9h8M12 9v7'], sw: 1.8 },
  blending: { circles: [[9.5, 12, 5], [14.5, 12, 5]], sw: 1.8 },
  opacity: { circles: [[12, 12, 8]], paths: ['M12 4v16'], sw: 1.8 },
  position: { paths: ['M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3'], sw: 1.8 },
  mask: { rects: [[4, 4, 16, 16, 3]], circles: [[12, 12, 4.5]], sw: 1.8 },
  color: { circles: [[12, 12, 8], [12, 12, 3]], sw: 1.8 },
  keyboard: { rects: [[3, 6, 18, 12, 2]], paths: ['M7 10h.01M10.5 10h.01M14 10h.01M17 10h.01M7 13.5h.01M10.5 13.5h.01M14 13.5h.01M9 16.5h6'], sw: 1.8 },
} as const satisfies Record<string, IconSpec>;

export type VIconName = keyof typeof ICONS;

export interface VIconProps {
  /** catalogued icon */
  name?: VIconName;
  /** raw path escape hatch (data-driven glyphs); ignored when `name` is set */
  d?: string;
  circles?: Circ[];
  rects?: RectT[];
  size?: number;
  color?: string;
  /** override the spec's stroke/fill mode */
  mode?: 'stroke' | 'fill';
  strokeWidth?: number;
}

export function VIcon({
  name,
  d,
  circles,
  rects,
  size = 24,
  color = '#ffffff',
  mode,
  strokeWidth,
}: VIconProps) {
  const spec: IconSpec = name ? ICONS[name] : { paths: d ? [d] : [], circles, rects };
  const m = mode ?? spec.mode ?? 'stroke';
  const sw = strokeWidth ?? spec.sw ?? 2;
  const stroke = m === 'stroke' ? color : 'none';
  const fill = m === 'fill' ? color : 'none';

  return (
    <Svg
      width={size}
      height={size}
      viewBox={spec.vb ?? '0 0 24 24'}
      fill="none"
    >
      {spec.rects?.map((r, i) => (
        <Rect
          key={`r${i}`}
          x={r[0]}
          y={r[1]}
          width={r[2]}
          height={r[3]}
          rx={r[4]}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
        />
      ))}
      {spec.circles?.map((c, i) => (
        <Circle
          key={`c${i}`}
          cx={c[0]}
          cy={c[1]}
          r={c[2]}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
        />
      ))}
      {spec.paths?.map((p, i) => (
        <Path
          key={`p${i}`}
          d={p}
          stroke={stroke}
          strokeWidth={sw}
          fill={fill}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
