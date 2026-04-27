import type { UploadProvider, UploadResult } from './types';

interface SupabaseConfig {
  url: string;
  anonKey: string;
  bucket: string;
}

export class SupabaseUploadProvider implements UploadProvider {
  constructor(private config: SupabaseConfig) {}

  async upload(file: File, onProgress?: (progress: number) => void): Promise<UploadResult> {
    const path = `${Date.now()}-${file.name}`;
    const uploadUrl = `${this.config.url}/storage/v1/object/${this.config.bucket}/${path}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const publicUrl = `${this.config.url}/storage/v1/object/public/${this.config.bucket}/${path}`;
          resolve({
            id: path,
            src: publicUrl,
            thumbnail: publicUrl,
            name: file.name,
            size: file.size,
            type: file.type,
          });
        } else {
          reject(new Error(`Supabase upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Supabase upload failed')));
      xhr.open('POST', uploadUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${this.config.anonKey}`);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }
}
