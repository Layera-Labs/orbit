/**
 * VideoExportModal - Configure and trigger video/GIF/PNG-sequence export
 */
import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { OrbitButton, OrbitDialog, OrbitSlider } from '@layera-labs/ui';
import { GifEncoder, PreviewRecorder, VideoFrameCapture, ExportJobPoller } from '@layera-labs/core';
import type { OrbitEngine } from '@layera-labs/core';
import type { VideoExportOptions } from '@layera-labs/shared';
import type { ExportBackend } from '../backends/types';

interface VideoExportModalProps {
  open: boolean;
  onClose: () => void;
  engine: OrbitEngine | null;
  /**
   * Where server-side renders are sent. Optional on purpose: GIF is encoded
   * entirely in the browser, so an editor with no backend still exports — it
   * just offers GIF alone, rather than showing an MP4 button that cannot
   * answer a click.
   */
  backend?: ExportBackend;
  onError?: (error: Error) => void;
  onExportStart?: (format: 'mp4' | 'gif' | 'png-sequence') => void;
}

const VideoExportModalInner: React.FC<VideoExportModalProps> = ({
  open,
  onClose,
  engine,
  backend,
  onError,
  onExportStart,
}) => {
  const [format, setFormat] = useState<'mp4' | 'gif' | 'png-sequence'>(backend ? 'mp4' : 'gif');
  const [quality, setQuality] = useState<'1080p' | '720p' | '480p'>('1080p');
  const resolutionMap: Record<string, { width: number; height: number }> = {
    '1080p': { width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720 },
    '480p': { width: 854, height: 480 },
  };
  const [fps, setFps] = useState(30);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'idle' | 'capturing' | 'uploading' | 'processing' | 'done' | 'failed'>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRecorderRef = useRef<PreviewRecorder | null>(null);

  const canvas = engine?.getCanvasElement();
  const maxDuration = engine?.getMaxVideoDuration?.() || 60;

  // Server formats only exist when there is a server. If the backend is taken
  // away while the modal is mounted, fall back rather than leaving a selected
  // format that `handleExport` would have to refuse.
  const availableFormats: readonly ('mp4' | 'gif' | 'png-sequence')[] = backend
    ? (['mp4', 'gif', 'png-sequence'] as const)
    : (['gif'] as const);

  useEffect(() => {
    if (!backend && format !== 'gif') setFormat('gif');
  }, [backend, format]);

  useEffect(() => {
    if (open && maxDuration) {
      setTrimEnd(maxDuration);
    }
  }, [open, maxDuration]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      previewRecorderRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!previewBlob) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(previewBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewBlob]);

  const handlePreview = useCallback(() => {
    if (!canvas || !engine) return;
    setPreviewBlob(null);
    previewRecorderRef.current?.stop();

    const recorder = new PreviewRecorder();
    recorder.start({
      canvas,
      duration: maxDuration,
      fps,
      trim: { start: trimStart, end: trimEnd },
      onBlob: (blob) => setPreviewBlob(blob),
    });
    previewRecorderRef.current = recorder;
  }, [canvas, engine, maxDuration, fps, trimStart, trimEnd]);

  const handleExport = async () => {
    if (!canvas || !engine) return;
    onExportStart?.(format);
    setIsExporting(true);
    setProgress(0);
    setJobStatus('capturing');
    setDownloadUrl(null);
    abortRef.current = new AbortController();

    try {
      if (format === 'gif') {
        // Client-side GIF (capped at 5s)
        const gifEncoder = new GifEncoder();
        const limits = gifEncoder.getLimits();
        const gifDuration = Math.min(trimEnd - trimStart, limits.maxDuration);

        const blob = await gifEncoder.encode({
          canvas,
          duration: gifDuration,
          fps: Math.min(fps, limits.maxFps),
          scale: 0.5,
          trim: { start: trimStart, end: trimStart + gifDuration },
          onProgress: (frame, total) => setProgress(Math.round((frame / total) * 50)),
          signal: abortRef.current.signal,
        });

        setProgress(100);
        setJobStatus('done');

        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orbit-export-${Date.now()}.gif`;
        a.click();
        URL.revokeObjectURL(url);
      } else if ((format === 'mp4' || format === 'png-sequence') && backend) {
        const res = resolutionMap[quality];
        const exportScale = Math.min(res.width / canvas.width, res.height / canvas.height);

        // Init backend job
        const options: VideoExportOptions = {
          format,
          resolution: quality,
          fps,
          duration: trimEnd - trimStart,
          trim: { start: trimStart, end: trimEnd },
          scale: exportScale,
          width: res.width,
          height: res.height,
          quality: 'production',
        };

        const { jobId, uploadUrl } = await backend.initVideoExport(options);
        setJobStatus('capturing');

        // Capture frames and upload
        const frameCapture = new VideoFrameCapture();
        const uploadedFrames: string[] = [];

        await frameCapture.capture({
          canvas,
          duration: maxDuration,
          fps,
          scale: exportScale,
          trim: { start: trimStart, end: trimEnd },
          beforeFrame: (time) => {
            engine?.updateTransitions(time);
          },
          onFrame: async (blob, index, total) => {
            const frameUrl = `${uploadUrl}/${String(index).padStart(5, '0')}.png`;
            const response = await fetch(frameUrl, {
              method: 'PUT',
              body: blob,
              headers: { 'Content-Type': 'image/png' },
            });
            if (!response.ok) throw new Error(`Frame upload failed: ${response.statusText}`);
            uploadedFrames.push(frameUrl);
            setProgress(Math.round(((index + 1) / total) * 40));
          },
          onProgress: (frame, total) => setProgress(Math.round((frame / total) * 40)),
          signal: abortRef.current.signal,
        });

        setJobStatus('uploading');

        // Mark ready
        await backend.markExportReady(jobId);
        setProgress(50);
        setJobStatus('processing');

        // Poll for completion
        const poller = new ExportJobPoller(
          (job) => {
            if (job.progress) {
              setProgress(50 + Math.round(job.progress * 0.5));
            }
            if (job.status === 'done') {
              setJobStatus('done');
              setProgress(100);
              setDownloadUrl(job.permanentUrl || job.url || null);
              poller.stop();
            } else if (job.status === 'failed') {
              setJobStatus('failed');
              poller.stop();
              onError?.(new Error(job.error?.message || 'Export failed'));
            }
          },
          (err) => {
            setJobStatus('failed');
            onError?.(err);
            poller.stop();
          }
        );

        const statusUrl = `${backend.getExportEventsUrl(jobId)}`; // adapter exposes events URL
        // Use SSE URL from adapter but strip events path for fallback polling
        const baseStatusUrl = statusUrl.replace('/events', '/status');
        poller.start(statusUrl, baseStatusUrl);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setJobStatus('failed');
      onError?.(error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    previewRecorderRef.current?.stop();
    setIsExporting(false);
    setJobStatus('idle');
    setProgress(0);
  };

  const formatLabels: Record<string, string> = {
    mp4: 'MP4 Video',
    gif: 'Animated GIF',
    'png-sequence': 'PNG Sequence',
  };

  return (
    <OrbitDialog
      open={open}
      onClose={() => !isExporting && onClose()}
      title="Export Video"
      className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[480px] overflow-y-auto sm:w-[480px]"
      footer={
        <>
          {isExporting || jobStatus === 'processing' ? (
            <OrbitButton variant="secondary" size="sm" onClick={handleCancel}>
              Cancel
            </OrbitButton>
          ) : (
            <OrbitButton variant="secondary" size="sm" onClick={onClose}>
              Close
            </OrbitButton>
          )}
          {!isExporting && jobStatus !== 'processing' && jobStatus !== 'done' && (
            <OrbitButton variant="primary" size="sm" onClick={handleExport} disabled={!canvas}>
              Export
            </OrbitButton>
          )}
          {jobStatus === 'done' && downloadUrl && (
            <OrbitButton
              variant="primary"
              size="sm"
              onClick={() => {
                const a = document.createElement('a');
                a.href = downloadUrl!;
                a.download = `orbit-export-${Date.now()}.${format === 'png-sequence' ? 'zip' : format}`;
                a.click();
              }}
            >
              Download
            </OrbitButton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Format selector */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">
            Format
          </label>
          <div className="flex gap-1">
            {availableFormats.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                disabled={isExporting}
                className={`
                  flex-1 rounded border px-2 py-1.5 text-xs transition-colors
                  ${format === f
                    ? 'border-orbit-accent bg-orbit-accent-subtle text-orbit-accent'
                    : 'border-orbit-border text-orbit-text-secondary hover:text-orbit-text'}
                  ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {formatLabels[f]}
              </button>
            ))}
          </div>
          {format === 'gif' && (
            <p className="text-[10px] text-amber-500">
              {backend
                ? 'GIF is limited to 5 seconds at 15fps. Use MP4 for longer exports.'
                : 'GIF is limited to 5 seconds at 15fps. MP4 and PNG sequences are rendered on a server; connect an export backend to enable them.'}
            </p>
          )}
        </div>

        {/* Resolution (MP4/PNG only) */}
        {format !== 'gif' && (
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">
              Resolution
            </label>
            <div className="flex gap-1">
              {(['1080p', '720p', '480p'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  disabled={isExporting}
                  className={`
                    flex-1 rounded border px-2 py-1 text-xs transition-colors
                    ${quality === q
                      ? 'border-orbit-accent bg-orbit-accent-subtle text-orbit-accent'
                      : 'border-orbit-border text-orbit-text-secondary hover:text-orbit-text'}
                    ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FPS */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">
            Frame Rate: {fps} fps
          </label>
          <OrbitSlider
            value={fps}
            min={15}
            max={format === 'gif' ? 15 : 60}
            step={15}
            onChange={setFps}
            disabled={isExporting}
          />
        </div>

        {/* Trim */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-medium uppercase tracking-wider text-orbit-text-tertiary">
            Trim ({trimStart.toFixed(1)}s - {trimEnd.toFixed(1)}s)
          </label>
          <div className="flex items-center gap-2">
            <OrbitSlider
              value={trimStart}
              min={0}
              max={trimEnd - 0.5}
              step={0.1}
              onChange={setTrimStart}
              disabled={isExporting}
            />
            <span className="text-xs text-orbit-text-tertiary">to</span>
            <OrbitSlider
              value={trimEnd}
              min={trimStart + 0.5}
              max={maxDuration}
              step={0.1}
              onChange={setTrimEnd}
              disabled={isExporting}
            />
          </div>
        </div>

        {/* Preview */}
        {previewUrl && (
          <div className="rounded border border-orbit-border bg-orbit-canvas-bg p-2">
            <video
              src={previewUrl}
              controls
              className="w-full rounded"
              style={{ maxHeight: 200 }}
            />
          </div>
        )}

        {/* Progress */}
        {(isExporting || jobStatus === 'processing') && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-orbit-text-secondary">
                {jobStatus === 'capturing' && 'Capturing frames...'}
                {jobStatus === 'uploading' && 'Uploading frames...'}
                {jobStatus === 'processing' && 'Processing on server...'}
              </span>
              <span className="text-xs font-medium text-orbit-accent">{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-orbit-border">
              <div
                className="h-full rounded-full bg-orbit-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Preview button */}
        {!isExporting && jobStatus !== 'processing' && (
          <OrbitButton variant="ghost" size="sm" onClick={handlePreview} disabled={!canvas}>
            Record Preview
          </OrbitButton>
        )}
      </div>
    </OrbitDialog>
  );
};

export const VideoExportModal = React.memo(VideoExportModalInner);
