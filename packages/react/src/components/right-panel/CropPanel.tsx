import * as React from 'react';
import { useState, useCallback } from 'react';
import type { OrbitEngine } from '@layera-labs/orbit-core';
import { useOrbitLayers } from '../../hooks/useOrbitEngine';
import { useToast } from '../ToastProvider';

interface CropPanelProps {
  engine: OrbitEngine | null;
}

type AspectRatio = 'original' | '1:1' | '4:3' | '16:9' | '3:2' | '9:16' | 'custom';

export const CropPanel: React.FC<CropPanelProps> = ({ engine }) => {
  const { layers, selectedIds } = useOrbitLayers(engine);
  const { addToast } = useToast();
  const [isApplying, setIsApplying] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('original');

  const selectedLayer = layers.find((l) => l.id === selectedIds[0]);

  const handleCrop = useCallback(
    async (ratio: AspectRatio) => {
      if (!engine || !selectedLayer || selectedLayer.type !== 'image') return;
      setIsApplying(true);

      try {
        const content = selectedLayer.content as { src: string; naturalWidth: number; naturalHeight: number };
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = content.src;
        });

        let cropW = img.naturalWidth;
        let cropH = img.naturalHeight;
        let cropX = 0;
        let cropY = 0;

        if (ratio !== 'original' && ratio !== 'custom') {
          const [w, h] = ratio.split(':').map(Number);
          const targetRatio = w / h;
          const currentRatio = img.naturalWidth / img.naturalHeight;

          if (currentRatio > targetRatio) {
            cropW = img.naturalHeight * targetRatio;
            cropH = img.naturalHeight;
            cropX = (img.naturalWidth - cropW) / 2;
          } else {
            cropW = img.naturalWidth;
            cropH = img.naturalWidth / targetRatio;
            cropY = (img.naturalHeight - cropH) / 2;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(cropW);
        canvas.height = Math.round(cropH);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const dataUrl = canvas.toDataURL('image/png');

        engine.updateLayer(selectedLayer.id, {
          content: {
            ...content,
            src: dataUrl,
            naturalWidth: Math.round(cropW),
            naturalHeight: Math.round(cropH),
          } as typeof selectedLayer.content,
        });

        addToast(`Cropped to ${ratio}`, 'success');
      } catch {
        addToast('Failed to crop image', 'error');
      } finally {
        setIsApplying(false);
      }
    },
    [engine, selectedLayer, addToast]
  );

  if (!selectedLayer || selectedLayer.type !== 'image') {
    return (
      <div className="flex flex-col items-center gap-orbit-md p-orbit-lg text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orbit-text-tertiary">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
        </svg>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-orbit-text-secondary">No image selected</span>
          <span className="text-xs text-orbit-text-tertiary">Select an image layer on the canvas to crop it.</span>
        </div>
      </div>
    );
  }

  const ratios: { value: AspectRatio; label: string }[] = [
    { value: 'original', label: 'Original' },
    { value: '1:1', label: '1:1 Square' },
    { value: '4:3', label: '4:3' },
    { value: '16:9', label: '16:9' },
    { value: '3:2', label: '3:2' },
    { value: '9:16', label: '9:16 Portrait' },
  ];

  return (
    <div className="flex flex-col gap-orbit-md p-orbit-md">
      <div className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">
        Crop
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ratios.map((r) => (
          <button
            key={r.value}
            onClick={() => {
              setAspectRatio(r.value);
              handleCrop(r.value);
            }}
            disabled={isApplying}
            className={`
              rounded-md border px-3 py-2 text-xs font-medium transition-colors
              ${aspectRatio === r.value
                ? 'border-orbit-accent bg-orbit-accent-subtle text-orbit-accent'
                : 'border-orbit-border bg-orbit-panel text-orbit-text-secondary hover:text-orbit-text'}
            `}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="rounded-md bg-orbit-panel p-orbit-sm">
        <span className="text-xs text-orbit-text-secondary">
          Cropping is applied from the center of the image.
        </span>
      </div>
    </div>
  );
};
