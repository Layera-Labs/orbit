# Video

Orbit supports HTML5 video layers rendered directly on the canvas using `fabric.Image(videoElement)`.

## Adding Video

### Via API

```ts
engine.addLayer({
  type: 'video',
  name: 'Background Video',
  x: 0, y: 0, width: 1080, height: 1080,
  rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  visible: true, locked: false, blendMode: 'normal', effects: [],
  content: {
    type: 'video',
    src: 'https://example.com/video.mp4',
    duration: 10.5,
    volume: 1,
    muted: false,
    loop: false,
    autoplay: false,
  },
});
```

### Via UI

Click a video in the Videos panel to add it to the canvas. Videos show a duration badge and a play icon overlay.

## Playback Controls

```ts
engine.playVideo('video-layer-id');
engine.pauseVideo('video-layer-id');
engine.seekVideo('video-layer-id', 5.0); // Seek to 5 seconds
engine.playAllVideos();
engine.pauseAllVideos();
```

## Video Properties

| Property | Description |
|----------|-------------|
| `src` | Video URL |
| `duration` | Duration in seconds |
| `volume` | 0-1 |
| `muted` | Boolean |
| `loop` | Boolean |
| `autoplay` | Boolean |

## Timeline

The Timeline component shows video tracks (V1, V2) with layer indicators. Use the master play/pause button and seek scrubber to control all videos simultaneously.

## Transitions

Apply transitions to video layers for smooth in/out effects. See [Transitions](/guide/transitions) for details.

## Video Export

Export designs with video layers to MP4, GIF, or PNG sequence. See [Export](/guide/export) for details.

### Limitations

- Client-side GIF export is capped at **5 seconds / 15 fps**. For longer animations, export as MP4.
- Video layers are rendered frame-by-frame during export for pixel-perfect WYSIWYG output.
- MP4 export requires backend processing; client generates frames, backend encodes to H.264.

### Performance Tips

- Use `loop: false` for one-shot videos to prevent unnecessary rendering
- Mute videos you don't need audio from
- Limit to 2-3 video layers for smooth playback
