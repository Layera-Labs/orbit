/**
 * Core types for Orbit SDK
 */

// ===== Theme =====
export interface OrbitTheme {
  id: string;
  name: string;
  variables: Record<string, string>;
}

// ===== Canvas =====
export type LayerType = 'image' | 'text' | 'shape' | 'video' | 'audio' | 'group';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface Layer {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  effects: Effect[];
  transitionIn?: Transition;
  transitionOut?: Transition;
  content: ImageContent | TextContent | ShapeContent | VideoContent | AudioContent | GroupContent;
}

export interface ImageContent {
  type: 'image';
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface TextContent {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  alignment: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  decoration?: 'none' | 'underline' | 'line-through';
}

export interface ShapeContent {
  type: 'shape';
  shape: 'rectangle' | 'circle' | 'triangle' | 'star' | 'polygon' | 'line' | 'arrow' | 'path';
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
  sides?: number; // For polygon/star
  pathData?: string; // SVG path data for 'path' shape
}

export interface VideoContent {
  type: 'video';
  src: string;
  duration: number;
  currentTime?: number;
  volume?: number;
  muted?: boolean;
  loop?: boolean;
  autoplay?: boolean;
}

export interface AudioContent {
  type: 'audio';
  src: string;
  duration: number;
  volume?: number;
  muted?: boolean;
  loop?: boolean;
  trim?: { start: number; end: number };
}

export interface GroupContent {
  type: 'group';
  children: Layer[];
}

export interface Effect {
  id: string;
  type: string;
  params: Record<string, unknown>;
  visible: boolean;
}

export type TransitionType =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'none';

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface Transition {
  type: TransitionType;
  duration: number; // seconds
  easing: EasingType;
}

export interface SceneGraph {
  root: Layer[];
  background: BackgroundProps;
  width: number;
  height: number;
}

export interface BackgroundProps {
  type: 'solid' | 'gradient' | 'pattern' | 'image';
  value: string;
  gradientType?: 'linear' | 'radial';
  gradientAngle?: number;
  gradientStops?: Array<{ offset: number; color: string }>;
}

// ===== Configuration =====
export interface OrbitConfig {
  apiKey: string;
  backendUrl?: string;
  theme?: string | OrbitTheme;
  ui?: UIConfiguration;
  features?: Partial<FeatureFlags>;
  providers?: AssetProviders;
  watermark?: WatermarkConfiguration;
  callbacks?: OrbitCallbacks;
  canvas?: CanvasConfiguration;
}

export interface UIConfiguration {
  leftSidebar?: SidebarConfig;
  topToolbar?: ToolbarConfig;
  rightPanel?: RightPanelConfig;
  bottomBar?: BottomBarConfig;
}

export interface SidebarConfig {
  visible?: boolean;
  defaultOpen?: boolean;
  defaultTab?: string;
  items?: SidebarItem[];
}

export type SidebarItem =
  | { id: string; icon: string; label: string; visible?: boolean }
  | { id: string; label: string; component: unknown; visible?: boolean };

export interface ToolbarConfig {
  visible?: boolean;
  items?: ToolbarItem[];
}

export type ToolbarItem =
  | { id: string; type: 'action'; icon: string; label?: string; shortcut?: string; visible?: boolean }
  | { id: string; type: 'menu'; label: string; items?: unknown[]; visible?: boolean }
  | { id: string; type: 'spacer'; visible?: boolean }
  | { id: string; type: 'custom'; component: unknown; visible?: boolean };

export interface RightPanelConfig {
  visible?: boolean;
  defaultTab?: 'agentic' | 'manually';
  tabs?: TabItem[];
  manualSections?: ManualSection[];
}

export interface TabItem {
  id: string;
  label: string;
  icon: string;
  visible?: boolean;
}

export type ManualSection =
  | 'ai-edit'
  | 'change-region'
  | 'annotate'
  | 'crop-expand'
  | 'adjustments'
  | 'lighting'
  | 'typography'
  | 'arrange'
  | 'effects'
  | 'layers-mini';

export interface BottomBarConfig {
  visible?: boolean;
  zoomControls?: boolean;
  addPageButton?: boolean;
  pageIndicator?: boolean;
}

export interface FeatureFlags {
  agentic: boolean;
  draw: boolean;
  video: boolean;
  collaboration: boolean;
  history: boolean;
  layers: boolean;
  export: boolean;
  import: boolean;
  templates: boolean;
}

export interface AssetProviders {
  photos?: AssetProvider;
  videos?: AssetProvider;
  icons?: AssetProvider;
  stickers?: AssetProvider;
  backgrounds?: AssetProvider;
}

export interface WatermarkConfiguration {
  canvas?: WatermarkOptions | null;
  export?: WatermarkOptions | null;
}

export interface WatermarkOptions {
  type: 'text' | 'image';
  content: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity: number;
  fontSize?: number;
  color?: string;
  padding?: number;
}

export interface OrbitCallbacks {
  onReady?: () => void;
  onExport?: (blob: Blob, format: string) => void;
  onError?: (error: OrbitError) => void;
  onLayerSelect?: (layer: Layer | null) => void;
  onLayerUpdate?: (layer: Layer) => void;
  onThemeChange?: (theme: OrbitTheme) => void;
  onZoomChange?: (zoom: number) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export interface CanvasConfiguration {
  width?: number;
  height?: number;
  background?: BackgroundProps;
  showGrid?: boolean;
  gridSize?: number;
  gridColor?: string;
  showRulers?: boolean;
  snapToGrid?: boolean;
  snapToGuides?: boolean;
  multiSelect?: boolean;
}

// ===== Assets =====
export interface Asset {
  id: string;
  type: 'image' | 'video' | 'icon' | 'shape';
  src: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  page?: number;
  perPage?: number;
  orientation?: 'landscape' | 'portrait' | 'squarish';
  color?: string;
  orderBy?: 'relevant' | 'latest';
}

export interface AssetProvider {
  id: string;
  search(query: string, options?: SearchOptions): Promise<Asset[]>;
  getById(id: string): Promise<Asset>;
}

// ===== AI / Agentic =====
export interface GeneratedAsset {
  id: string;
  src: string;
  width: number;
  height: number;
  format: string;
  metadata?: Record<string, unknown>;
}

export interface GenerateParams {
  prompt: string;
  imageBase64?: string;
  maskBase64?: string;
  model?: string;
  options?: Record<string, unknown>;
}

export interface InpaintParams extends GenerateParams {
  maskBase64: string;
}

export interface OutpaintParams extends GenerateParams {
  ratio: string;
  expandPrompt?: string;
}

export interface LightingParams {
  imageBase64: string;
  lights: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    color: string;
    brightness: number;
  }>;
}

export type ModelProvider = 'gpt-4o' | 'gemini-pro' | 'flux-2-klein' | 'flux-inpaint';

export interface ImageToImageParams {
  prompt: string;
  imageBase64: string;
  strength?: number;
  model?: string;
  options?: Record<string, unknown>;
}

export interface VideoGenerateParams {
  prompt: string;
  imageBase64?: string;
  duration?: number;
  resolution?: string;
  model?: string;
  options?: Record<string, unknown>;
}

export interface AudioGenerateParams {
  prompt: string;
  duration?: number;
  model?: string;
  options?: Record<string, unknown>;
}

// ===== Export =====
export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf' | 'gif' | 'mp4' | 'mp3' | 'png-sequence';

export interface ExportOptions {
  format: ExportFormat;
  quality?: number;
  scale?: number;
  pages?: string[];
  trim?: { start: number; end: number };
  watermark?: WatermarkOptions | null;
}

export interface VideoExportOptions {
  format: 'mp4' | 'gif' | 'png-sequence' | 'mp3';
  duration: number;
  fps: number;
  scale: number;
  resolution: '480p' | '720p' | '1080p' | '2k' | '4k';
  width: number;
  height: number;
  trim?: { start: number; end: number };
  quality: 'draft' | 'production' | 'max';
  codec?: 'h264' | 'h265' | 'vp9';
  audioMix?: boolean;
  watermark?: WatermarkOptions | null;
  callbackUrl?: string;
}

export interface AudioTrackSource {
  src: string;
  volume: number;
  muted: boolean;
  loop: boolean;
  trimStart: number;
  trimEnd: number;
  offset: number; // seconds from timeline start
}

export interface AudioExportOptions {
  format: 'mp3' | 'wav';
  duration: number;
  sampleRate?: number;
  bitrate?: number; // kbps for mp3
  tracks: AudioTrackSource[];
}

export interface ExportJob {
  jobId: string;
  status: 'pending' | 'uploading' | 'queued' | 'processing' | 'done' | 'failed' | 'cancelled';
  progress: number;
  stage?: 'capturing' | 'uploading' | 'encoding' | 'mixing_audio' | 'uploading_output';
  message?: string;
  url?: string;
  permanentUrl?: string;
  fileSize?: number;
  duration?: number;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportInitResponse {
  jobId: string;
  status: 'pending';
  frameUploadUrls?: string[];
  uploadUrl?: string;
  statusUrl: string;
  eventsUrl: string;
  expiresAt: string;
}

export interface ExportListResponse {
  exports: ExportJob[];
  total: number;
  quotaUsed: number;
  quotaTotal: number;
}

// ===== Events =====
export type OrbitEvent =
  | 'selectionChange'
  | 'layerUpdate'
  | 'historyChange'
  | 'themeChange'
  | 'zoomChange'
  | 'canvasChange'
  | 'toolChange'
  | 'error';

export interface OrbitError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ===== Tools =====
export type ToolType = 'select' | 'brush' | 'highlighter' | 'text' | 'shape' | 'crop' | 'pan' | 'zoom' | 'vector';

export interface ToolOptions {
  strokeWidth?: number;
  color?: string;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
}

// ===== Keyboard =====
export interface KeyboardShortcut {
  key: string;
  modifiers: string[];
  description: string;
}

// ===== Viewport =====
export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
}

// ===== History =====
export interface HistoryState {
  past: unknown[];
  present: unknown;
  future: unknown[];
}

// ===== Templates =====
export interface Template {
  id: string;
  name: string;
  thumbnail: string;
  category: string;
  tags: string[];
  aspectRatio: number;
  canvasState: unknown;
  width: number;
  height: number;
}
