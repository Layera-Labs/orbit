/**
 * UploadPanel - Categorized cloud upload (Images / Videos / Audios)
 */
import * as React from 'react';
import { useState, useCallback, useRef } from 'react';
// import { OrbitButton } from '@layera-labs/ui';
import { useEditorStore } from '../../store';
import { createUploadProvider } from '../../upload';
import type { UploadConfig } from '../../store/types';
import type { OrbitEngine } from '@layera-labs/core';
import { useToast } from '../ToastProvider';

interface UploadPanelProps {
  engine: OrbitEngine | null;
  uploadConfig?: UploadConfig;
}

type UploadCategory = 'image' | 'video' | 'audio';

export const UploadPanel: React.FC<UploadPanelProps> = ({ uploadConfig }) => {
  const { addToast } = useToast();
  const [activeCategory, setActiveCategory] = useState<UploadCategory>('image');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadedImages = useEditorStore((s) => s.uploadedImages);
  const uploadedVideos = useEditorStore((s) => s.uploadedVideos);
  const uploadedAudios = useEditorStore((s) => s.uploadedAudios);
  const addUpload = useEditorStore((s) => s.addUpload);
  const removeUpload = useEditorStore((s) => s.removeUpload);
  const setIsUploading = useEditorStore((s) => s.setIsUploading);
  const setUploadProgress = useEditorStore((s) => s.setUploadProgress);

  const getUploads = (cat: UploadCategory) =>
    cat === 'image' ? uploadedImages : cat === 'video' ? uploadedVideos : uploadedAudios;

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !uploadConfig) return;
      const provider = createUploadProvider(uploadConfig);

      for (const file of Array.from(files)) {
        const typePrefix = activeCategory === 'image' ? 'image/' : activeCategory === 'video' ? 'video/' : 'audio/';
        if (!file.type.startsWith(typePrefix)) continue;

        setIsUploading(true);
        try {
          const result = await provider.upload(file, (progress) => setUploadProgress(progress));
          addUpload(activeCategory, {
            id: result.id,
            src: result.src,
            thumbnail: result.thumbnail,
            name: result.name,
            size: result.size,
            type: result.type,
            createdAt: new Date().toISOString(),
          });
          addToast(`${file.name} uploaded`, 'success');
        } catch (err) {
          addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
        }
      }
    },
    [activeCategory, uploadConfig, addUpload, setIsUploading, setUploadProgress, addToast]
  );

  const categories: { id: UploadCategory; label: string }[] = [
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
    { id: 'audio', label: 'Audios' },
  ];

  const uploads = getUploads(activeCategory);

  return (
    <div className="flex flex-col h-full">
      {/* Category Tabs */}
      <div className="flex border-b border-orbit-border">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`
              flex-1 px-orbit-sm py-orbit-sm text-xs font-medium transition-colors capitalize
              ${activeCategory === cat.id ? 'text-orbit-accent border-b-2 border-orbit-accent' : 'text-orbit-text-secondary hover:text-orbit-text'}
            `}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Drop Zone */}
      <div className="p-orbit-sm">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`
            flex flex-col items-center justify-center gap-2 rounded-orbit-md border-2 border-dashed p-orbit-lg transition-colors cursor-pointer
            ${isDragging ? 'border-orbit-accent bg-orbit-accent-subtle' : 'border-orbit-border bg-orbit-panel'}
          `}
        >
          <span className="text-xs text-orbit-text-secondary">
            Drop {activeCategory} files here or click to browse
          </span>
          {!uploadConfig && (
            <span className="text-[10px] text-orbit-danger">
              No upload provider configured
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={`${activeCategory}/*`}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Uploads Grid */}
      <div className="flex-1 overflow-auto px-orbit-sm pb-orbit-sm">
        {uploads.length === 0 && (
          <div className="py-orbit-sm text-xs text-orbit-text-tertiary text-center">
            No {activeCategory}s uploaded yet
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {uploads.map((asset) => (
            <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-orbit-md bg-orbit-panel">
              {asset.thumbnail ? (
                <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-orbit-text-tertiary">
                  {asset.type.split('/')[1]?.toUpperCase() || 'File'}
                </div>
              )}
              <button
                onClick={() => removeUpload(activeCategory, asset.id)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-orbit-danger text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
