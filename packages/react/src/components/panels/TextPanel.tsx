/**
 * TextPanel - Canva-style typography panel with instant-add presets
 */
import * as React from 'react';
import { useCallback } from 'react';
import { useOrbitLayers } from '../../hooks/useOrbitEngine';
import type { OrbitEngine } from '@layera-labs/orbit-core';
import { createCenteredTextLayer } from '../../utils/layerPlacement';

interface TextPanelProps {
  engine: OrbitEngine | null;
  onClose?: () => void;
}

const DEFAULT_STYLES = [
  {
    label: 'Add a heading',
    text: 'Add a heading',
    fontSize: 36,
    fontWeight: 700,
    fontFamily: 'Inter',
    color: '#1a1a1a',
    previewClass: 'text-xl font-bold',
  },
  {
    label: 'Add a subheading',
    text: 'Add a subheading',
    fontSize: 24,
    fontWeight: 600,
    fontFamily: 'Inter',
    color: '#1a1a1a',
    previewClass: 'text-lg font-semibold',
  },
  {
    label: 'Add a little bit of body text',
    text: 'Add a little bit of body text',
    fontSize: 16,
    fontWeight: 400,
    fontFamily: 'Inter',
    color: '#1a1a1a',
    previewClass: 'text-sm font-normal',
  },
];

const BRAND_KIT = [
  { label: 'Title', text: 'Title', fontSize: 48, fontWeight: 700, fontFamily: 'Playfair Display', color: '#1a1a1a' },
];

export const TextPanel: React.FC<TextPanelProps> = ({ engine, onClose }) => {
  const { addLayer, selectLayer } = useOrbitLayers(engine);
  const [searchQuery, setSearchQuery] = React.useState('');

  const addTextLayer = useCallback(
    (preset: { text: string; fontSize: number; fontWeight: number; fontFamily: string; color: string }) => {
      const layer = createCenteredTextLayer(engine, preset);
      const id = addLayer(layer);
      engine?.setTool('select');
      if (id) selectLayer(id);
      onClose?.();
    },
    [addLayer, engine, selectLayer, onClose]
  );

  return (
    <div className="flex flex-col gap-orbit-lg">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orbit-text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search fonts and combinations"
          className="h-10 w-full rounded-orbit-md border border-orbit-border bg-orbit-panel pl-10 pr-3 text-sm text-orbit-text placeholder:text-orbit-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent"
        />
      </div>

      {/* Add a text box — primary action */}
      <button
        onClick={() =>
          addTextLayer({
            text: 'Text',
            fontSize: 32,
            fontWeight: 400,
            fontFamily: 'Inter',
            color: '#1a1a1a',
          })
        }
        className="flex h-12 w-full items-center justify-center gap-2 rounded-orbit-md bg-orbit-accent text-sm font-medium text-white transition-colors hover:bg-orbit-accent-hover active:scale-[0.98]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
        Add a text box
      </button>

      {/* Magic Write */}
      <button className="flex h-12 w-full items-center justify-center gap-2 rounded-orbit-md border border-orbit-border bg-orbit-panel text-sm font-medium text-orbit-text transition-colors hover:bg-orbit-hover">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z" />
        </svg>
        Magic Write
      </button>

      {/* Brand Kit */}
      <div className="flex flex-col gap-orbit-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-orbit-text">Brand Kit</span>
          <button className="text-xs font-medium text-orbit-accent hover:text-orbit-accent-hover">Edit</button>
        </div>
        {BRAND_KIT.map((preset) => (
          <button
            key={preset.label}
            onClick={() => addTextLayer(preset)}
            className="flex w-full items-center rounded-orbit-md border border-orbit-border bg-orbit-panel p-orbit-md transition-colors hover:border-orbit-border-hover hover:bg-orbit-hover"
            style={{ fontFamily: preset.fontFamily }}
          >
            <span className="text-2xl font-bold text-orbit-text">{preset.label}</span>
          </button>
        ))}
      </div>

      {/* Default text styles */}
      <div className="flex flex-col gap-orbit-sm">
        <span className="text-sm font-semibold text-orbit-text">Default text styles</span>
        <div className="flex flex-col gap-2">
          {DEFAULT_STYLES.map((preset) => (
            <button
              key={preset.label}
              onClick={() => addTextLayer(preset)}
              className="flex w-full items-center rounded-orbit-md border border-orbit-border bg-orbit-panel p-orbit-md text-left transition-colors hover:border-orbit-border-hover hover:bg-orbit-hover"
            >
              <span className={preset.previewClass + ' text-orbit-text'}>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic text */}
      <div className="flex flex-col gap-orbit-sm">
        <span className="text-sm font-semibold text-orbit-text">Dynamic text</span>
        <button
          onClick={() =>
            addTextLayer({
              text: '1',
              fontSize: 48,
              fontWeight: 700,
              fontFamily: 'Inter',
              color: '#1a1a1a',
            })
          }
          className="flex w-full items-center gap-3 rounded-orbit-md border border-orbit-border bg-orbit-panel p-orbit-md transition-colors hover:border-orbit-border-hover hover:bg-orbit-hover"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-orbit-md bg-gradient-to-br from-orange-500 to-red-500 text-lg font-bold text-white">
            1
          </div>
          <span className="text-sm font-medium text-orbit-text">Page numbers</span>
        </button>
      </div>
    </div>
  );
};
