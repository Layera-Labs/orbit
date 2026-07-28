/**
 * Orbit document model types.
 *
 * Design goals:
 * - The `type` discriminant lives ON the element (not in a nested `content`
 *   object) so renderers can `switch (el.type)` with no casts.
 * - Every shape is plain JSON-serializable data: a template IS a `Document`.
 * - No DOM / framework types leak in here — the model runs headless in Node.
 */

export type ID = string;

export type ElementType =
  | 'text'
  | 'image'
  | 'svg'
  | 'shape'
  | 'line'
  | 'group'
  | 'video'
  | 'audio'
  | 'qr';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'star' | 'polygon';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** Crop rectangle expressed as fractions (0..1) of the source image. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Optional pointer to where an asset came from. The `uri` field is the seam
 * for web3 later (ipfs://, ar://, on-chain refs) — web2 leaves it undefined.
 */
export interface AssetRef {
  provider: string;
  id: string;
  uri?: string;
}

/** Drop shadow, serializable. Presence implies enabled. */
export interface Shadow {
  color: string;
  blur: number;
  opacity: number; // 0..1
  offsetX: number;
  offsetY: number;
}

/** Serializable animation/transition data (engine objects are derived from this). */
export interface Animation {
  type: string;
  duration: number;
  delay?: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  enter?: boolean;
  exit?: boolean;
}

/** Properties shared by every element. */
export interface BaseElement {
  id: ID;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  shadow?: Shadow;
  blur?: number; // gaussian blur radius in px
  animations?: Animation[];
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  fill: string;
  align: TextAlign;
  lineHeight?: number;
  letterSpacing?: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  crop?: Crop;
  cornerRadius?: number;
  stroke?: string;
  strokeWidth?: number;
  assetRef?: AssetRef;
}

export interface SvgElement extends BaseElement {
  type: 'svg';
  src: string;
  keepRatio?: boolean;
  /** Map original colors -> replacement colors for recoloring SVGs. */
  recolor?: Record<string, string>;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
  /** Number of points/sides for star and polygon. */
  points?: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  points: number[]; // flat [x1,y1,x2,y2,...]
  stroke: string;
  strokeWidth: number;
  dash?: number[];
  arrow?: boolean; // draw an arrowhead at the end
}

export interface GroupElement extends BaseElement {
  type: 'group';
  children: Element[];
}

export interface VideoElement extends BaseElement {
  type: 'video';
  src: string;
  duration: number;
  volume?: number;
  muted?: boolean;
  assetRef?: AssetRef;
}

export interface AudioElement extends BaseElement {
  type: 'audio';
  src: string;
  duration: number;
  volume?: number;
  assetRef?: AssetRef;
}

export interface QrElement extends BaseElement {
  type: 'qr';
  value: string; // encoded content
  fgColor: string;
  bgColor: string;
}

export type Element =
  | TextElement
  | ImageElement
  | SvgElement
  | ShapeElement
  | LineElement
  | GroupElement
  | VideoElement
  | AudioElement
  | QrElement;

/** Background fill for a page. */
export type Background =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; css: string }
  | { type: 'pattern'; patternId: string; color?: string }
  | { type: 'image'; src: string; assetRef?: AssetRef };

export interface Page {
  id: ID;
  /** Optional page title, shown in the pages overview. */
  name?: string;
  width: number;
  height: number;
  background: Background;
  children: Element[]; // z-order == array order (index 0 is bottom)
  /** Optional page duration in seconds for animated/video pages. */
  duration?: number;
}

/** A font the document depends on, recorded for export/embedding. */
export interface FontRef {
  family: string;
  weights?: number[];
  url?: string;
}

export interface Document {
  id: ID;
  schemaVersion: 2;
  width: number; // default page size
  height: number;
  unit: 'px';
  pages: Page[];
  fonts: FontRef[];
}

/** Viewport (zoom/pan) state — derived UI state, not part of the document. */
export interface Viewport {
  zoom: number; // 1 == 100%
  x: number;
  y: number;
}

/** Full reactive editor state held in the Valtio proxy. */
export interface EditorState {
  doc: Document;
  activePageId: ID;
  selection: ID[];
  viewport: Viewport;
}

export type EditorEvent =
  | 'change'
  | 'selectionChange'
  | 'historyChange'
  | 'pageChange';

/** Convenience: a partial element where only `type` is required to create one. */
export type NewElement = Partial<Element> & { type: ElementType };

/**
 * Declarative, serializable canvas actions. This is the seam for agentic / AI
 * edits: an AI returns a list of CanvasActions and the store applies them
 * atomically (and undoably) via `applyAction`.
 */
export type CanvasAction =
  | { op: 'addElement'; element: NewElement; pageId?: ID }
  | { op: 'updateElement'; id: ID; patch: Partial<Element> }
  | { op: 'removeElement'; id: ID }
  | { op: 'duplicateElement'; id: ID }
  | { op: 'setBackground'; background: Background; pageId?: ID }
  | { op: 'resizePage'; width: number; height: number; pageId?: ID }
  | { op: 'select'; ids: ID[] }
  | { op: 'addPage'; page?: Partial<Page> };
