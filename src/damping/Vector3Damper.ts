import { vec3, type Vec3 } from 'math';
import type { Vector3 } from 'three';
import { createDamperState, damp, resetDamper, type DamperState, type DampingConstant } from './Damper';

/** One damper per Cartesian component. */
export type Vector3DamperState = { x: DamperState; y: DamperState; z: DamperState };

export const createVector3DamperState = (): Vector3DamperState => ({
  x: createDamperState(),
  y: createDamperState(),
  z: createDamperState(),
});

/** Reset all three component dampers. */
export function resetVector3Damper(state: Vector3DamperState): void {
  resetDamper(state.x);
  resetDamper(state.y);
  resetDamper(state.z);
}

/** Damps the components of `out` toward `target` independently. Mutates and returns `out`. */
export function dampVector3(
  state: Vector3DamperState,
  out: Vec3,
  target: Vec3,
  damping: DampingConstant,
  dt: number,
  maxSpeed = Infinity,
): Vec3 {
  if (typeof damping === 'number' && damping <= 0) return vec3.copy(out, target);

  state.x.value = out[0];
  state.y.value = out[1];
  state.z.value = out[2];
  out[0] = damp(state.x, target[0], damping, dt, maxSpeed).value;
  out[1] = damp(state.y, target[1], damping, dt, maxSpeed).value;
  out[2] = damp(state.z, target[2], damping, dt, maxSpeed).value;
  return out;
}

const scratchOut: Vec3 = [0, 0, 0];
const scratchTarget: Vec3 = [0, 0, 0];

/** Stateful wrapper over `dampVector3` for three.js vectors. */
export class Vector3Damper {
  readonly state = createVector3DamperState();

  update(out: Vector3, target: Vector3, damping: DampingConstant, dt: number, maxSpeed = Infinity): Vector3 {
    dampVector3(this.state, out.toArray(scratchOut), target.toArray(scratchTarget), damping, dt, maxSpeed);
    return out.fromArray(scratchOut);
  }

  /** Reset all three component dampers. */
  reset(): void {
    resetVector3Damper(this.state);
  }
}
