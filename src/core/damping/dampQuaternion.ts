import { clamp, quat, vec3, vec4, type Quat, type Vec3 } from 'math';
import { damp, type DamperState, type DampingConstant } from './Damper';

const scratchOutInverse: Quat = [0, 0, 0, 1];
const scratchDelta: Quat = [0, 0, 0, 1];
const scratchAxis: Vec3 = [0, 0, 0];
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
  vec3.set(scratchAxis, scratchDelta[0] / halfSin, scratchDelta[1] / halfSin, scratchDelta[2] / halfSin);
  return quat.multiply(out, quat.setAxisAngle(scratchStep, scratchAxis, dampedAngle), out);
}
