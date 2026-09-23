import { Vector3 } from 'three';
import { Vector3Damper } from './Vector3Damper';

const scratchRawVelocity = new Vector3();

/** Tracks a moving point's velocity for position extrapolation. */
export class Predictor {
  readonly velocity = new Vector3();

  private readonly previousPosition = new Vector3();
  private readonly velocityDamper = new Vector3Damper();
  private hasPosition = false;

  /** Add a position sample and update the tracked velocity. */
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

  /** Write the predicted offset `time` seconds ahead into `out`. */
  predictPositionDelta(out: Vector3, time: number): Vector3 {
    return out.copy(this.velocity).multiplyScalar(time);
  }

  /** Clear the tracked velocity and position history. */
  reset(): void {
    this.velocity.set(0, 0, 0);
    this.velocityDamper.reset();
    this.hasPosition = false;
  }
}
