import { clamp, repeat } from 'math';
import { Damper, type DampingConstant } from '../damping/Damper';
import { shortestWrappedDelta } from './shortestWrappedDelta';

export type InputAxisRecentering = {
  enabled: boolean;
  /** Seconds of no delta/hold before recentering starts. */
  wait: number;
  /** Seconds to ease back to `center` once recentering starts. */
  time: number;
};

/** Shapes an input value with range, wrapping, damping, and recentering. */
export class InputAxis {
  value: number;
  center: number;
  range: [number, number] | null;
  wrap: boolean;
  recentering: InputAxisRecentering;
  damping: DampingConstant = 0;
  maxSpeed = Infinity;
  /** Whether to normalize a wrapped axis after it settles. */
  autoNormalize = false;
  /** Whether the input source is currently held. */
  held = false;

  private rawValue: number;
  private idleTime = 0;
  private hadDelta = false;
  private readonly damper = new Damper();

  constructor(
    value = 0,
    center = 0,
    range: [number, number] | null = null,
    wrap = false,
    recentering: InputAxisRecentering = { enabled: false, wait: 1, time: 1 },
  ) {
    this.value = value;
    this.rawValue = value;
    this.center = center;
    this.range = range;
    this.wrap = wrap;
    this.recentering = recentering;
    this.damper.update(value, value, 0, 0);
  }

  applyDelta = (delta: number): void => {
    if (delta === 0) return;
    this.rawValue = this.wrap ? this.rawValue + delta : this.clamp(this.rawValue + delta);
    this.idleTime = 0;
    this.hadDelta = true;
  };

  /** Advance the axis and apply damping or recentering. */
  update = (dt: number): void => {
    const active = this.held || this.hadDelta;
    this.hadDelta = false;
    if (active) this.idleTime = 0;
    else this.idleTime += dt;
    // Recenter starts on the first idle frame, even when the wait is zero.
    const isRecentering = !active && this.recentering.enabled && this.idleTime >= this.recentering.wait;

    let dampTarget: number;
    let dampTime: DampingConstant;
    if (isRecentering) {
      dampTarget =
        this.wrap && this.range ? this.value + shortestWrappedDelta(this.value, this.center, this.range) : this.center;
      dampTime = this.recentering.time;
    } else {
      dampTarget = this.rawValue;
      dampTime = this.damping;
    }

    const eased = this.damper.update(this.value, dampTarget, dampTime, dt, this.maxSpeed);
    this.value = this.wrap ? eased : this.clamp(eased);

    if (isRecentering) this.rawValue = this.value;

    if (this.autoNormalize && this.value === this.rawValue) this.normalize();
  };

  /** Reset damping so the next update snaps to the raw value. */
  reset = (): void => {
    this.damper.reset();
  };

  /** Wrap `value` and `rawValue` back into `range`. */
  normalize = (): void => {
    if (!this.wrap || !this.range) return;
    const [min, max] = this.range;
    const span = max - min;
    this.value = min + repeat(this.value - min, span);
    this.rawValue = min + repeat(this.rawValue - min, span);
  };

  private clamp(value: number): number {
    return this.range ? clamp(value, this.range[0], this.range[1]) : value;
  }
}
