import { Vector3 } from 'three';
import { Vector3Damper } from './Vector3Damper';

const scratchRawVelocity = new Vector3();

/**
 * Tracks a moving point's velocity to extrapolate ahead of it. Smooths FASTER while the raw velocity is
 * shrinking than while it's growing, so a decelerating point stops carrying a stale, overshooting
 * prediction, while a sudden burst of speed doesn't yank the predicted point forward instantly.
 */
export class Predictor {
  readonly velocity = new Vector3();

  private readonly previousPosition = new Vector3();
  private readonly velocityDamper = new Vector3Damper();
  private hasPosition = false;

  /** Feeds one frame's raw position sample. `smoothing` is a smooth-time budget (seconds) split
   *  asymmetrically between the slowing/growing cases above - `0` tracks raw velocity exactly, with no
   *  smoothing at all. */
  addPosition(position: Vector3, dt: number, smoothing: number): void {
    if (!this.hasPosition) {
      this.hasPosition = true;
      this.previousPosition.copy(position);
      return;
    }

    dt = Math.max(0, dt);
    if (dt > 0) {
      scratchRawVelocity.copy(position).sub(this.previousPosition).divideScalar(dt);
      const slowing = scratchRawVelocity.lengthSq() < this.velocity.lengthSq();
      this.velocityDamper.update(this.velocity, scratchRawVelocity, smoothing / (slowing ? 30 : 10), dt);
    }
    this.previousPosition.copy(position);
  }

  /** Extrapolated offset `time` seconds ahead, at the current tracked velocity. Writes into `out`. */
  predictPositionDelta(out: Vector3, time: number): Vector3 {
    return out.copy(this.velocity).multiplyScalar(time);
  }

  /** Forgets tracked velocity/position history and re-arms the first-call skip - for a fresh camera
   *  activation or a retarget, where the next `addPosition` shouldn't compute velocity from a stale point. */
  reset(): void {
    this.velocity.set(0, 0, 0);
    this.velocityDamper.reset();
    this.hasPosition = false;
  }
}
