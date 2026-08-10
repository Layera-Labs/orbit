/**
 * AudioMixer — Client-side audio mixing using Web Audio API
 * Mixes multiple audio tracks with trim, volume, and offset into a single output
 */

import type { AudioTrackSource } from '@layera-labs/orbit-shared';

export interface AudioMixResult {
  blob: Blob;
  duration: number;
}

export class AudioMixer {
  async mix(options: {
    tracks: AudioTrackSource[];
    duration: number;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  }): Promise<AudioMixResult> {
    const { tracks, duration, onProgress, signal } = options;

    if (tracks.length === 0) {
      throw new Error('No audio tracks to mix');
    }

    const sampleRate = 48000;
    const offlineContext = new OfflineAudioContext({
      numberOfChannels: 2,
      length: Math.ceil(duration * sampleRate),
      sampleRate,
    });

    // Decode and schedule all tracks
    const decodePromises = tracks.map(async (track, index) => {
      if (signal?.aborted) throw new Error('Mix aborted');

      try {
        const response = await fetch(track.src);
        if (!response.ok) throw new Error(`Failed to fetch audio: ${track.src}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await offlineContext.decodeAudioData(arrayBuffer);

        if (track.muted) return;

        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;

        // Trim
        const trimStart = Math.max(0, track.trimStart || 0);
        const trimEnd = Math.min(audioBuffer.duration, track.trimEnd || audioBuffer.duration);
        const loopDuration = trimEnd - trimStart;

        if (loopDuration <= 0) return;

        source.loop = track.loop;
        source.loopStart = trimStart;
        source.loopEnd = trimEnd;

        // Volume
        const gainNode = offlineContext.createGain();
        gainNode.gain.value = track.volume;

        source.connect(gainNode);
        gainNode.connect(offlineContext.destination);

        // Schedule
        const offset = track.offset || 0;
        const startTime = offset;
        const sourceStartOffset = track.loop ? trimStart : 0;

        if (track.loop) {
          source.start(startTime, sourceStartOffset);
          // Stop after duration
          source.stop(Math.min(startTime + duration, offlineContext.length / sampleRate));
        } else {
          const playDuration = Math.min(loopDuration, duration - offset);
          if (playDuration > 0) {
            source.start(startTime, trimStart, playDuration);
          }
        }
      } catch (err) {
        console.warn(`Failed to mix track ${index}:`, err);
      }
    });

    await Promise.all(decodePromises);

    if (signal?.aborted) throw new Error('Mix aborted');

    // Render
    onProgress?.(0.5);
    const renderedBuffer = await offlineContext.startRendering();
    onProgress?.(0.9);

    // Convert to WAV blob
    const blob = this.bufferToWavBlob(renderedBuffer);
    onProgress?.(1);

    return { blob, duration };
  }

  abort(): void {
    // OfflineAudioContext can't be truly aborted mid-render
    // The signal parameter in mix() prevents starting new work
  }

  private bufferToWavBlob(buffer: AudioBuffer): Blob {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const arrayBuffer = new ArrayBuffer(headerLength + dataLength);
    const view = new DataView(arrayBuffer);

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels
    const channels: Float32Array[] = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
