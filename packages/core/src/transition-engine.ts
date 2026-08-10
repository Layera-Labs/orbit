/**
 * TransitionEngine — Computes time-based transition overrides for layers
 * Supports fade, slide (4 directions), zoom in/out with easing
 */

import type { TransitionType, EasingType, Layer } from '@layera-labs/orbit-shared';

export interface TransitionState {
  opacity?: number;
  scaleX?: number;
  scaleY?: number;
  x?: number;
  y?: number;
}

export class TransitionEngine {
  private readonly SLIDE_DISTANCE = 100;

  computeLayerState(layer: Layer, layerTime: number, layerDuration: number): TransitionState | null {
    const inState = this.computeInTransition(layer, layerTime);
    const outState = this.computeOutTransition(layer, layerTime, layerDuration);

    if (!inState && !outState) return null;

    // Merge: out transition takes precedence if both active (rare edge case)
    return { ...inState, ...outState };
  }

  private computeInTransition(layer: Layer, time: number): TransitionState | null {
    const t = layer.transitionIn;
    if (!t || t.type === 'none' || time < 0 || time > t.duration) return null;

    const progress = this.applyEasing(time / t.duration, t.easing);
    return this.getTransitionValues(t.type, progress, 'in');
  }

  private computeOutTransition(layer: Layer, time: number, duration: number): TransitionState | null {
    const t = layer.transitionOut;
    if (!t || t.type === 'none' || duration <= 0) return null;

    const startTime = duration - t.duration;
    if (time < startTime || time > duration) return null;

    const progress = this.applyEasing(1 - (time - startTime) / t.duration, t.easing);
    return this.getTransitionValues(t.type, progress, 'out');
  }

  private getTransitionValues(type: TransitionType, progress: number, direction: 'in' | 'out'): TransitionState {
    switch (type) {
      case 'fade':
        return { opacity: progress };

      case 'slide-left':
        return direction === 'in'
          ? { x: this.lerp(this.SLIDE_DISTANCE, 0, progress) }
          : { x: this.lerp(0, -this.SLIDE_DISTANCE, 1 - progress) };

      case 'slide-right':
        return direction === 'in'
          ? { x: this.lerp(-this.SLIDE_DISTANCE, 0, progress) }
          : { x: this.lerp(0, this.SLIDE_DISTANCE, 1 - progress) };

      case 'slide-up':
        return direction === 'in'
          ? { y: this.lerp(this.SLIDE_DISTANCE, 0, progress) }
          : { y: this.lerp(0, -this.SLIDE_DISTANCE, 1 - progress) };

      case 'slide-down':
        return direction === 'in'
          ? { y: this.lerp(-this.SLIDE_DISTANCE, 0, progress) }
          : { y: this.lerp(0, this.SLIDE_DISTANCE, 1 - progress) };

      case 'zoom-in':
        return direction === 'in'
          ? { scaleX: progress, scaleY: progress }
          : { scaleX: progress, scaleY: progress };

      case 'zoom-out':
        return direction === 'in'
          ? { scaleX: this.lerp(2, 1, progress), scaleY: this.lerp(2, 1, progress) }
          : { scaleX: progress, scaleY: progress };

      default:
        return {};
    }
  }

  private applyEasing(t: number, easing: EasingType): number {
    const clamped = Math.max(0, Math.min(1, t));
    switch (easing) {
      case 'linear':
        return clamped;
      case 'ease-in':
        return clamped * clamped;
      case 'ease-out':
        return 1 - (1 - clamped) * (1 - clamped);
      case 'ease-in-out':
        return clamped < 0.5
          ? 2 * clamped * clamped
          : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
      default:
        return clamped;
    }
  }

  private lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }
}
