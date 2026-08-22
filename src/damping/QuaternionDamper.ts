import { Quaternion } from 'three';
import { Damper, type DampingConstant } from './Damper';

const scratchOutInverse = new Quaternion();
const scratchDelta = new Quaternion();
const scratchStep = new Quaternion();

/**
 * SmoothDamp-style damping for a whole rotation, gimbal-lock-free (unlike per-axis Euler damping, which
 * isn't built yet). Each call, the SHORTEST rotation from
 * `out`'s current value to `target` is split into axis + angle, and only the angle is run through a
 * `Damper` — same critically-damped feel as position damping, without denormalizing the quaternion.
 * Recomputing the delta fresh off `out`'s current value every call (not a frozen reference) is what keeps
 * this jump-free for a continuously moving `target`.
 */
export class QuaternionDamper {
  private readonly damper = new Damper();

  update(out: Quaternion, target: Quaternion, damping: DampingConstant, dt: number): Quaternion {
    if (typeof damping === 'number' && damping <= 0) return out.copy(target);

    // delta * out = target, solved for delta — the shortest rotation from "out" to "target"
    scratchOutInverse.copy(out).invert();
    scratchDelta.copy(target).multiply(scratchOutInverse);
    if (scratchDelta.w < 0) scratchDelta.set(-scratchDelta.x, -scratchDelta.y, -scratchDelta.z, -scratchDelta.w);

    const angle = 2 * Math.acos(Math.min(1, Math.max(-1, scratchDelta.w)));
    if (angle < 1e-5) {
      this.damper.velocity = 0;
      return out.copy(target);
    }

    const dampedAngle = this.damper.update(0, angle, damping, dt);
    const halfSin = Math.sin(angle / 2); // == sqrt(1 - w²), guaranteed > 0 here (angle >= 1e-5)
    const dampedHalfSin = Math.sin(dampedAngle / 2);
    scratchStep.set(
      (scratchDelta.x / halfSin) * dampedHalfSin,
      (scratchDelta.y / halfSin) * dampedHalfSin,
      (scratchDelta.z / halfSin) * dampedHalfSin,
      Math.cos(dampedAngle / 2),
    );
    return out.premultiply(scratchStep);
  }
}
