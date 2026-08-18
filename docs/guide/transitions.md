# Transitions

> **This page documents v1.** It is accurate: v1 is published, feature-complete
> and in maintenance, and the APIs below are the ones it ships. What it is not
> is the current SDK — new work goes into v2 (`@layera-labs/orbit-model`,
> `-render`, `-providers`, `-editor`), which has a different architecture and a
> different API. Start at [installation](./installation.md) if you are choosing.
>
> Note also that these are LAYER transitions — a layer entering or leaving. They
> are not the same thing as the clip transitions in `@layera-labs/orbit-video`,
> which cut between two clips on a timeline and come in 21 families / 51 types
> built on ffmpeg `xfade`.

Transitions create smooth animated effects when layers appear or disappear during video playback and export.

## Transition Types

| Type | Description |
|------|-------------|
| `fade` | Opacity 0 → 1 |
| `slide-left` | Enters from right |
| `slide-right` | Enters from left |
| `slide-up` | Enters from bottom |
| `slide-down` | Enters from top |
| `zoom-in` | Scales from 0.5 → 1 |
| `zoom-out` | Scales from 1.5 → 1 |
| `none` | No transition |

## Easing Curves

| Easing | Curve |
|--------|-------|
| `linear` | Constant speed |
| `ease-in` | Slow start |
| `ease-out` | Slow end |
| `ease-in-out` | Slow start and end |

## Applying Transitions

### Via API

```ts
engine.updateLayer('layer-id', {
  transitionIn: {
    type: 'fade',
    duration: 1.0,
    easing: 'ease-in-out',
  },
  transitionOut: {
    type: 'slide-left',
    duration: 0.5,
    easing: 'ease-out',
  },
});
```

### Via Properties Panel

Select a layer and open the Properties panel. Under "Transitions", configure In and Out transitions with type, duration, and easing.

## How It Works

The `TransitionEngine` computes per-layer opacity, scale, and position overrides based on the current playback time:

- **In transition**: Active from `0` to `transitionIn.duration`
- **Out transition**: Active from `layer.duration - transitionOut.duration` to `layer.duration`

These overrides are applied to the renderer during playback and baked into exported frames via the `beforeFrame` callback.

## Example

A 5-second video layer with a 1-second fade-in and 0.5-second slide-out:

- **0.0s - 1.0s**: Fades in from opacity 0
- **1.0s - 4.5s**: Fully visible, no transition effect
- **4.5s - 5.0s**: Slides out to the left

## Export

Transitions are automatically applied during:
- Canvas playback (real-time)
- GIF export (frame-by-frame)
- MP4 export (frame-by-frame, backend encoded)
- PNG sequence export (frame-by-frame)

## Limitations

- Transitions apply to video and audio layers only (images/shapes/text have no duration concept)
- Audio transitions currently affect volume only (fade in/out)
- Maximum transition duration is the layer's total duration
