import type { StateCreator } from 'zustand';
import type { UploadedAsset } from '../types';

export interface UploadSlice {
  uploadedImages: UploadedAsset[];
  uploadedVideos: UploadedAsset[];
  uploadedAudios: UploadedAsset[];
  isUploading: boolean;
  uploadProgress: number;

  addUpload: (category: 'image' | 'video' | 'audio', asset: UploadedAsset) => void;
  removeUpload: (category: 'image' | 'video' | 'audio', id: string) => void;
  setUploads: (category: 'image' | 'video' | 'audio', assets: UploadedAsset[]) => void;
  setIsUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
}

const categoryKey = (c: 'image' | 'video' | 'audio') =>
  c === 'image' ? 'uploadedImages' : c === 'video' ? 'uploadedVideos' : 'uploadedAudios';

export const createUploadSlice: StateCreator<UploadSlice> = (set) => ({
  uploadedImages: [],
  uploadedVideos: [],
  uploadedAudios: [],
  isUploading: false,
  uploadProgress: 0,

  addUpload: (category, asset) =>
    set((s) => ({
      [categoryKey(category)]: [asset, ...(s as unknown as Record<string, UploadedAsset[]>)[categoryKey(category)]],
    } as unknown as Partial<UploadSlice>)),

  removeUpload: (category, id) =>
    set((s) => ({
      [categoryKey(category)]: (s as unknown as Record<string, UploadedAsset[]>)[categoryKey(category)].filter(
        (a) => a.id !== id
      ),
    } as unknown as Partial<UploadSlice>)),

  setUploads: (category, assets) =>
    set({ [categoryKey(category)]: assets } as unknown as Partial<UploadSlice>),

  setIsUploading: (uploading) => set({ isUploading: uploading }),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
});
