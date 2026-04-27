import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useOrbitLayers } from '../../hooks/useOrbitEngine';
import type { OrbitEngine } from '@orbit/core';
import type { EasingType, Layer, TransitionType } from '@orbit/shared';
import { OrbitInput, OrbitSlider, OrbitDropdown, OrbitButton, OrbitColorPicker } from '@orbit/ui';
import { BLEND_MODES } from '@orbit/shared';

interface PropertiesPanelProps {
  engine: OrbitEngine | null;
}

const PropertiesPanelInner: React.FC<PropertiesPanelProps> = ({ engine }) => {
  const { layers, selectedIds, updateLayer } = useOrbitLayers(engine);

  const selectedLayer = layers.find((l) => l.id === selectedIds[0]);
  const isGroupLayer = selectedLayer?.type === 'group';
  const canGroup = selectedIds.length >= 2;

  if (!selectedLayer) {
    return (
      <div className="p-orbit-md">
        <span className="text-xs text-orbit-text-tertiary">No layer selected</span>
    </div>
  );
}

// Audio controls sub-component
function AudioControls({ engine, layerId }: { engine: OrbitEngine | null; layerId: string }) {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const handleMute = useCallback(() => {
    if (!engine) return;
    engine.setAudioMuted(layerId, !muted);
    setMuted(!muted);
  }, [engine, layerId, muted]);

  const handleVolume = useCallback((v: number) => {
    engine?.setAudioVolume(layerId, v);
    setVolume(v);
  }, [engine, layerId]);

  const handleTrimStart = useCallback((v: number) => {
    setTrimStart(v);
    engine?.setAudioTrim(layerId, { start: v, end: trimEnd });
  }, [engine, layerId, trimEnd]);

  const handleTrimEnd = useCallback((v: number) => {
    setTrimEnd(v);
    engine?.setAudioTrim(layerId, { start: trimStart, end: v });
  }, [engine, layerId, trimStart]);

  return (
    <div className="flex flex-col gap-orbit-sm rounded-orbit-md border border-orbit-border bg-orbit-panel p-orbit-sm">
      <div className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">
        Audio
      </div>

      <div className="flex items-center gap-2">
        <OrbitButton variant="ghost" size="sm" onClick={handleMute}>
          {muted ? 'Unmute' : 'Mute'}
        </OrbitButton>
      </div>

      <OrbitSlider
        label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={handleVolume}
        valueFormatter={(v) => `${Math.round(v * 100)}%`}
      />

      <OrbitSlider
        label="Trim Start"
        min={0}
        max={trimEnd - 0.5}
        step={0.1}
        value={trimStart}
        onChange={handleTrimStart}
        valueFormatter={(v) => `${v.toFixed(1)}s`}
      />

      <OrbitSlider
        label="Trim End"
        min={trimStart + 0.5}
        max={300}
        step={0.1}
        value={trimEnd}
        onChange={handleTrimEnd}
        valueFormatter={(v) => `${v.toFixed(1)}s`}
      />
    </div>
  );
}

  const isTextLayer = selectedLayer.type === 'text';
  const textContent = isTextLayer
    ? (selectedLayer.content as { text: string; fontSize: number; color: string })
    : null;

  const handleChange = (field: string, value: number) => {
    updateLayer(selectedLayer.id, { [field]: value } as Partial<typeof selectedLayer>);
  };

  const handleTextChange = (text: string) => {
    if (!isTextLayer || !textContent) return;
    updateLayer(selectedLayer.id, {
      content: { ...textContent, text },
    } as Partial<typeof selectedLayer>);
  };

  const handleFontSizeChange = (fontSize: number) => {
    if (!isTextLayer || !textContent) return;
    updateLayer(selectedLayer.id, {
      content: { ...textContent, fontSize },
    } as Partial<typeof selectedLayer>);
  };

  const handleColorChange = (color: string) => {
    if (!isTextLayer || !textContent) return;
    updateLayer(selectedLayer.id, {
      content: { ...textContent, color },
    } as Partial<typeof selectedLayer>);
  };

  const handleBlendModeChange = (blendMode: string) => {
    updateLayer(selectedLayer.id, { blendMode: blendMode as any });
  };

  return (
    <div className="flex flex-col gap-orbit-md p-orbit-md">
      {/* Layer name */}
      <div className="text-xs font-semibold text-orbit-text-secondary uppercase tracking-wider">
        {selectedLayer.name}
      </div>

      {/* Arrange buttons */}
      <div className="flex flex-col gap-orbit-sm">
        <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">Arrange</label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => engine?.bringForward(selectedLayer.id)}
            className="rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[11px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
          >
            Forward
          </button>
          <button
            onClick={() => engine?.sendBackward(selectedLayer.id)}
            className="rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[11px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
          >
            Backward
          </button>
          <button
            onClick={() => engine?.bringToFront(selectedLayer.id)}
            className="rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[11px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
          >
            To Front
          </button>
          <button
            onClick={() => engine?.sendToBack(selectedLayer.id)}
            className="rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[11px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
          >
            To Back
          </button>
        </div>
        {/* Group / Ungroup */}
        <div className="flex gap-1.5">
          {canGroup && (
            <button
              onClick={() => engine?.groupLayers(selectedIds)}
              className="flex-1 rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[11px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
            >
              Group ({selectedIds.length})
            </button>
          )}
          {isGroupLayer && (
            <button
              onClick={() => engine?.ungroupLayer(selectedLayer.id)}
              className="flex-1 rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[11px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
            >
              Ungroup
            </button>
          )}
        </div>
      </div>

      {/* Align & Distribute — multi-select only */}
      {selectedIds.length >= 2 && (
        <div className="flex flex-col gap-orbit-sm">
          <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">Align</label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { key: 'left', label: 'L' },
              { key: 'centerH', label: 'CH' },
              { key: 'right', label: 'R' },
              { key: 'top', label: 'T' },
              { key: 'centerV', label: 'CV' },
              { key: 'bottom', label: 'B' },
            ].map((a) => (
              <button
                key={a.key}
                onClick={() => engine?.alignLayers(selectedIds, a.key as any)}
                className="rounded-md border border-orbit-border bg-orbit-panel px-1 py-1.5 text-[10px] font-semibold text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
          {selectedIds.length >= 3 && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => engine?.distributeLayers(selectedIds, 'horizontal')}
                className="rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[10px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
              >
                Distr. H
              </button>
              <button
                onClick={() => engine?.distributeLayers(selectedIds, 'vertical')}
                className="rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[10px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
              >
                Distr. V
              </button>
            </div>
          )}
        </div>
      )}

      {/* Blend mode */}
      <div className="flex flex-col gap-orbit-sm">
        <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">Blend Mode</label>
        <OrbitDropdown
          options={BLEND_MODES.map((mode) => ({
            value: mode,
            label: mode.charAt(0).toUpperCase() + mode.slice(1),
          }))}
          value={selectedLayer.blendMode}
          onChange={handleBlendModeChange}
          placeholder="Blend Mode"
        />
      </div>

      {/* Text-specific controls */}
      {isTextLayer && textContent && (
        <div className="flex flex-col gap-orbit-sm">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-orbit-text-tertiary">Text</label>
            <textarea
              value={textContent.text}
              onChange={(e) => handleTextChange(e.target.value)}
              rows={3}
              className="resize-none rounded-md border border-orbit-border bg-orbit-panel p-2 text-xs text-orbit-text placeholder:text-orbit-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-orbit-sm">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-orbit-text-tertiary">Font Size</label>
              <OrbitInput
                type="number"
                min={8}
                max={400}
                value={textContent.fontSize}
                onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs text-orbit-text-tertiary">Color</label>
              <OrbitColorPicker
                value={textContent.color}
                onChange={handleColorChange}
                className="gap-2"
              />
            </div>
          </div>
        </div>
      )}

      {/* Video controls */}
      {selectedLayer.type === 'video' && <VideoControls engine={engine} layerId={selectedLayer.id} />}

      {/* Audio controls */}
      {selectedLayer.type === 'audio' && <AudioControls engine={engine} layerId={selectedLayer.id} />}

      {/* Transition controls for video/audio */}
      {(selectedLayer.type === 'video' || selectedLayer.type === 'audio') && (
        <TransitionControls layer={selectedLayer} updateLayer={updateLayer} />
      )}

      {/* Position & Size — hidden for audio layers */}
      {selectedLayer.type !== 'audio' && (
        <div className="flex flex-col gap-orbit-sm">
          <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">Position & Size</label>
          <div className="grid grid-cols-2 gap-orbit-sm">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-orbit-text-tertiary">X</label>
              <OrbitInput
                type="number"
                value={Math.round(selectedLayer.x)}
                onChange={(e) => handleChange('x', Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-orbit-text-tertiary">Y</label>
              <OrbitInput
                type="number"
                value={Math.round(selectedLayer.y)}
                onChange={(e) => handleChange('y', Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-orbit-text-tertiary">W</label>
              <OrbitInput
                type="number"
                value={Math.round(selectedLayer.width)}
                onChange={(e) => handleChange('width', Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-orbit-text-tertiary">H</label>
              <OrbitInput
                type="number"
                value={Math.round(selectedLayer.height)}
                onChange={(e) => handleChange('height', Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <OrbitSlider
            label="Rotation"
            min={-180}
            max={180}
            step={1}
            value={selectedLayer.rotation}
            onChange={(v) => handleChange('rotation', v)}
            valueFormatter={(v) => `${Math.round(v)}°`}
          />
          <OrbitSlider
            label="Opacity"
            min={0}
            max={1}
            step={0.01}
            value={selectedLayer.opacity}
            onChange={(v) => handleChange('opacity', v)}
            valueFormatter={(v) => `${Math.round(v * 100)}%`}
          />
          <OrbitSlider
            label="Skew X"
            min={-60}
            max={60}
            step={1}
            value={(selectedLayer as any).skewX || 0}
            onChange={(v) => handleChange('skewX', v)}
            valueFormatter={(v) => `${Math.round(v)}°`}
          />
          <OrbitSlider
            label="Skew Y"
            min={-60}
            max={60}
            step={1}
            value={(selectedLayer as any).skewY || 0}
            onChange={(v) => handleChange('skewY', v)}
            valueFormatter={(v) => `${Math.round(v)}°`}
          />
        </div>
      )}

      {/* Path edit for vector shapes */}
      {selectedLayer.type === 'shape' && (selectedLayer.content as any).shape === 'path' && (
        <div className="flex flex-col gap-orbit-sm">
          <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">Vector Path</label>
          <OrbitButton
            variant="secondary"
            size="sm"
            onClick={() => {
              if (engine?.isPathEditing()) {
                engine.stopPathEdit();
              } else {
                engine?.startPathEdit(selectedLayer.id);
              }
            }}
          >
            {engine?.isPathEditing() ? 'Stop Editing' : 'Edit Nodes'}
          </OrbitButton>
        </div>
      )}

      {/* Flip */}
      {selectedLayer.type !== 'audio' && (
        <div className="flex flex-col gap-orbit-sm">
          <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">Flip</label>
          <div className="flex gap-1.5">
            <button
              onClick={() => engine?.flipLayer(selectedLayer.id, 'horizontal')}
              className="flex-1 rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[11px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
            >
              Horizontal
            </button>
            <button
              onClick={() => engine?.flipLayer(selectedLayer.id, 'vertical')}
              className="flex-1 rounded-md border border-orbit-border bg-orbit-panel px-2 py-1.5 text-[11px] font-medium text-orbit-text-secondary hover:text-orbit-text hover:border-orbit-accent hover:bg-orbit-hover transition-colors"
            >
              Vertical
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const PropertiesPanel = React.memo(PropertiesPanelInner);

// Video controls sub-component
function VideoControls({ engine, layerId }: { engine: OrbitEngine | null; layerId: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    if (!engine) return;
    const interval = setInterval(() => {
      setIsPlaying(engine.isVideoPlaying(layerId));
      setCurrentTime(engine.getVideoCurrentTime(layerId));
      setDuration(engine.getVideoDuration(layerId));
    }, 100);
    return () => clearInterval(interval);
  }, [engine, layerId]);

  const togglePlay = useCallback(() => {
    if (!engine) return;
    if (isPlaying) {
      engine.pauseVideo(layerId);
    } else {
      engine.playVideo(layerId);
    }
  }, [engine, isPlaying, layerId]);

  const handleSeek = useCallback((time: number) => {
    engine?.seekVideo(layerId, time);
  }, [engine, layerId]);

  const handleMute = useCallback(() => {
    if (!engine) return;
    engine.setVideoMuted(layerId, !muted);
    setMuted(!muted);
  }, [engine, layerId, muted]);

  const handleVolume = useCallback((v: number) => {
    engine?.setVideoVolume(layerId, v);
    setVolume(v);
  }, [engine, layerId]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-orbit-sm rounded-orbit-md border border-orbit-border bg-orbit-panel p-orbit-sm">
      <div className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">
        Video
      </div>

      <div className="flex items-center gap-2">
        <OrbitButton variant="secondary" size="sm" onClick={togglePlay}>
          {isPlaying ? 'Pause' : 'Play'}
        </OrbitButton>
        <OrbitButton variant="ghost" size="sm" onClick={handleMute}>
          {muted ? 'Unmute' : 'Mute'}
        </OrbitButton>
        <span className="ml-auto text-xs text-orbit-text-secondary tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <OrbitSlider
        label="Seek"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        valueFormatter={formatTime}
      />

      <OrbitSlider
        label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={handleVolume}
        valueFormatter={(v) => `${Math.round(v * 100)}%`}
      />
    </div>
  );
}

// Transition controls sub-component
const TRANSITION_TYPES: { value: TransitionType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'slide-right', label: 'Slide Right' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-down', label: 'Slide Down' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' },
];

const EASING_TYPES: { value: EasingType; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In Out' },
];

function TransitionControls({
  layer,
  updateLayer,
}: {
  layer: Layer;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
}) {
  const inTransition = layer.transitionIn || { type: 'none' as const, duration: 0.5, easing: 'ease-in-out' as const };
  const outTransition = layer.transitionOut || { type: 'none' as const, duration: 0.5, easing: 'ease-in-out' as const };

  const updateIn = (updates: Partial<typeof inTransition>) => {
    updateLayer(layer.id, {
      transitionIn: { ...inTransition, ...updates },
    });
  };

  const updateOut = (updates: Partial<typeof outTransition>) => {
    updateLayer(layer.id, {
      transitionOut: { ...outTransition, ...updates },
    });
  };

  return (
    <div className="flex flex-col gap-orbit-sm rounded-orbit-md border border-orbit-border bg-orbit-panel p-orbit-sm">
      <div className="text-xs font-medium text-orbit-text-secondary uppercase tracking-wider">
        Transitions
      </div>

      {/* In Transition */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-orbit-text-tertiary">In</label>
        <OrbitDropdown
          options={TRANSITION_TYPES}
          value={inTransition.type}
          onChange={(value) => updateIn({ type: value as TransitionType })}
        />
        {inTransition.type !== 'none' && (
          <>
            <OrbitSlider
              label="Duration"
              min={0.1}
              max={3}
              step={0.1}
              value={inTransition.duration}
              onChange={(v) => updateIn({ duration: v })}
              valueFormatter={(v) => `${v.toFixed(1)}s`}
            />
            <OrbitDropdown
              options={EASING_TYPES}
              value={inTransition.easing}
              onChange={(value) => updateIn({ easing: value as EasingType })}
            />
          </>
        )}
      </div>

      {/* Out Transition */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-orbit-text-tertiary">Out</label>
        <OrbitDropdown
          options={TRANSITION_TYPES}
          value={outTransition.type}
          onChange={(value) => updateOut({ type: value as TransitionType })}
        />
        {outTransition.type !== 'none' && (
          <>
            <OrbitSlider
              label="Duration"
              min={0.1}
              max={3}
              step={0.1}
              value={outTransition.duration}
              onChange={(v) => updateOut({ duration: v })}
              valueFormatter={(v) => `${v.toFixed(1)}s`}
            />
            <OrbitDropdown
              options={EASING_TYPES}
              value={outTransition.easing}
              onChange={(value) => updateOut({ easing: value as EasingType })}
            />
          </>
        )}
      </div>
    </div>
  );
}
