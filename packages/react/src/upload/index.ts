import type { UploadProvider, UploadResult } from './types';
import { CloudinaryUploadProvider } from './cloudinary';
import { SupabaseUploadProvider } from './supabase';
import { CustomPresignedUploadProvider } from './custom';
import type { UploadConfig } from '../store/types';

export function createUploadProvider(config: UploadConfig): UploadProvider {
  if (config.getPresignedUrl) {
    const getUrl = (file: File) => config.getPresignedUrl!(file, 'image');
    return new CustomPresignedUploadProvider({ getPresignedUrl: getUrl });
  }

  if (config.provider === 'cloudinary' && config.cloudinary) {
    return new CloudinaryUploadProvider(config.cloudinary);
  }

  if (config.provider === 'supabase' && config.supabase) {
    return new SupabaseUploadProvider(config.supabase);
  }

  // S3 provider falls back to presigned URL pattern for security
  throw new Error(
    'No valid upload provider configured. Please provide either getPresignedUrl, cloudinary config, or supabase config.'
  );
}

export type { UploadProvider, UploadResult, UploadConfig };
export { CloudinaryUploadProvider, SupabaseUploadProvider, CustomPresignedUploadProvider };
