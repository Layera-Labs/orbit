import * as React from 'react';
import { useMemo, useState } from 'react';
import type { OrbitEngine } from '@orbit/core';
import type { BlendMode, Layer, ShapeContent, TextContent, VideoContent } from '@orbit/shared';
import { useOrbitLayers } from '../hooks/useOrbitEngine';

interface ContextToolbarProps {
  engine: OrbitEngine | null;
}

const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
const FONT_FAMILIES = ['Inter', 'Arial', 'Helvetica', 'Georgia', 'Playfair Display', 'Courier New'];
const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];

function isHexColor(value: string | undefined): boolean {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

function updateContent(engine: OrbitEngine | null, layer: Layer, updates: Record<string, unknown>): void {
  if (!engine) return;
  engine.updateLayer(layer.id, {
    content: {
      ...(layer.content as unknown as Record<string, unknown>),
      ...updates,
    } as unknown as Layer['content'],
  });
}

const ToolbarButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', ...props }) => (
  <button
    {...props}
    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200/80 bg-white/80 px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
  />
);

const ToolbarInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input
    {...props}
    className={`h-9 rounded-lg border border-slate-200/80 bg-white/90 px-3 text-xs text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${className}`}
  />
);

const ToolbarSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', ...props }) => (
  <select
    {...props}
    className={`h-9 rounded-lg border border-slate-200/80 bg-white/90 px-2 text-xs text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${className}`}
  />
);

const ToolbarPopover: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <ToolbarButton type="button" onClick={() => setOpen((value) => !value)}>
        {label}
      </ToolbarButton>
      {open && (
        <div className="absolute right-0 top-11 z-[80] w-64 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-[0_22px_55px_-28px_rgba(15,23,42,0.38)] backdrop-blur-xl">
          {children}
        </div>
      )}
    </div>
  );
};

