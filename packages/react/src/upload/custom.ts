import type { UploadProvider, UploadResult } from './types';

interface CustomPresignedConfig {
  getPresignedUrl: (file: File) => Promise<{ uploadUrl: string; publicUrl: string }>;
}

export class CustomPresignedUploadProvider implements UploadProvider {
  constructor(private config: CustomPresignedConfig) {}

  async upload(file: File, onProgress?: (progress: number) => void): Promise<UploadResult> {
    const { uploadUrl, publicUrl } = await this.config.getPresignedUrl(file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            id: `${Date.now()}-${file.name}`,
            src: publicUrl,
            thumbnail: publicUrl,
            name: file.name,
            size: file.size,
            type: file.type,
          });
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }
}
