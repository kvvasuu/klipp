import { clamp } from 'math';
import { Quaternion } from 'three';
import { Damper, type DampingConstant } from './Damper';

const scratchOutInverse = new Quaternion();
const scratchDelta = new Quaternion();
const scratchStep = new Quaternion();

/** Damps a quaternion along its shortest angular delta. */
export class QuaternionDamper {
  private readonly damper = new Damper();

  update(out: Quaternion, target: Quaternion, damping: DampingConstant, dt: number, maxSpeed = Infinity): Quaternion {
    if (typeof damping === 'number' && damping <= 0) return out.copy(target);

    // Compute the shortest rotation from out to target.
    scratchOutInverse.copy(out).invert();
    scratchDelta.copy(target).multiply(scratchOutInverse);
    if (scratchDelta.w < 0) scratchDelta.set(-scratchDelta.x, -scratchDelta.y, -scratchDelta.z, -scratchDelta.w);

    const angle = 2 * Math.acos(clamp(scratchDelta.w, -1, 1));
    if (angle < 1e-5) {
      // Keep the spring state ready for a later reset.
      this.damper.update(0, 0, damping, dt);
      this.damper.velocity = 0;
      return out.copy(target);
    }

    const dampedAngle = this.damper.update(0, angle, damping, dt, maxSpeed);
    const halfSin = Math.sin(angle / 2);
    const dampedHalfSin = Math.sin(dampedAngle / 2);
    scratchStep.set(
      (scratchDelta.x / halfSin) * dampedHalfSin,
      (scratchDelta.y / halfSin) * dampedHalfSin,
      (scratchDelta.z / halfSin) * dampedHalfSin,
      Math.cos(dampedAngle / 2),
    );
    return out.premultiply(scratchStep);
  }

  /** Reset the underlying angle spring. */
  reset(): void {
    this.damper.reset();
  }
}
