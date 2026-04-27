import type { UploadProvider, UploadResult } from './types';

interface S3Config {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3UploadProvider implements UploadProvider {
  constructor(_config: S3Config) {}

  async upload(_file: File, _onProgress?: (progress: number) => void): Promise<UploadResult> {
    throw new Error(
      'Direct S3 client upload is not recommended for security. ' +
      'Please use UploadConfig.getPresignedUrl() instead, where your backend signs a temporary upload URL.'
    );
  }
}
