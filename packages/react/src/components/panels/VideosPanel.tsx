/**
 * VideosPanel - Browse video clips from asset providers
 */
import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { OrbitInput, OrbitLoading } from '@layera-labs/ui';
import type { AssetProvider, Asset } from '@layera-labs/shared';

interface VideosPanelProps {
  videoProvider?: AssetProvider;
  onAddVideo?: (src: string, width: number, height: number, duration: number) => void;
  onClose?: () => void;
}

export const VideosPanel: React.FC<VideosPanelProps> = ({ videoProvider, onAddVideo, onClose }) => {
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!videoProvider || !searchQuery.trim()) {
        setVideos([]);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const results = await videoProvider.search(searchQuery, { perPage: 12 });
        setVideos(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setVideos([]);
      } finally {
        setIsLoading(false);
      }
    },
    [videoProvider]
  );

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => performSearch(value), 400);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-orbit-sm">
        <OrbitInput
          type="text"
          placeholder={videoProvider ? 'Search videos...' : 'No video provider configured'}
          value={query}
          onChange={handleQueryChange}
          disabled={!videoProvider}
          className="h-8 text-xs"
        />
      </div>

      <div className="flex-1 overflow-auto px-orbit-sm pb-orbit-sm">
        {isLoading && (
          <div className="flex items-center justify-center py-orbit-lg">
            <OrbitLoading variant="dots" size="sm" />
          </div>
        )}
        {error && <div className="py-orbit-sm text-xs text-orbit-danger">{error}</div>}
        {!isLoading && !error && videos.length === 0 && query.trim() && (
          <div className="py-orbit-sm text-xs text-orbit-text-tertiary">No results</div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {videos.map((video) => (
            <button
              key={video.id}
              onClick={() => {
                onAddVideo?.(video.src, video.width || 640, video.height || 360, video.duration || 10);
                onClose?.();
              }}
              className="group relative aspect-video overflow-hidden rounded-orbit-md bg-orbit-panel text-left"
            >
              {video.thumbnail ? (
                <img src={video.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-orbit-text-tertiary">
                  Video
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                <span className="text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  Add
                </span>
              </div>
              {video.duration && (
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  {Math.round(video.duration)}s
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
