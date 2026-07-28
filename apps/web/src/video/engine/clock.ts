/**
 * The project clock. Nothing else in the engine reads `performance.now()`.
 *
 * Time is derived, not accumulated, so a dropped frame or a slow composite
 * cannot make playback drift away from the timeline.
 */
export class PlaybackClock {
  private origin = 0;
  private base = 0;
  private running = false;

  constructor(private readonly duration: number) {}

  get playing(): boolean {
    return this.running;
  }

  /** Current timeline position in seconds, clamped to the project. */
  now(): number {
    const t = this.running ? this.base + (performance.now() - this.origin) / 1000 : this.base;
    return Math.max(0, Math.min(this.duration, t));
  }

  /** True once playback has run past the end. */
  get ended(): boolean {
    return this.running && this.base + (performance.now() - this.origin) / 1000 >= this.duration;
  }

  play(): void {
    if (this.running) return;
    // Restart from the top rather than sticking at the end.
    if (this.base >= this.duration - 0.001) this.base = 0;
    this.origin = performance.now();
    this.running = true;
  }

  pause(): void {
    if (!this.running) return;
    this.base = this.now();
    this.running = false;
  }

  seek(t: number): void {
    this.base = Math.max(0, Math.min(this.duration, t));
    this.origin = performance.now();
  }
}
