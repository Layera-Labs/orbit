import type { ViewportState, BackgroundProps, SceneGraph } from '@layera-labs/shared';

// ===== Upload =====
export interface UploadedAsset {
  id: string;
  src: string;
  thumbnail?: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
}

// ===== Designs =====
export interface DesignMeta {
  id: string;
  name: string;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  layerCount: number;
}

export interface DesignData {
  id: string;
  name: string;
  scene: SceneGraph;
  pages?: SceneGraph[];
  activePageIndex?: number;
  viewport: ViewportState;
  background: BackgroundProps;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
}

export interface DesignBackend {
  list(search?: string, sort?: 'name' | 'date' | 'updated'): Promise<DesignMeta[]>;
  get(id: string): Promise<DesignData | null>;
  save(data: DesignData): Promise<DesignMeta>;
  delete(id: string): Promise<void>;
}

export type SortOption = 'name' | 'date' | 'updated';

// ===== AI =====
export type AIMode = 'image' | 'video' | 'audio';
export type AISubMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'text-to-audio';

export interface AIState {
  mode: AIMode;
  subMode: AISubMode;
  prompt: string;
  referenceImage: string | null;
  strength: number;
  duration: number;
  resolution: string;
  model: string;
  isGenerating: boolean;
  results: Array<{ id: string; src: string; thumbnail?: string }>;
}

// ===== Upload Config =====
export interface UploadConfig {
  getPresignedUrl?: (
    file: File,
    category: 'image' | 'video' | 'audio'
  ) => Promise<{ uploadUrl: string; publicUrl: string }>;
  provider?: 's3' | 'cloudinary' | 'supabase' | 'custom';
  s3?: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  cloudinary?: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    uploadPreset: string;
  };
  supabase?: {
    url: string;
    anonKey: string;
    bucket: string;
  };
}

// ===== Auto Save =====
export interface AutoSaveConfig {
  enabled?: boolean;
  debounceMs?: number;
  onSave?: (design: DesignData) => Promise<DesignMeta>;
}
