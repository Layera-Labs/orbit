'use client';

import { OrbitEditor } from '@orbit/next';
import { UnsplashProvider, PexelsProvider } from '@orbit/assets';

const unsplashKey = process.env.NEXT_PUBLIC_UNSPLASH_KEY;
const pexelsKey = process.env.NEXT_PUBLIC_PEXELS_KEY;

export default function Home() {
  return (
    <main className="h-[100dvh] min-h-[100dvh] w-screen bg-slate-100">
      <OrbitEditor
        apiKey="orbit_sk_demo_key"
        backendUrl="https://api.orbit.ai"
        theme="orbit-light"
        config={{ width: 1080, height: 1080 }}
        providers={{
          photos: unsplashKey ? new UnsplashProvider(unsplashKey) : undefined,
          videos: pexelsKey ? new PexelsProvider(pexelsKey, 'videos') : undefined,
        }}
        uploadConfig={{
          // Example: custom presigned URL provider
          getPresignedUrl: async (file: File) => {
            // In production, call your backend to get a presigned URL
            console.log('Getting presigned URL for:', file.name);
            return {
              uploadUrl: 'https://example.com/upload',
              publicUrl: `https://cdn.example.com/${file.name}`,
            };
          },
        }}
        callbacks={{
          onExport: (blob: Blob, format: string) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export.${format}`;
            a.click();
            URL.revokeObjectURL(url);
          },
          onError: (err: Error) => console.error('Orbit Error:', err),
        }}
      />
    </main>
  );
}
