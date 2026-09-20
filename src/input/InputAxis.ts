import { Damper } from '../damping/Damper';
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
 * already gain/accel/decel-shaped value.
 */
export class InputAxis {
  value: number;
  center: number;
  range: [number, number] | null;
  wrap: boolean;
  recentering: InputAxisRecentering;

  private idleTime = 0;
  private readonly recenterDamper = new Damper();

  constructor(
    value = 0,
    center = 0,
    range: [number, number] | null = null,
    wrap = false,
    recentering: InputAxisRecentering = { enabled: false, wait: 1, time: 1 },
  ) {
    this.value = value;
    this.center = center;
    this.range = range;
    this.wrap = wrap;
    this.recentering = recentering;
    this.recenterDamper.update(value, value, recentering.time, 0);
  }

  applyDelta = (delta: number): void => {
    if (delta === 0) return;
    this.value += delta;
    this.clampOrWrap();
    this.idleTime = 0;
  };

  /** Advances the idle timer and, once `recentering.wait` seconds have passed since the last `applyDelta`,
   *  eases `value` back toward `center` over `recentering.time` - shortest way around when `wrap`. Call
   *  once per frame regardless of whether `applyDelta` ran this frame. */
  update = (dt: number): void => {
    this.idleTime += dt;
    if (!this.recentering.enabled || this.idleTime < this.recentering.wait) return;

    const target =
      this.wrap && this.range ? this.value + shortestWrappedDelta(this.value, this.center, this.range) : this.center;
    this.value = this.recenterDamper.update(this.value, target, this.recentering.time, dt);
    this.clampOrWrap();
  };

  private clampOrWrap(): void {
    if (!this.range) return;
    const [min, max] = this.range;
    if (this.wrap) {
      const span = max - min;
      this.value = min + ((((this.value - min) % span) + span) % span);
    } else {
      this.value = Math.min(max, Math.max(min, this.value));
    }
  }
}
