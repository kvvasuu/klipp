import { clamp, repeat } from 'math';
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
 * A single shaped value - azimuth, elevation, pan, whatever needs range/wrap/damping/recentering.
 * Brother of `Damper`: zero-alloc, framework-agnostic, `update(dt)` called once per frame. Doesn't
 * collect input itself - `applyDelta` takes an already gain-shaped value from whatever drives it, an
 * `InputAxisController` for drag input or any other caller.
 */
export class InputAxis {
  value: number;
  center: number;
  range: [number, number] | null;
  wrap: boolean;
  recentering: InputAxisRecentering;
  damping: DampingConstant = 0;
  maxSpeed = Infinity;
  /** Calls `normalize()` automatically once the axis is idle and settled. Default `false`. */
  autoNormalize = false;

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
    this.rawValue = this.wrap ? this.rawValue + delta : this.clamp(this.rawValue + delta);
    this.idleTime = 0;
  };

  /** Advances the idle timer, eases `value` toward the raw target (or, once `recentering.wait` seconds
   *  have passed since the last `applyDelta`, toward `center` instead, shortest way around when `wrap`).
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
      dampTarget = this.rawValue;
      dampTime = this.damping;
    }

    const eased = this.damper.update(this.value, dampTarget, dampTime, dt, this.maxSpeed);
    this.value = this.wrap ? eased : this.clamp(eased);

    if (isRecentering) this.rawValue = this.value;

    if (this.autoNormalize && this.value === this.rawValue) this.normalize();
  };

  /** See `Damper.reset` - re-arms the first-call snap, so the next `update()` jumps to `rawValue`. */
  reset = (): void => {
    this.damper.reset();
  };

  /** Folds `value`/`rawValue` back inside `range` (mod its span). Call between drags, not mid-motion. */
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
