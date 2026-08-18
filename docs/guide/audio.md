# Audio

> **This page documents v1.** It is accurate: v1 is published, feature-complete
> and in maintenance, and the APIs below are the ones it ships. What it is not
> is the current SDK — new work goes into v2 (`@layera-labs/orbit-model`,
> `-render`, `-providers`, `-editor`), which has a different architecture and a
> different API. Start at [installation](./installation.md) if you are choosing.

Orbit supports multi-track audio mixing for both playback and export.

## Adding Audio

### Via API

```ts
engine.addLayer({
  type: 'audio',
  name: 'Background Music',
  x: 0, y: 0, width: 0, height: 0,
  rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  visible: false, locked: false, blendMode: 'normal', effects: [],
  content: {
    type: 'audio',
    src: 'https://example.com/music.mp3',
    duration: 120,
    volume: 0.5,
    muted: false,
    loop: true,
    trim: { start: 0, end: 60 },
  },
});
```

Audio layers are invisible on the canvas but appear as tracks in the Timeline.

## Audio Controls

```ts
engine.playVideo('audio-layer-id'); // Audio uses same playback API
engine.pauseVideo('audio-layer-id');
engine.seekVideo('audio-layer-id', 10.0);
```

## Audio Properties

| Property | Description |
|----------|-------------|
| `src` | Audio URL |
| `duration` | Total duration in seconds |
| `volume` | 0-1 per track |
| `muted` | Boolean |
| `loop` | Boolean |
| `trim` | `{ start: number, end: number }` |

## Multi-Track Mixing

The `AudioManager` mixes all active audio tracks into a single output:

- Each track has independent volume, mute, trim, and loop
- Tracks sync with the master playback time
- `getMaxVideoDuration()` returns the longest duration for timeline sizing

## Audio Export (WAV)

Export the entire mix as a WAV file client-side:

```ts
const { blob, duration } = await engine.exportAudio({
  duration: 60,
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});

const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'mix.wav';
a.click();
```

The `AudioMixer` uses `OfflineAudioContext` to:
1. Fetch and decode all audio files
2. Apply trim, volume, and loop settings
3. Mix tracks into a single PCM 16-bit WAV buffer

### MP3 Export

MP3 export requires backend FFmpeg processing. Use the video export flow with `format: 'mp3'` to queue a backend job.

## Sync with Video

Audio tracks automatically sync with the master timeline scrubber and video playback. When you seek the timeline, all audio tracks seek to the same position.

## Performance Tips

- Use compressed audio formats (MP3, AAC) for source files
- Trim audio to the exact needed duration to reduce memory usage during export
- Mute unused tracks instead of deleting them for quick A/B testing