export const ContextToolbar: React.FC<ContextToolbarProps> = ({ engine }) => {
  const { layers, selectedIds } = useOrbitLayers(engine);
  const selectedLayers = useMemo(
    () => selectedIds.map((id) => layers.find((layer) => layer.id === id)).filter((layer): layer is Layer => !!layer),
    [layers, selectedIds]
  );
  const layer = selectedLayers[0];

  const updateLayer = (id: string, updates: Partial<Layer>) => {
    engine?.updateLayer(id, updates);
  };

  const noSelectionControls = (
    <>
      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">Canvas</span>
      <span className="text-xs text-slate-500">
        {engine?.scene.getState().width ?? 1080} x {engine?.scene.getState().height ?? 1080}
      </span>
      <ToolbarButton type="button" onClick={() => engine?.zoomToFit()}>
        Fit
      </ToolbarButton>
    </>
  );

  const arrangeControls = layer && (
    <ToolbarPopover label="Arrange">
      <div className="grid grid-cols-2 gap-2">
        <ToolbarButton type="button" onClick={() => engine?.bringForward(layer.id)}>Forward</ToolbarButton>
        <ToolbarButton type="button" onClick={() => engine?.sendBackward(layer.id)}>Backward</ToolbarButton>
        <ToolbarButton type="button" onClick={() => engine?.bringToFront(layer.id)}>Front</ToolbarButton>
        <ToolbarButton type="button" onClick={() => engine?.sendToBack(layer.id)}>Back</ToolbarButton>
      </div>
    </ToolbarPopover>
  );

  const positionControls = layer && (
    <ToolbarPopover label="Position">
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y', 'width', 'height', 'rotation'] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {key}
            <ToolbarInput
              type="number"
              value={Math.round(layer[key])}
              onChange={(event) => updateLayer(layer.id, { [key]: Number(event.target.value) } as Partial<Layer>)}
            />
          </label>
        ))}
      </div>
    </ToolbarPopover>
  );

  const commonControls = layer && (
    <>
      <div className="hidden h-7 w-px bg-slate-200 md:block" />
      <label className="flex items-center gap-2 text-xs text-slate-500">
        Opacity
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layer.opacity}
          onChange={(event) => updateLayer(layer.id, { opacity: Number(event.target.value) })}
          className="w-20 accent-blue-500"
        />
      </label>
      <ToolbarSelect
        value={layer.blendMode}
        onChange={(event) => updateLayer(layer.id, { blendMode: event.target.value as BlendMode })}
        aria-label="Blend mode"
      >
        {BLEND_MODES.map((mode) => (
          <option key={mode} value={mode}>{mode}</option>
        ))}
      </ToolbarSelect>
      {arrangeControls}
      {positionControls}
    </>
  );

  const renderTypeControls = () => {
    if (!layer) return noSelectionControls;
    if (selectedLayers.length > 1) {
      return (
        <>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{selectedLayers.length} selected</span>
          <ToolbarButton type="button" onClick={() => engine?.groupLayers(selectedIds)}>Group</ToolbarButton>
          <ToolbarButton type="button" onClick={() => engine?.alignLayers(selectedIds, 'centerH')}>Align H</ToolbarButton>
          <ToolbarButton type="button" onClick={() => engine?.alignLayers(selectedIds, 'centerV')}>Align V</ToolbarButton>
          <ToolbarButton type="button" onClick={() => engine?.distributeLayers(selectedIds, 'horizontal')} disabled={selectedIds.length < 3}>Distribute</ToolbarButton>
          {commonControls}
        </>
      );
    }

    if (layer.type === 'text') {
      const content = layer.content as TextContent;
      return (
        <>
          <ToolbarInput
            value={content.text}
            onChange={(event) => updateContent(engine, layer, { text: event.target.value })}
            className="w-40 md:w-56"
            aria-label="Text value"
          />
          <ToolbarSelect value={content.fontFamily} onChange={(event) => updateContent(engine, layer, { fontFamily: event.target.value })}>
            {FONT_FAMILIES.map((font) => (
              <option key={font} value={font}>{font}</option>
            ))}
          </ToolbarSelect>
          <ToolbarInput
            type="number"
            value={content.fontSize}
            onChange={(event) => updateContent(engine, layer, { fontSize: Number(event.target.value) })}
            className="w-20"
            aria-label="Font size"
          />
          <ToolbarSelect value={content.fontWeight} onChange={(event) => updateContent(engine, layer, { fontWeight: Number(event.target.value) })}>
            {FONT_WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>{weight}</option>
            ))}
          </ToolbarSelect>
          <input
            type="color"
            value={isHexColor(content.color) ? content.color : '#1a1a1a'}
            onChange={(event) => updateContent(engine, layer, { color: event.target.value })}
            className="h-9 w-11 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
            aria-label="Text color"
          />
          {commonControls}
        </>
      );
    }

    if (layer.type === 'shape') {
      const content = layer.content as ShapeContent;
      return (
        <>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium capitalize text-slate-600">{content.shape}</span>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Fill
            <input
              type="color"
              value={isHexColor(content.fill) ? content.fill : '#ffffff'}
              onChange={(event) => updateContent(engine, layer, { fill: event.target.value })}
              className="h-9 w-11 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Stroke
            <input
              type="color"
              value={isHexColor(content.stroke) ? content.stroke : '#ffffff'}
              onChange={(event) => updateContent(engine, layer, { stroke: event.target.value, strokeWidth: Math.max(content.strokeWidth, 1) })}
              className="h-9 w-11 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
            />
          </label>
          {commonControls}
        </>
      );
    }

    if (layer.type === 'video' || layer.type === 'audio') {
      const content = layer.content as VideoContent;
      return (
        <>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium capitalize text-slate-600">{layer.type}</span>
          {layer.type === 'video' && (
            <ToolbarButton
              type="button"
              onClick={() => {
                if (engine?.renderer.isVideoPlaying(layer.id)) engine.renderer.pauseVideo(layer.id);
                else engine?.renderer.playVideo(layer.id);
              }}
            >
              Play
            </ToolbarButton>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Seek
            <input
              type="range"
              min={0}
              max={Math.max(1, content.duration ?? 1)}
              step={0.1}
              defaultValue={content.currentTime ?? 0}
              onChange={(event) => {
                const currentTime = Number(event.target.value);
                if (layer.type === 'video') engine?.renderer.seekVideo(layer.id, currentTime);
                updateContent(engine, layer, { currentTime });
              }}
              className="w-24 accent-blue-500"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={content.volume ?? 1}
              onChange={(event) => {
                const volume = Number(event.target.value);
                if (layer.type === 'video') engine?.renderer.setVideoVolume(layer.id, volume);
                updateContent(engine, layer, { volume });
              }}
              className="w-20 accent-blue-500"
            />
          </label>
          {commonControls}
        </>
      );
    }

    return (
      <>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium capitalize text-slate-600">{layer.type}</span>
        <ToolbarButton type="button" onClick={() => engine?.setTool('crop')}>Crop</ToolbarButton>
        {commonControls}
      </>
    );
  };

  return (
    <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 overflow-x-auto rounded-[18px] border border-white/70 bg-white/80 px-3 py-2 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.34)] backdrop-blur-xl md:max-w-[980px]">
      {renderTypeControls()}
    </div>
  );
};
