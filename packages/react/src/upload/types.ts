export interface UploadResult {
  id: string;
  src: string;
  thumbnail?: string;
  name: string;
  size: number;
  type: string;
}

export interface UploadProvider {
  upload(file: File, onProgress?: (progress: number) => void): Promise<UploadResult>;
}
