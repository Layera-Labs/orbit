import type { Document } from '@layera-labs/model';

export type ProviderKind =
  | 'photo'
  | 'video'
  | 'template'
  | 'font'
  | 'background'
  | 'asset';

export interface Provider {
  readonly id: string;
  readonly kind: ProviderKind;
}

export interface SearchOptions {
  page?: number;
  perPage?: number;
  orientation?: 'landscape' | 'portrait' | 'squarish';
  color?: string;
  orderBy?: 'relevant' | 'latest';
}

// ---- Photos / Videos / generic assets ----------------------------------

export interface Photo {
  id: string;
  src: string;
  thumbnail: string;
  width: number;
  height: number;
  alt?: string;
  author?: { name: string; url?: string };
  metadata?: Record<string, unknown>;
}

export interface Video {
  id: string;
  src: string;
  thumbnail: string;
  width: number;
  height: number;
  duration: number;
  metadata?: Record<string, unknown>;
}

export interface Asset {
  id: string;
  type: 'image' | 'video' | 'svg' | 'sticker' | 'shape';
  src: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

export interface PhotoProvider extends Provider {
  kind: 'photo';
  search(query: string, options?: SearchOptions): Promise<Photo[]>;
  getById(id: string): Promise<Photo>;
}

export interface VideoProvider extends Provider {
  kind: 'video';
  search(query: string, options?: SearchOptions): Promise<Video[]>;
  getById(id: string): Promise<Video>;
}

export interface AssetProvider extends Provider {
  kind: 'asset';
  search(query: string, options?: SearchOptions): Promise<Asset[]>;
  getById?(id: string): Promise<Asset>;
}

// ---- Templates ----------------------------------------------------------

export interface TemplateSummary {
  id: string;
  name: string;
  thumbnail: string;
  width: number;
  height: number;
  category?: string;
  tags?: string[];
}

export interface TemplateListOptions {
  category?: string;
  query?: string;
  page?: number;
  perPage?: number;
}

export interface TemplateProvider extends Provider {
  kind: 'template';
  list(options?: TemplateListOptions): Promise<TemplateSummary[]>;
  /** Returns a ready-to-load Orbit Document. */
  getDocument(id: string): Promise<Document>;
  categories?(): Promise<string[]>;
}

// ---- Fonts --------------------------------------------------------------

export interface FontItem {
  family: string;
  weights?: number[];
  category?: string;
  previewUrl?: string;
}

export interface FontListOptions {
  query?: string;
  category?: string;
}

export interface FontProvider extends Provider {
  kind: 'font';
  list(options?: FontListOptions): Promise<FontItem[]>;
  /** Inject the font (e.g. @font-face / FontFace API) so it can render. */
  load(family: string, weights?: number[]): Promise<void>;
}

// ---- Backgrounds --------------------------------------------------------

export interface BackgroundItem {
  id: string;
  type: 'solid' | 'gradient' | 'pattern' | 'image';
  /** color for solid, css for gradient, patternId for pattern, src for image */
  value: string;
  thumbnail?: string;
}

export interface BackgroundListOptions {
  type?: BackgroundItem['type'];
  query?: string;
}

export interface BackgroundProvider extends Provider {
  kind: 'background';
  list(options?: BackgroundListOptions): Promise<BackgroundItem[]>;
}

// ---- Storage / Publish seams (web2 now, web3 later) --------------------

/** Where exported blobs / assets persist. web2 = HTTP, web3 = IPFS later. */
export interface StorageProvider {
  put(blob: Blob, meta?: Record<string, unknown>): Promise<{ uri: string }>;
  get(uri: string): Promise<Blob>;
}

export interface PublishResult {
  url?: string;
  uri?: string;
  id?: string;
  [key: string]: unknown;
}

/** Publish/export target. web2 = onPublish callback, web3 = mint later. */
export interface PublishTarget {
  readonly id: string;
  publish(doc: Document, meta?: Record<string, unknown>): Promise<PublishResult>;
}

export type AnyProvider =
  | PhotoProvider
  | VideoProvider
  | AssetProvider
  | TemplateProvider
  | FontProvider
  | BackgroundProvider;

export interface ProviderMap {
  photos?: PhotoProvider;
  videos?: VideoProvider;
  templates?: TemplateProvider;
  fonts?: FontProvider;
  backgrounds?: BackgroundProvider;
  assets?: AssetProvider;
}
