import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { OrbitInput, OrbitButton, OrbitLoading } from '@orbit/ui';
import type { AssetProvider, Asset } from '@orbit/shared';

interface AssetsPanelProps {
  photoProvider?: AssetProvider;
  videoProvider?: AssetProvider;
  onAddImage: (src: string, width: number, height: number) => void;
  onAddVideo?: (src: string, width: number, height: number, duration: number) => void;
}

type AssetTab = 'photos' | 'videos' | 'upload';

export const AssetsPanel: React.FC<AssetsPanelProps> = ({
  photoProvider,
  videoProvider,
  onAddImage,
  onAddVideo,
}) => {
  const [activeTab, setActiveTab] = useState<AssetTab>('photos');
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string, tab: AssetTab) => {
      const provider = tab === 'photos' ? photoProvider : videoProvider;
      if (!provider || !searchQuery.trim()) {
        setAssets([]);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const results = await provider.search(searchQuery, { perPage: 12 });
        setAssets(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setAssets([]);
      } finally {
        setIsLoading(false);
      }
    },
    [photoProvider, videoProvider]
  );

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      searchTimeoutRef.current = setTimeout(() => {
        performSearch(value, activeTab);
      }, 400);
    },
    [activeTab, performSearch]
  );

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleAssetClick = useCallback(
    (asset: Asset) => {
      if (asset.type === 'image' && asset.src) {
        onAddImage(asset.src, asset.width || 800, asset.height || 600);
      } else if (asset.type === 'video' && asset.src) {
        onAddVideo?.(asset.src, asset.width || 640, asset.height || 360, asset.duration || 10);
      }
    },
    [onAddImage, onAddVideo]
  );

  const tabs: { id: AssetTab; label: string; enabled: boolean }[] = [
    { id: 'photos', label: 'Photos', enabled: !!photoProvider },
    { id: 'videos', label: 'Videos', enabled: !!videoProvider },
    { id: 'upload', label: 'Upload', enabled: true },
  ];

  const activeProvider = activeTab === 'photos' ? photoProvider : videoProvider;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-orbit-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (!tab.enabled) return;
              setActiveTab(tab.id);
              setAssets([]);
              setError(null);
            }}
            className={`
              flex-1 px-orbit-sm py-orbit-sm text-xs font-medium transition-colors
              ${activeTab === tab.id ? 'text-orbit-accent border-b-2 border-orbit-accent' : 'text-orbit-text-secondary hover:text-orbit-text'}
              ${!tab.enabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {activeTab !== 'upload' && (
        <div className="p-orbit-sm">
          <OrbitInput
            type="text"
            placeholder={activeProvider ? `Search ${activeTab}...` : 'No provider configured'}
            value={query}
            onChange={handleQueryChange}
            disabled={!activeProvider}
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto px-orbit-sm pb-orbit-sm">
        {activeTab === 'upload' && (
          <UploadDropZone onAddImage={onAddImage} onAddVideo={onAddVideo} />
        )}

        {activeTab !== 'upload' && (
          <>
            {isLoading && (
              <div className="flex items-center justify-center py-orbit-lg">
                <OrbitLoading variant="dots" size="sm" />
              </div>
            )}

            {error && (
              <div className="py-orbit-sm text-xs text-orbit-danger">{error}</div>
            )}

            {!isLoading && !error && assets.length === 0 && query.trim() && (
              <div className="py-orbit-sm text-xs text-orbit-text-tertiary">No results</div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/orbit-asset', JSON.stringify(asset));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => handleAssetClick(asset)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-orbit-md bg-orbit-panel hover:ring-2 hover:ring-orbit-accent transition-all"
                >
                  {asset.thumbnail || asset.src ? (
                    <img
                      src={asset.thumbnail || asset.src}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-orbit-text-tertiary">
                      No preview
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function UploadDropZone({
  onAddImage,
  onAddVideo,
}: {
  onAddImage: (src: string, width: number, height: number) => void;
  onAddVideo?: (src: string, width: number, height: number, duration: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          if (!src) return;
          if (file.type.startsWith('image/')) {
            const img = new Image();
            img.onload = () => {
              onAddImage(src, img.naturalWidth, img.naturalHeight);
            };
            img.src = src;
          } else if (file.type.startsWith('video/') && onAddVideo) {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
              onAddVideo(src, video.videoWidth || 1280, video.videoHeight || 720, video.duration || 10);
            };
            video.src = src;
          }
        };
        reader.readAsDataURL(file);
      });
    },
    [onAddImage, onAddVideo]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`
        flex flex-col items-center justify-center gap-2 rounded-orbit-md border-2 border-dashed p-orbit-lg transition-colors
        ${isDragging ? 'border-orbit-accent bg-orbit-accent-subtle' : 'border-orbit-border bg-orbit-panel'}
      `}
    >
      <span className="text-xs text-orbit-text-secondary">Drag & drop images or videos here</span>
      <span className="text-xs text-orbit-text-tertiary">or</span>
      <OrbitButton
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        Browse files
      </OrbitButton>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
