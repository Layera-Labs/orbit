/**
 * Timeline - Video + Audio timeline component for Phase 2
 * Shows when video or audio layers exist on canvas
 */
import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { OrbitButton, OrbitSlider } from '@layera-labs/ui';
import type { OrbitEngine } from '@layera-labs/core';
import type { Layer } from '@layera-labs/shared';

interface TimelineProps {
  engine: OrbitEngine | null;
  layers: Layer[];
}

const TimelineInner: React.FC<TimelineProps> = ({ engine, layers }) => {
  const videoLayers = layers.filter((l) => l.type === 'video');
  const audioLayers = layers.filter((l) => l.type === 'audio');
  const hasTimelineLayers = videoLayers.length > 0 || audioLayers.length > 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [maxDuration, setMaxDuration] = useState(0);
  const audioUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!engine || !hasTimelineLayers) return;

    // Subscribe to audio time updates
    const unsub = engine.on('audioTimeUpdate', () => {
      // Audio time is polled in the interval below
    });
    audioUnsubRef.current = unsub;

    const interval = setInterval(() => {
      let anyPlaying = false;
      let maxTime = 0;
      let maxDur = 0;

      for (const layer of videoLayers) {
        if (engine.isVideoPlaying(layer.id)) anyPlaying = true;
        const t = engine.getVideoCurrentTime(layer.id);
        const d = engine.getVideoDuration(layer.id);
        maxTime = Math.max(maxTime, t);
        maxDur = Math.max(maxDur, d);
      }

      const audioT = engine.getAudioCurrentTime();
      const engineMaxDur = engine.getMaxVideoDuration();
      maxTime = Math.max(maxTime, audioT);
      maxDur = Math.max(maxDur, engineMaxDur);

      setIsPlaying(anyPlaying || engine.isAudioPlaying?.() || false);
      setCurrentTime(maxTime);
      setMaxDuration(maxDur);
    }, 100);

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [engine, hasTimelineLayers, videoLayers]);

  const togglePlayAll = useCallback(() => {
    if (!engine) return;
    if (isPlaying) {
      engine.pauseAllVideos();
    } else {
      engine.playAllVideos();
    }
  }, [engine, isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (!engine) return;
    for (const layer of videoLayers) {
      engine.seekVideo(layer.id, time);
    }
    engine.seekAudio(time);
  }, [engine, videoLayers]);

  const [isExportingAudio, setIsExportingAudio] = useState(false);

  const handleExportAudio = useCallback(async () => {
    if (!engine) return;
    setIsExportingAudio(true);
    try {
      const { blob } = await engine.exportAudio({
        onProgress: (_p) => {
          // Could show progress UI here
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orbit-audio-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Audio export failed:', err);
    } finally {
      setIsExportingAudio(false);
    }
  }, [engine]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${m}:${sec.toString().padStart(2, '0')}.${ms}`;
  };

  if (!hasTimelineLayers) return null;

  return (
    <div className="flex flex-col border-t border-orbit-border bg-orbit-sidebar">
      {/* Main timeline controls */}
      <div className="flex items-center gap-orbit-sm px-orbit-md py-2">
        <OrbitButton variant="secondary" size="sm" onClick={togglePlayAll}>
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          )}
        </OrbitButton>

        {audioLayers.length > 0 && (
          <OrbitButton
            variant="ghost"
            size="sm"
            onClick={handleExportAudio}
            disabled={isExportingAudio}
            title="Export mixed audio as WAV"
          >
            {isExportingAudio ? (
              <span className="text-[10px]">Mixing...</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
          </OrbitButton>
        )}

        <span className="min-w-[4rem] text-center text-xs text-orbit-text-secondary tabular-nums">
          {formatTime(currentTime)}
        </span>

        <div className="flex-1">
          <OrbitSlider
            value={currentTime}
            min={0}
            max={maxDuration || 1}
            step={0.1}
            onChange={handleSeek}
            showValue={false}
          />
        </div>

        <span className="min-w-[4rem] text-center text-xs text-orbit-text-secondary tabular-nums">
          {formatTime(maxDuration)}
        </span>
      </div>

      {/* Track indicators */}
      <div className="flex items-center gap-1 border-t border-orbit-border px-orbit-md py-1.5">
        {videoLayers.map((layer, i) => (
          <div
            key={layer.id}
            className="flex h-6 items-center gap-1 rounded bg-orbit-panel px-2 text-[10px] text-orbit-text-secondary"
            title={layer.name}
          >
            <span className="h-2 w-2 rounded-full bg-orbit-accent" />
            V{i + 1}
          </div>
        ))}
        {audioLayers.map((layer, i) => (
          <div
            key={layer.id}
            className="flex h-6 items-center gap-1 rounded bg-orbit-panel px-2 text-[10px] text-orbit-text-secondary"
            title={layer.name}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            A{i + 1}
          </div>
        ))}
      </div>
    </div>
  );
};

export const Timeline = React.memo(TimelineInner);
