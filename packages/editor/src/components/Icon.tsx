import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  ArrowUpRight,
  Baseline,
  Blend,
  Bold,
  BoxSelect,
  ChevronDown,
  Code,
  Contrast,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  GripHorizontal,
  Group,
  House,
  Image as ImageIcon,
  Italic,
  Layers,
  LayoutTemplate,
  Lock,
  LockOpen,
  type LucideIcon,
  Minus,
  Palette,
  Plus,
  Scaling,
  Search,
  Shapes,
  Sparkles,
  Spline,
  StretchHorizontal,
  StretchVertical,
  Trash2,
  Type,
  Underline,
  Upload,
  X,
} from 'lucide-react';

/** Maps Orbit's icon names to Lucide components. Keeps the <Icon name/> API. */
const MAP = {
  home: House,
  template: LayoutTemplate,
  shapes: Shapes,
  text: Type,
  image: ImageIcon,
  palette: Palette,
  font: Type,
  layers: Layers,
  upload: Upload,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  alignLeft: AlignLeft,
  alignCenter: AlignCenter,
  alignRight: AlignRight,
  distributeH: AlignHorizontalDistributeCenter,
  distributeV: AlignVerticalDistributeCenter,
  code: Code,
  copy: Copy,
  lock: Lock,
  unlock: LockOpen,
  trash: Trash2,
  plus: Plus,
  minus: Minus,
  chevronDown: ChevronDown,
  close: X,
  search: Search,
  eye: Eye,
  eyeOff: EyeOff,
  group: Group,
  export: Download,
  sparkle: Sparkles,
  shadow: BoxSelect,
  spacing: Baseline,
  corner: Spline,
  opacity: Contrast,
  blend: Blend,
  crop: Crop,
  stripH: StretchHorizontal,
  stripV: StretchVertical,
  arrow: ArrowUpRight,
  dots: GripHorizontal,
  resize: Scaling,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof MAP;

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
  /** Accepted for API compatibility; Lucide icons are stroked. */
  filled?: boolean;
}

export function Icon({ name, size = 18, strokeWidth = 1.9, style, className }: IconProps) {
  const Cmp = MAP[name] ?? Shapes;
  return <Cmp size={size} strokeWidth={strokeWidth} style={style} className={className} aria-hidden />;
}
