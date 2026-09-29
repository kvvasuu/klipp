import type { Vec3 } from 'math';
import type { Vector3 } from 'three';
import type { DampingConstant } from '../../core/damping/Damper';
import { createVector3DamperState, dampVector3, resetVector3Damper } from '../../core/damping/dampVector3';

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
