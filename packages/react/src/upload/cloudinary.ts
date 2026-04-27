import type { UploadProvider, UploadResult } from './types';

interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
  apiKey?: string;
}

export class CloudinaryUploadProvider implements UploadProvider {
  constructor(private config: CloudinaryConfig) {}

  async upload(file: File, onProgress?: (progress: number) => void): Promise<UploadResult> {
    const url = `https://api.cloudinary.com/v1_1/${this.config.cloudName}/auto/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.config.uploadPreset);
    if (this.config.apiKey) {
      formData.append('api_key', this.config.apiKey);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          resolve({
            id: data.public_id,
            src: data.secure_url,
            thumbnail: data.thumbnail_url || data.secure_url,
            name: file.name,
            size: file.size,
            type: file.type,
          });
        } else {
          reject(new Error(`Cloudinary upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Cloudinary upload failed')));
      xhr.open('POST', url);
      xhr.send(formData);
    });
  }
}
