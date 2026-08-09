import { OrbitEditor } from '@layera-labs/react';
import { UnsplashProvider, PexelsProvider } from '@layera-labs/assets';

// Set these in your .env file:
// VITE_UNSPLASH_KEY=your_unsplash_key
// VITE_PEXELS_KEY=your_pexels_key
const unsplashKey = (import.meta as any).env?.VITE_UNSPLASH_KEY;
const pexelsKey = (import.meta as any).env?.VITE_PEXELS_KEY;

function App() {
  return (
    <div className="h-[100dvh] min-h-[100dvh] w-screen bg-slate-100">
      <OrbitEditor
        apiKey="orbit_sk_demo_key"
        backendUrl="https://api.example.com"
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
          onExport: (blob, format) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export.${format}`;
            a.click();
            URL.revokeObjectURL(url);
          },
          onError: (err) => console.error('Orbit Error:', err),
        }}
      />
    </div>
  );
}

export default App;
