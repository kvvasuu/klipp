import { Damper, type DampingConstant } from '../damping/Damper';
import { shortestWrappedDelta } from './shortestWrappedDelta';

export type InputAxisRecentering = {
  enabled: boolean;
  /** Seconds of no incoming delta before recentering starts. */
  wait: number;
  /** Seconds to ease back to `center` once recentering starts. */
  time: number;
};

/**
 * A single shaped input value - azimuth, elevation, pan, whatever a controller feeds a raw delta into.
 * Brother of `Damper`: zero-alloc, framework-agnostic, `update(dt)` called once per frame. Doesn't
 * collect input itself - something upstream (an `InputAxisController`) calls `applyDelta` with an
 * already gain-shaped value.
 */
export class InputAxis {
  value: number;
  center: number;
  range: [number, number] | null;
  wrap: boolean;
  recentering: InputAxisRecentering;
  damping: DampingConstant = 0;
  maxSpeed = Infinity;

  private rawValue: number;
  private idleTime = 0;
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
    this.rawValue = this.clampOrWrap(this.rawValue + delta);
    this.idleTime = 0;
  };

  /** Advances the idle timer, eases `value` toward the raw target (or, once `recentering.wait` seconds
   *  have passed since the last `applyDelta`, toward `center` instead) - shortest way around when `wrap`.
   *  Call once per frame regardless of whether `applyDelta` ran this frame. */
  update = (dt: number): void => {
    this.idleTime += dt;
    const isRecentering = this.recentering.enabled && this.idleTime >= this.recentering.wait;

    let dampTarget: number;
    let dampTime: DampingConstant;
    if (isRecentering) {
      dampTarget =
        this.wrap && this.range ? this.value + shortestWrappedDelta(this.value, this.center, this.range) : this.center;
      dampTime = this.recentering.time;
    } else {
      dampTarget =
        this.wrap && this.range
          ? this.value + shortestWrappedDelta(this.value, this.rawValue, this.range)
          : this.rawValue;
      dampTime = this.damping;
    }

    this.value = this.clampOrWrap(this.damper.update(this.value, dampTarget, dampTime, dt, this.maxSpeed));

    if (isRecentering) this.rawValue = this.value;
  };

  private clampOrWrap(value: number): number {
    if (!this.range) return value;
    const [min, max] = this.range;
    if (this.wrap) {
      const span = max - min;
      return min + ((((value - min) % span) + span) % span);
    }
    return Math.min(max, Math.max(min, value));
  }
}
