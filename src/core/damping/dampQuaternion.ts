import { clamp, quat, vec4, type Quat } from 'math';
import { damp, type DamperState, type DampingConstant } from './Damper';

const scratchOutInverse: Quat = [0, 0, 0, 1];
const scratchDelta: Quat = [0, 0, 0, 1];
const scratchStep: Quat = [0, 0, 0, 1];

/** Damps `out` toward `target` along the shortest angular delta. Mutates and returns `out`. */
export function dampQuaternion(
  state: DamperState,
  out: Quat,
  target: Quat,
  damping: DampingConstant,
  dt: number,
  maxSpeed = Infinity,
): Quat {
  if (typeof damping === 'number' && damping <= 0) return vec4.copy(out, target);

  // Compute the shortest rotation from out to target.
  quat.conjugate(scratchOutInverse, out);
  quat.multiply(scratchDelta, target, scratchOutInverse);
  if (scratchDelta[3] < 0) vec4.negate(scratchDelta, scratchDelta);

  const angle = 2 * Math.acos(clamp(scratchDelta[3], -1, 1));
  if (angle < 1e-5) {
    // Keep the spring state ready for a later reset.
    state.value = 0;
    damp(state, 0, damping, dt);
    state.velocity = 0;
    return vec4.copy(out, target);
  }

  state.value = 0;
  const dampedAngle = damp(state, angle, damping, dt, maxSpeed).value;
  const halfSin = Math.sin(angle / 2);
  const dampedHalfSin = Math.sin(dampedAngle / 2);
  vec4.set(
    scratchStep,
    (scratchDelta[0] / halfSin) * dampedHalfSin,
    (scratchDelta[1] / halfSin) * dampedHalfSin,
    (scratchDelta[2] / halfSin) * dampedHalfSin,
    Math.cos(dampedAngle / 2),
  );
  return quat.multiply(out, scratchStep, out);
}
